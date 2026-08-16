# Phase 1 Architecture

## Product truth

The Ghost Writer is an agent system first. The permanent loop is:

**WE BUILD → AGENT WATCHES → RECORDS THE JOURNEY → FINDS THE STORY/LESSON → WRITES THE CONTENT → SECURITY FILTER → WE APPROVE → POST**

Phase 1 builds the executable spine of that loop. It does not build a customer SaaS shell.

## Boundaries

1. **Capture** accepts untrusted work evidence and sanitizes obvious secrets immediately.
2. **Recorder** converts evidence into factual journey memory. It cannot write public content.
3. **Story Finder** may produce a story candidate or explicitly produce nothing.
4. **Writer** can only write from supplied candidate/evidence.
5. **Security** is a separate mandatory gate and fails closed.
6. **Approval** requires an identified human and is tied to one exact draft version.
7. **Publisher** may only receive a human-approved version. Phase 1 stops at a queued publication object; live X API work comes later.

## Truth states

The domain explicitly distinguishes `idea`, `planned`, `in_progress`, `tested`, `completed`, and `published`. This prevents future plans from silently becoming public claims of completed work.

## Security model

Captured text is data, never authority. Prompt-injection language inside transcripts is flagged and must never change system rules. Obvious credentials are sanitized at ingestion and again before approval. A separate contextual reviewer is required; if that reviewer errors, the pipeline becomes `blocked` rather than assuming safety.

## Persistence

Phase 1 uses `InMemoryStore` intentionally so core rules can be tested without choosing infrastructure too early. The interfaces and domain records are designed so a persistent store can replace it in Phase 2 without changing the agent contracts.

## Agent/provider strategy

Recorder, Story Finder, Writer and Contextual Security Reviewer are interfaces. Demo agents prove the orchestration without external model keys. Real model adapters can be introduced later while preserving the same contracts and tests.

## What Phase 1 proves

- events cannot skip pipeline stages;
- duplicate capture is rejected;
- private/content-ineligible work cannot become public content;
- planned work is not promoted into a completed story by default;
- security can redact known secrets;
- contextual security failure blocks approval;
- AI cannot approve itself;
- editing after approval invalidates approval and re-runs security;
- publication cannot queue without an exact approved draft version.
