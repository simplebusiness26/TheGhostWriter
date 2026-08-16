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
- Recorder, Story Finder, Writer and Security agent interfaces;
- deterministic secret sanitization and prompt-injection signalling;
- fail-closed contextual security review;
- enforced pipeline state machine;
- human approval tied to an exact draft version;
- publication queue gating;
- a Universal Session Ingestor for pasted transcripts, message arrays, notes and evidence references.

The session ingestor deliberately requires an explicit project for now, defaults uncertain work to `in_progress`, defaults sessions to internal unless explicitly content-eligible, and does not infer completion from confident wording alone.

## Run checks

```bash
npm install
npm test
```

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/JOURNEY_MEMORY.md`](docs/JOURNEY_MEMORY.md), and [`docs/SESSION_INGESTOR.md`](docs/SESSION_INGESTOR.md).

## Next step

Feed a real work session through the ingestor and connect a live model adapter behind the existing Recorder/Story/Writer interfaces so Ghost Writer can turn our real session into its first genuine journey entry and secured X draft.
