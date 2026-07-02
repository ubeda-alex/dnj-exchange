/**
 * DNJ Exchange — Cloudflare Worker Entry Point
 *
 * Replaces Express + node-cron.
 * - fetch() handles HTTP requests (replaces Express routes)
 * - scheduled() handles the cron trigger (replaces node-cron matchJob)
 */

import { handleUsers }    from './routes/users.js';
import { handleRequests } from './routes/requests.js';
import { runMatcher }     from './services/matcher.js';

// ---------------------------------------------------------------------------
// CORS helper
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function withCors(response) {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(CORS_HEADERS)) r.headers.set(k, v);
  return r;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function router(request, env) {
  const url    = new URL(request.url);
  const path   = url.pathname;
  const method = request.method.toUpperCase();

  // Preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Health check
  if (path === '/api/health') {
    return json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // Users
  if (path.startsWith('/api/users')) {
    return handleUsers(request, env, url);
  }

  // Requests (including match complete)
  if (path.startsWith('/api/requests')) {
    return handleRequests(request, env, url);
  }

  // Push — disabled but keep endpoint so the frontend doesn't crash
  if (path.startsWith('/api/push')) {
    if (path === '/api/push/vapid-public-key') {
      return json({ publicKey: null });
    }
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}

// ---------------------------------------------------------------------------
// Worker export
// ---------------------------------------------------------------------------

export default {
  /**
   * HTTP handler — called for every incoming request.
   */
  async fetch(request, env, _ctx) {
    try {
      const response = await router(request, env);
      return withCors(response);
    } catch (err) {
      console.error('[Worker] Unhandled error:', err.message, err.stack);
      return json({ error: 'Internal server error' }, 500);
    }
  },

  /**
   * Cron handler — called every minute by the Cloudflare trigger.
   * Equivalent to the node-cron matchJob.
   */
  async scheduled(_event, env, _ctx) {
    console.log('[Cron] Tick —', new Date().toISOString());
    try {
      await runMatcher(env.DB);
    } catch (err) {
      console.error('[Cron] Error:', err.message);
    }
  },
};
