# AI Factory → Ghost Writer Bridge

This bridge moves content-eligible evidence from AI Factory into Ghost Writer's Universal Session Ingestor without requiring a model-provider API.

## Contract

Ghost Writer reads:

`GET <AI_FACTORY_URL>/api/ghostwriter-bridge/queue`

with header:

`x-ai-factory-key: <AI_FACTORY_KEY>`

AI Factory returns only packets already marked `privacy: content_eligible` and `contentEligible: true`.

After a packet has been successfully ingested, Ghost Writer acknowledges it with:

`POST <AI_FACTORY_URL>/api/ghostwriter-bridge/<bridgeId>/consume`

A packet is never acknowledged when ingestion fails.

## Runtime variables

- `AI_FACTORY_URL` — the live AI Factory Worker URL.
- `AI_FACTORY_KEY` — the same protected write key configured in AI Factory.
- `GHOSTWRITER_MEMORY_PATH` — optional path for Ghost Writer's persistent Journey Memory JSON file.

No OpenAI API key is required for bridge ingestion.

## Manual receiver run

```bash
npm install
AI_FACTORY_URL="https://your-ai-factory.workers.dev" \
AI_FACTORY_KEY="your-secret" \
npm run bridge:pull
```

The command:

1. reads the protected AI Factory queue;
2. validates that every packet is explicitly content-eligible;
3. ingests packets through the Universal Session Ingestor;
4. deduplicates repeated evidence;
5. persists Ghost Writer memory;
6. marks only successfully ingested packets as consumed.

## Automation boundary

The receiver is now runnable and tested, but a recurring runtime still needs somewhere with persistent storage to execute it. Do not run it on an ephemeral scheduler that throws the Journey Memory file away after each run. The future scheduled runtime should preserve `GHOSTWRITER_MEMORY_PATH` or use a durable database-backed memory adapter.

Publishing remains outside this bridge. Human approval and publication gates are unchanged.
