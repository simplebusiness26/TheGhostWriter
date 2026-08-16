# Permanent Journey Memory

Ghost Writer now has a durable internal memory for our own use.

## What is stored

The memory snapshot keeps captured events, journey entries, story candidates, drafts, security scans, approvals, publication state, pipeline state, and deduplication keys together so the agent can restart without losing where it was.

## Safety

Writes use a temporary file followed by an atomic rename. Corrupt or unknown memory versions fail loudly instead of silently resetting the journey. The default memory path is under `data/`, which is excluded from Git.

Captured secrets are sanitized before the event is written to durable memory. The original secret is not intentionally retained in the snapshot.

## Human corrections

`JourneyMemory.correctEntry()` lets us correct the AI's factual record. The corrected version is persisted with who corrected it, when, and an optional note. Future stages should use the corrected journey entry as source truth.

## Useful reads

`getProjectTimeline(projectId)` returns the remembered journey for one project in chronological order.

`getOpenLoops(projectId)` returns unfinished entries that still have a next step, which is how future sessions can reconnect to unresolved work.

## Storage evolution

Agents depend on the `MemoryStore` interface rather than this file format. The file-backed store is deliberately right-sized for our internal agent now; SQLite or Postgres can replace it later without changing Recorder, Story Finder, Writer, Security, or orchestration contracts.
