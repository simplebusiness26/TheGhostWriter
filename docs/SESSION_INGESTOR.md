# Universal Session Ingestor

The Universal Session Ingestor is the single doorway from messy real-world work into Ghost Writer memory.

## What it accepts

A session can arrive as:

- one pasted transcript or note;
- an array of role-labelled messages;
- evidence items such as GitHub references, build notes or other text artifacts;
- any source label (`chatgpt`, `claude`, `coding_agent`, `notes`, `voice_transcript`, `github`, etc.).

All inputs become the same canonical `work_session` event before entering the existing Recorder/Journey pipeline.

## Safety and truth rules

- `projectId` is explicit for now. The ingestor does not guess the project.
- Secrets are sanitized before capture and again by the normal capture boundary.
- Prompt-injection-like text is flagged but treated only as evidence.
- Completion is never inferred from confident wording. Without an explicit truth state or `completionConfirmed: true`, the session is stored as `in_progress`.
- Sessions default to `internal`. They only enter the public-content pipeline when explicitly marked content-eligible.
- Stable session fingerprints make ingestion idempotent: submitting the same session twice returns the existing event instead of duplicating memory.

## Separation of responsibilities

The ingestor does not decide the story, lesson or social post. It creates a clean, traceable packet. The Recorder remains responsible for factual compression, then the existing Story Finder, Writer, Security and human-approval stages continue normally.

This keeps source adapters simple: future ChatGPT, Claude, GitHub, voice or file connectors only need to convert their data into `UniversalSessionInput`.
