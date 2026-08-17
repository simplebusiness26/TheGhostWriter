# The Ghost Writer

An agent-first system that turns real work into factual, safe, human-approved content.

## Permanent loop

**WE BUILD → AGENT WATCHES → RECORDS THE JOURNEY → FINDS THE STORY/LESSON → WRITES THE CONTENT → SECURITY FILTER → WE APPROVE → POST**

This repository starts with the agent engine, not a customer-facing app.

## Current foundation

The working foundation includes:

- work-event capture and deduplication;
- explicit truth states (`idea` through `published`);
- permanent Journey Memory that survives restarts;
- human-correctable journey records and open-loop retrieval;
- Recorder, Story Finder, Writer and Security agent interfaces;
- deterministic secret sanitization and prompt-injection signalling;
- fail-closed security review hooks;
- enforced pipeline state machine;
- human approval tied to an exact draft version;
- publication queue gating;
- a Universal Session Ingestor for transcripts, notes and evidence references;
- an AI Factory bridge receiver that pulls only explicitly content-eligible evidence into Ghost Writer memory and acknowledges it only after successful ingestion.

The AI Factory receiver does **not** require an OpenAI API key and does **not** publish anything.

## Run checks

```bash
npm install
npm test
```

## Pull queued AI Factory evidence

Set `AI_FACTORY_URL` and `AI_FACTORY_KEY`, then run:

```bash
npm run bridge:pull
```

See [`docs/AI_FACTORY_BRIDGE.md`](docs/AI_FACTORY_BRIDGE.md) for the receiver contract and persistence requirements.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/JOURNEY_MEMORY.md`](docs/JOURNEY_MEMORY.md), [`docs/SESSION_INGESTOR.md`](docs/SESSION_INGESTOR.md), and [`docs/AI_FACTORY_BRIDGE.md`](docs/AI_FACTORY_BRIDGE.md).

## Next step

Deploy the deterministic receiver on a runtime with durable Ghost Writer memory, then schedule it to pull AI Factory's queue automatically. Model-backed writing can remain a separate optional layer behind the existing agent interfaces.
