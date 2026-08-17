# Automatic Ghost Writer Receiver on Cloudflare

Ghost Writer can run as a Cloudflare Worker with durable D1 memory and a Cron Trigger.

## What happens automatically

Every 15 minutes Cloudflare runs the Worker. The Worker:

1. requests the content-eligible queue from AI Factory;
2. validates every packet;
3. stores the packet in D1 before acknowledging it;
4. marks the AI Factory bridge packet consumed only after durable storage succeeds;
5. safely retries packets that were stored but not acknowledged;
6. records each sync run for health/debugging.

The D1 table uses `bridge_id` as a unique key, so repeated delivery is idempotent.

## Cloudflare configuration

The repository includes `wrangler.jsonc` with:

- Worker name: `ghost-writer-receiver`
- entry point: `src/cloudflare-worker.js`
- D1 binding: `DB`
- automatic D1 provisioning (no account-specific database ID is committed)
- `AI_FACTORY_URL` pointing at the live AI Factory Worker
- Cron Trigger: `*/15 * * * *`
- observability enabled

## One-time live setup

1. In Cloudflare Workers & Pages, import the GitHub repository `simplebusiness26/TheGhostWriter`.
2. Use branch `main` and deploy command `npx wrangler deploy`.
3. Deploy. Wrangler/Cloudflare will provision and bind the D1 resource automatically.
4. Open the new `ghost-writer-receiver` Worker → Settings → Variables and Secrets.
5. Add a **Secret** named `AI_FACTORY_KEY` with the exact same value used by the AI Factory Worker.
6. Deploy the secret change.
7. Open the Worker URL followed by `/health`.
8. Healthy production state is `"ready": true` with `d1`, `aiFactoryUrl`, and `aiFactoryKey` all true.

Once ready, no manual queue pulling is required. The Cron Trigger runs every 15 minutes in UTC scheduling semantics.

## Runtime endpoints

- `GET /` — basic service status
- `GET /health` — safe operational health summary
- `POST /api/sync` — protected manual sync; requires `x-ai-factory-key`
- `GET /api/memory?limit=50` — protected recent durable memory; requires `x-ai-factory-key`

## Failure behavior

A packet is never acknowledged before it exists in D1. If D1 storage fails, the packet remains queued in AI Factory. If storage succeeds but acknowledgement fails, the next run recognizes the duplicate from D1 and retries the acknowledgement. This gives the bridge safe at-least-once delivery without duplicate memory entries.
