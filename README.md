# The Ghost Writer

An agent-first system that turns real work into factual, safe, human-approved content.

## Permanent loop

**WE BUILD → AGENT WATCHES → RECORDS THE JOURNEY → FINDS THE STORY/LESSON → WRITES THE CONTENT → SECURITY FILTER → WE APPROVE → POST**

This repository starts with the agent engine, not a customer-facing app.

## Phase 1

Phase 1 establishes the executable foundation:

- work-event capture and deduplication;
- explicit truth states (`idea` through `published`);
- factual Journey memory contracts;
- Story Finder, Writer and Security agent interfaces;
- deterministic secret sanitization and prompt-injection signalling;
- fail-closed contextual security review;
- enforced pipeline state machine;
- human approval tied to an exact draft version;
- approval invalidation after edits;
- publication queue gate;
- deterministic demo agents so the whole spine can be tested without API keys.

## Run checks

```bash
npm install
npm test
```

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Next phase

Replace the in-memory store with persistent journey memory, add the first real input adapter (manual session ingestion), and connect a real model provider behind the existing Recorder/Story/Writer/Security interfaces. Live X publishing follows only after the security and approval path is proven end-to-end.
