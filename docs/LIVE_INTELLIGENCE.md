# Live Intelligence

## Purpose

The live intelligence layer turns a content-eligible work session into a factual Journey entry, decides whether there is a worthwhile story, writes one X-first draft, and performs contextual security review.

The manual trigger is intended to be:

**SESSION → INGEST → RECORDER → JOURNEY → STORY FINDER → WRITER → SECURITY → HUMAN APPROVAL**

Publishing is still outside this step.

## Roles

### Recorder

Reads the sanitized session plus recent project memory and extracts:

- situation;
- goal;
- action;
- reason;
- result;
- next step;
- lesson when supported.

The Recorder is not allowed to choose the event truth state or create evidence IDs. Those remain controlled by code.

### Story Finder

Reads the new Journey entry in the context of the project timeline and decides whether there is a real story worth communicating. Returning no story is a valid outcome.

### Writer

Receives the verified story, supporting Journey entries, and evidence. It creates one X-first draft without inventing facts, results, numbers, quotes, or drama.

### Security Reviewer

Runs after deterministic secret scanning. It reviews the draft for contextual exposure such as private information, private infrastructure, private URLs, sensitive operational details, or material clearly intended to remain internal.

If contextual security fails or is unavailable, the existing orchestrator fails closed and the draft cannot be approved.

## Provider boundary

`OpenAIResponsesClient` is the only provider-specific HTTP layer. Recorder, Story Finder, Writer, Security, ingestion, memory, approval, and publication rules remain behind provider-neutral interfaces.

This means another model provider can later be added without rewriting the Ghost Writer pipeline.

## Structured outputs

Every live model role uses a strict JSON schema. The model returns structured fields; domain records are then constructed in code. Evidence identity and truth state are never accepted from model output.

## Memory context

The Recorder receives up to the 10 most recent Journey entries for the project. The Story Finder sees the current project timeline. The Writer sees the Journey entries supporting its candidate story.

This is deliberately bounded so context remains useful without repeatedly sending the entire project history to the model.

## Configuration

Required runtime secret:

- `OPENAI_API_KEY`

Optional configuration:

- `GHOSTWRITER_MODEL`
- `GHOSTWRITER_RECORDER_MODEL`
- `GHOSTWRITER_STORY_MODEL`
- `GHOSTWRITER_WRITER_MODEL`
- `GHOSTWRITER_SECURITY_MODEL`
- `GHOSTWRITER_OPENAI_BASE_URL`

The shared default model is `gpt-5.6`. Role-specific model settings exist so quality/cost can be tuned later without architecture changes.

## Privacy

The live client sends `store: false` on model requests. Raw credentials should never enter the request because ingestion sanitizes obvious secrets before durable capture and before the intelligence layer sees the session.
