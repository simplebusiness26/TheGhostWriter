import receiver from './cloudflare-worker.js';

const DEFAULT_AI_FACTORY_URL = 'https://ai-factory.simplebussiness26.workers.dev';

function runtimeEnv(env) {
  return {
    ...env,
    AI_FACTORY_URL: String(env?.AI_FACTORY_URL || DEFAULT_AI_FACTORY_URL).trim()
  };
}

export default {
  fetch(request, env, ctx) {
    return receiver.fetch(request, runtimeEnv(env), ctx);
  },

  scheduled(controller, env, ctx) {
    return receiver.scheduled(controller, runtimeEnv(env), ctx);
  }
};
