# The Ghost Writer

An agent-first system that turns real work into factual, safe, human-approved content.

## Permanent loop

**WE BUILD → AGENT WATCHES → RECORDS THE JOURNEY → FINDS THE STORY/LESSON → WRITES THE CONTENT → SECURITY FILTER → WE APPROVE → POST**

This repository starts with the agent engine, not a customer-facing app.

## Current foundation

The working foundation now includes:

- work-event capture and deduplication;
- explicit truth states (`idea` through `published`);
- permanent Journey Memory that survives restarts;
- human-correctable journey records and open-loop retrieval;
- a Universal Session Ingestor for pasted transcripts, message arrays, notes and evidence references;
- live model-backed Recorder intelligence;
- live model-backed Story Finder intelligence that may correctly return no story;
- live model-backed X-first Writer intelligence;
- live contextual Security Reviewer plus deterministic secret scanning;
- project-memory context passed into Recorder, Story Finder and Writer;
- enforced pipeline state machine;
- human approval tied to an exact draft version;
- publication queue gating;
- one `processForContent()` route from real session to secured draft.

The system keeps truth state and evidence identity under code control. A model may interpret what happened, but it cannot silently promote planned work into completed work or invent its own evidence.

## What "send this session to Ghost Writer" means

The intended manual trigger now maps to:

**SESSION → INGEST → RECORDER → JOURNEY MEMORY → STORY FINDER → WRITER → SECURITY → WAIT FOR HUMAN APPROVAL**

It still does **not** auto-publish.

## Live intelligence configuration

Keep real credentials outside source control. Copy `.env.example` into your runtime environment and provide `OPENAI_API_KEY` there. The shared model defaults to `gpt-5.6`; each agent role can be overridden independently later if we want a different quality/cost mix.

## Run checks

```bash
npm install
npm test
```

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/JOURNEY_MEMORY.md`](docs/JOURNEY_MEMORY.md), [`docs/SESSION_INGESTOR.md`](docs/SESSION_INGESTOR.md), and [`docs/LIVE_INTELLIGENCE.md`](docs/LIVE_INTELLIGENCE.md).

## Next step

Use a real API key to run one of our actual sessions through the new live intelligence path, inspect the Journey/Story/Draft output, and then tune the content-writing behaviour before any publishing integration is enabled.
