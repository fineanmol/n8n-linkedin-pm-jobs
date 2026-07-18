#!/usr/bin/env python3
"""
LinkedIn Proxy Server
---------------------
Runs as a sidecar container alongside n8n.
Accepts: GET /fetch?url=<encoded_linkedin_url>[&li_at=<session_cookie>]
Returns: raw HTML from LinkedIn using curl (bypasses TLS fingerprint blocking)

Also: GET /check-status?url=<...>&li_at=<...>&job_id=<numeric_id>
Returns: tiny JSON {job_id, status} — detection happens HERE (Python has plenty
of headroom) instead of shipping the full ~1MB authenticated page back to n8n,
which was blowing n8n's 512MB Node heap when checking many jobs per run.

Pass li_at to make authenticated requests (shows "Applied" status, etc.)

GET /health  →  200 OK  (health check for Docker)
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote, quote
import subprocess, time, re, sys, threading, json

# Rate-limiter for authenticated full-page requests: max 1 request per window
_RATE_LOCK = threading.Lock()
_LAST_AUTH_REQUEST = 0
_AUTH_DELAY_SECS = 2.5  # pause between authenticated full-view requests

# ── Status detection ─────────────────────────────────────────────────────────
# NOTE: free-text scanning (e.g. "applied on company site") turned out to be
# unreliable — that phrase is boilerplate button-label text present on EVERY
# external-apply job page regardless of whether the viewer applied, and caused
# a 100% false-positive rate. The reliable signal is LinkedIn's own structured
# state embedded in the page's hydration payload:
#   jdpapplystate_<jobid> -> stringvalue: "initial" (not applied) | "applied" (applied)
#   jobdetailspage_closedstate_<jobid> -> booleanvalue: true (closed/expired)
# Confirmed against a real applied job (jdpapplystate="applied") and an
# untouched job (jdpapplystate="initial", closedstate=false).
_EXPIRED_TEXT_SIGNALS = [
    'no longer accepting applications',
    'job is no longer available',
    'this listing has expired',
    'position has been filled',
    'job has been closed',
    'posting has expired',
]


def _detect_status(html_bytes: bytes, job_id: str) -> str:
    """Returns 'Applied' | 'No Longer Available' | 'Unknown'."""
    body = html_bytes.decode('utf-8', errors='ignore').lower()
    numeric_id = re.sub(r'\D', '', job_id or '')

    if numeric_id:
        # Structured "did I apply" signal (most reliable)
        m = re.search(
            r'jdpapplystate_' + re.escape(numeric_id) + r'.{0,80}?stringvalue\\?"\s*:\s*\\?"(\w+)\\?"',
            body, re.DOTALL,
        )
        if m and m.group(1) not in ('initial', 'notapplied', 'none', ''):
            return 'Applied'

        # Structured "is job closed" signal
        m2 = re.search(
            r'jobdetailspage_closedstate_' + re.escape(numeric_id) + r'.{0,200}?booleanvalue\\?"\s*:\s*true',
            body, re.DOTALL,
        )
        if m2:
            return 'No Longer Available'

    # Fallback: plain-text expiry banners (used only if the structured field
    # above wasn't found, e.g. page layout changed)
    for sig in _EXPIRED_TEXT_SIGNALS:
        if sig in body:
            return 'No Longer Available'

    return 'Unknown'


class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        path = urlparse(self.path).path

        # Health check endpoint
        if path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'OK')
            return

        # Fetch endpoint
        if path == '/fetch':
            self._handle_fetch()
            return

        # Status-check endpoint (small JSON response, no huge HTML payload)
        if path == '/check-status':
            self._handle_check_status()
            return

        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'Not found')

    def _fetch_html(self, url: str, li_at: str) -> bytes:
        """Rate-limited curl fetch. Returns raw response bytes (may be empty on error)."""
        if li_at:
            global _LAST_AUTH_REQUEST
            with _RATE_LOCK:
                wait = _AUTH_DELAY_SECS - (time.time() - _LAST_AUTH_REQUEST)
                if wait > 0:
                    time.sleep(wait)
                _LAST_AUTH_REQUEST = time.time()

        auth_label = ' [auth]' if li_at else ''
        print(f'[{time.strftime("%H:%M:%S")}] Fetching{auth_label}: {url[:120]}', flush=True)

        cmd = [
            'curl', '-s', '-L', '--max-time', '25', '--compressed',
            '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '-H', 'Accept: text/html,application/xhtml+xml,*/*;q=0.8',
            '-H', 'Accept-Language: en-US,en;q=0.9',
            '-H', 'Referer: https://www.linkedin.com/jobs/search/',
        ]
        if li_at:
            cmd += ['-H', f'Cookie: li_at={li_at}; JSESSIONID="ajax:0"']
        cmd.append(url)

        result = subprocess.run(cmd, capture_output=True, timeout=30)
        print(f'  → {len(result.stdout)} bytes (rc={result.returncode})', flush=True)
        return result.stdout

    def _handle_check_status(self):
        query = parse_qs(urlparse(self.path).query)
        raw   = query.get('url', [''])[0]
        url   = unquote(raw)
        job_id = query.get('job_id', [''])[0]
        li_at_raw = query.get('li_at', [''])[0]
        INVALID = {'', 'undefined', 'null', 'none', 'false', 'nan'}
        li_at = li_at_raw if (li_at_raw and li_at_raw.lower() not in INVALID and len(li_at_raw) > 20) else ''

        if not url:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'job_id': job_id, 'status': 'Unknown', 'error': 'missing url'}).encode())
            return

        try:
            html = self._fetch_html(url, li_at)
            status = _detect_status(html, job_id) if html else 'Unknown'
            payload = json.dumps({'job_id': job_id, 'status': status, 'bytes': len(html)}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except subprocess.TimeoutExpired:
            print('  → TIMEOUT', flush=True)
            payload = json.dumps({'job_id': job_id, 'status': 'Unknown', 'error': 'timeout'}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:
            print(f'  → ERROR: {exc}', flush=True)
            payload = json.dumps({'job_id': job_id, 'status': 'Unknown', 'error': str(exc)}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(payload)

    def _handle_fetch(self):
        query  = parse_qs(urlparse(self.path).query)
        raw    = query.get('url', [''])[0]
        url    = unquote(raw)
        li_at_raw = query.get('li_at', [''])[0]
        # Only accept li_at if it looks like a real LinkedIn session token
        # (reject JS serialisation artefacts like "undefined", "null", etc.)
        INVALID = {'', 'undefined', 'null', 'none', 'false', 'nan'}
        li_at = li_at_raw if (li_at_raw and li_at_raw.lower() not in INVALID and len(li_at_raw) > 20) else ''

        # Re-encode spaces / special chars inside the LinkedIn query-string
        if '?' in url:
            base, qs = url.split('?', 1)
            qs = re.sub(r'=([^&]+)', lambda m: '=' + quote(m.group(1), safe='%+'), qs)
            url = base + '?' + qs

        if not url:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Bad request: missing url param')
            return

        auth_label = ' [auth]' if li_at else ''

        # Rate-limit authenticated requests to avoid LinkedIn blocking bulk checks
        if li_at:
            global _LAST_AUTH_REQUEST
            with _RATE_LOCK:
                wait = _AUTH_DELAY_SECS - (time.time() - _LAST_AUTH_REQUEST)
                if wait > 0:
                    time.sleep(wait)
                _LAST_AUTH_REQUEST = time.time()

        print(f'[{time.strftime("%H:%M:%S")}] Fetching{auth_label}: {url[:120]}', flush=True)

        # Build curl command — add cookie header when li_at is provided
        cmd = [
            'curl', '-s', '-L', '--max-time', '25', '--compressed',
            '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '-H', 'Accept: text/html,application/xhtml+xml,*/*;q=0.8',
            '-H', 'Accept-Language: en-US,en;q=0.9',
            '-H', 'Referer: https://www.linkedin.com/jobs/search/',
        ]
        if li_at:
            cmd += ['-H', f'Cookie: li_at={li_at}; JSESSIONID="ajax:0"']

        cmd.append(url)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=30,
            )
            html = result.stdout
            print(f'  → {len(html)} bytes (rc={result.returncode})', flush=True)

            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(html)))
            # Include the original LinkedIn URL so callers can extract the job ID
            self.send_header('X-Fetched-URL', url)
            self.end_headers()
            self.wfile.write(html)

        except subprocess.TimeoutExpired:
            print('  → TIMEOUT', flush=True)
            self.send_response(504)
            self.end_headers()
            self.wfile.write(b'Gateway timeout')
        except Exception as exc:
            print(f'  → ERROR: {exc}', flush=True)
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(exc).encode())

    def log_message(self, fmt, *args):
        pass  # suppress default access log noise


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9877
    server = HTTPServer(('0.0.0.0', port), Handler)
    print(f'LinkedIn proxy listening on :{port}', flush=True)
    server.serve_forever()
