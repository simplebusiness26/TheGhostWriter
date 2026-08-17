import {
  InMemoryStore,
  createLiveGhostWriter,
  liveGhostWriterConfigFromEnv
} from "../dist/src/index.js";

const store = new InMemoryStore();
const ghostWriter = createLiveGhostWriter(store, liveGhostWriterConfigFromEnv());

const result = await ghostWriter.processor.processForContent({
  projectId: "the-ghost-writer",
  source: "chatgpt",
  sessionId: "ghost-writer-live-intelligence-first-run-2026-08-16",
  title: "Building Ghost Writer's real Recorder, Story Finder and Writer intelligence",
  text: [
    "We started this session with Ghost Writer able to ingest and save work sessions, but its Recorder, Story Finder and Writer were still demo implementations.",
    "The goal was to make the command 'send this session to Ghost Writer' actually understand the work and turn it into content.",
    "We built a live model-backed Recorder that extracts the factual situation, goal, action, reason, result, next step and lesson while code retains control of truth state and evidence identity.",
    "We built a live Story Finder that can use recent project Journey Memory and is allowed to decide there is no worthwhile story.",
    "We built an X-first Writer that receives the verified story and supporting journey rather than the raw session alone.",
    "We replaced the demo contextual security reviewer with a live model-backed reviewer while keeping deterministic secret scanning and fail-closed behavior.",
    "We added a provider-specific OpenAI Responses API client behind provider-neutral agent contracts, strict structured outputs, per-agent model configuration, and a one-call processForContent route.",
    "Mocked live-provider tests cover the full session-to-secured-draft path, no-story behavior, truth and evidence guardrails, structured output requests, and fail-closed security-provider failure.",
    "We also added GitHub Actions checks. The OpenAI API key was then added to the repository's GitHub Actions secrets as OPENAI_API_KEY without putting the key in source code or chat.",
    "The live model path has now been built but this run is the first real API-backed content-generation test. Nothing has been approved or published yet.",
    "The next step is to inspect the factual Journey record, the story it chooses, the first draft it writes, and then tune the content style before enabling publishing."
  ].join("\n\n"),
  truthState: "tested",
  privacy: "content_eligible",
  contentEligible: true,
  sourceReference: "https://github.com/simplebusiness26/TheGhostWriter/pull/1"
});

const safeResult = {
  pipelineState: result.pipeline.state,
  journey: result.journey ? {
    situation: result.journey.situation,
    goal: result.journey.goal ?? null,
    action: result.journey.action ?? null,
    reason: result.journey.reason ?? null,
    result: result.journey.result ?? null,
    nextStep: result.journey.nextStep ?? null,
    lesson: result.journey.lesson ?? null,
    truthState: result.journey.truthState
  } : null,
  story: result.story ? {
    story: result.story.story,
    lesson: result.story.lesson ?? null,
    whyItMatters: result.story.whyItMatters ?? null,
    status: result.story.status
  } : null,
  draft: result.draft?.content ?? null,
  security: result.security ? {
    outcome: result.security.outcome,
    findings: result.security.findings
  } : null
};

console.log("GHOST_WRITER_RESULT_START");
console.log(JSON.stringify(safeResult, null, 2));
console.log("GHOST_WRITER_RESULT_END");
