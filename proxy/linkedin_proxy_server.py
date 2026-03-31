#!/usr/bin/env python3
"""
LinkedIn Proxy Server
---------------------
Runs as a sidecar container alongside n8n.
Accepts: GET /fetch?url=<encoded_linkedin_url>
Returns: raw HTML from LinkedIn using curl (bypasses TLS fingerprint blocking)

GET /health  →  200 OK  (health check for Docker)
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote, quote
import subprocess, time, re, sys


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

        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'Not found')

    def _handle_fetch(self):
        query  = parse_qs(urlparse(self.path).query)
        raw    = query.get('url', [''])[0]
        url    = unquote(raw)

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

        print(f'[{time.strftime("%H:%M:%S")}] Fetching: {url[:120]}', flush=True)

        try:
            result = subprocess.run(
                [
                    'curl', '-s', '-L', '--max-time', '25', '--compressed',
                    '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    '-H', 'Accept: text/html,application/xhtml+xml,*/*;q=0.8',
                    '-H', 'Accept-Language: en-US,en;q=0.9',
                    '-H', 'Referer: https://www.linkedin.com/jobs/search/',
                    url,
                ],
                capture_output=True,
                timeout=30,
            )
            html = result.stdout
            print(f'  → {len(html)} bytes (rc={result.returncode})', flush=True)

            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(html)))
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
