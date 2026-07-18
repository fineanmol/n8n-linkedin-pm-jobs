#!/usr/bin/env node
/**
 * HTTP wrapper around composePack() for n8n.
 *
 * Keeps resume/CL layout intact by using the same designer PDF path as pack factory.
 * Requires resume-cv-mvp API on RESUME_API_URL (default http://127.0.0.1:8791).
 *
 *   COMPOSE_PACK_PORT=8792 COMPOSE_PACK_TOKEN=secret node scripts/compose-pack-http.mjs
 *
 * POST /v1/compose_pack
 *   { "job_id", "company", "role", "jd", "status?", "skip_r2?", "skip_sheet?", "sheet_row?" }
 */
import http from 'node:http';
import { composePack } from './agent-compose-pack.mjs';

const PORT = Number(process.env.COMPOSE_PACK_PORT || 8792);
const HOST = process.env.COMPOSE_PACK_HOST || '127.0.0.1';
const TOKEN = process.env.COMPOSE_PACK_TOKEN || '';

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function authorized(req) {
  if (!TOKEN) return true;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const header = req.headers['x-compose-pack-token'] || '';
  return header === TOKEN || bearer === TOKEN;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, {
      ok: true,
      service: 'compose-pack',
      layout: 'designer-locked',
      resumeApi: process.env.RESUME_API_URL || 'http://127.0.0.1:8791',
    });
  }

  if (req.method === 'POST' && url.pathname === '/v1/compose_pack') {
    if (!authorized(req)) return send(res, 401, { ok: false, error: 'Unauthorized' });
    try {
      const body = await readJson(req);
      const result = await composePack(body);
      return send(res, 200, result);
    } catch (err) {
      console.error('[compose-pack]', err);
      return send(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return send(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(
    `compose-pack HTTP listening on http://${HOST}:${PORT} (token ${TOKEN ? 'ON' : 'OFF'})`,
  );
  console.log('POST /v1/compose_pack  GET /health');
});
