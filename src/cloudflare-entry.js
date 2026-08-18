import receiver from './cloudflare-worker.js';

const DEFAULT_AI_FACTORY_URL = 'https://ai-factory.simplebussiness26.workers.dev';

function runtimeEnv(env) {
  return {
    ...env,
    AI_FACTORY_URL: String(env?.AI_FACTORY_URL || DEFAULT_AI_FACTORY_URL).trim()
  };
}

async function withSyncDiagnostics(response, env) {
  if (!env?.DB) return response;

  try {
    const payload = await response.clone().json();
    const latest = await env.DB.prepare(
      `SELECT errors_json FROM ghostwriter_sync_runs ORDER BY id DESC LIMIT 1`
    ).first();

    let errors = [];
    try {
      errors = JSON.parse(latest?.errors_json || '[]');
    } catch {
      errors = [{ bridgeId: null, error: 'Stored sync error could not be parsed.' }];
    }

    return Response.json(
      { ...payload, lastSyncErrors: errors },
      { status: response.status, headers: { 'cache-control': 'no-store' } }
    );
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const liveEnv = runtimeEnv(env);
    const response = await receiver.fetch(request, liveEnv, ctx);
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return withSyncDiagnostics(response, liveEnv);
    }

    return response;
  },

  scheduled(controller, env, ctx) {
    return receiver.scheduled(controller, runtimeEnv(env), ctx);
  }
};
