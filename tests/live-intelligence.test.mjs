import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryStore,
  createLiveGhostWriter
} from "../dist/src/index.js";

function fakeStructuredFetch(outputs, requests = []) {
  return async (_url, init) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    const next = outputs.shift();

    if (next?.httpError) {
      return new Response(next.body ?? "provider failure", {
        status: next.httpError
      });
    }

    return new Response(JSON.stringify({
      status: "completed",
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify(next)
        }]
      }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
}

function liveSystem(outputs, requests = []) {
  return createLiveGhostWriter(new InMemoryStore(), {
    apiKey: "test-key",
    model: "gpt-5.6",
    baseUrl: "https://example.test/v1",
    fetchImpl: fakeStructuredFetch(outputs, requests)
  });
}

test("a real session reaches journey, story, draft and security through one call", async () => {
  const requests = [];
  const system = liveSystem([
    {
      situation: "Ghost Writer previously stored sessions but still used demo intelligence.",
      goal: "Turn real work sessions into real content.",
      action: "Built live Recorder, Story Finder, Writer and Security agents.",
      reason: "Saving the session alone was not enough.",
      result: "A model-backed intelligence path now exists.",
      nextStep: "Tune the content style before publishing.",
      lesson: "Memory and intelligence are separate jobs."
    },
    {
      hasStory: true,
      story: "We had built Ghost Writer's memory before its real brain.",
      lesson: "A system remembering work is not the same as understanding it.",
      whyItMatters: "The useful step is turning verified work into a narrative automatically.",
      status: "resolved"
    },
    {
      content: "We built Ghost Writer's memory first. Then we hit the obvious problem: it could remember the work, but it still couldn't understand why the work mattered. Today we replaced the demo brain with a real Recorder -> Story Finder -> Writer pipeline."
    },
    {
      safe: true,
      findings: []
    }
  ], requests);

  const result = await system.processor.processForContent({
    projectId: "the-ghost-writer",
    source: "chatgpt",
    sessionId: "real-session-001",
    text: "We built the real intelligence layer after proving ingestion and permanent memory.",
    truthState: "in_progress"
  });

  assert.equal(result.pipeline.state, "security_passed");
  assert.equal(result.journey.truthState, "in_progress");
  assert.equal(result.journey.goal, "Turn real work sessions into real content.");
  assert.match(result.story.story, /real brain/);
  assert.match(result.draft.content, /memory first/);
  assert.equal(result.security.outcome, "safe");
  assert.equal(requests.length, 4);
  assert.ok(requests.every((request) => request.store === false));
  assert.ok(requests.every((request) => request.text.format.type === "json_schema"));
});

test("Story Finder can correctly stop the pipeline when there is no worthwhile story", async () => {
  const system = liveSystem([
    {
      situation: "Minor formatting cleanup.",
      goal: null,
      action: "Changed formatting.",
      reason: null,
      result: "Formatting changed.",
      nextStep: null,
      lesson: null
    },
    {
      hasStory: false,
      story: null,
      lesson: null,
      whyItMatters: null,
      status: "needs_more_information"
    }
  ]);

  const result = await system.processor.processForContent({
    projectId: "the-ghost-writer",
    source: "manual",
    sessionId: "routine-001",
    text: "Adjusted spacing in a note.",
    truthState: "tested"
  });

  assert.equal(result.pipeline.state, "no_story");
  assert.equal(result.draft, undefined);
});

test("contextual security failure blocks the draft rather than approving it", async () => {
  const system = liveSystem([
    {
      situation: "Completed a meaningful implementation.",
      goal: "Build the intelligence path.",
      action: "Implemented it.",
      reason: "Needed real content generation.",
      result: "Implementation completed.",
      nextStep: "Tune writing.",
      lesson: "Keep evidence controlled by code."
    },
    {
      hasStory: true,
      story: "We replaced demo intelligence with live intelligence.",
      lesson: "Evidence control matters.",
      whyItMatters: "It keeps the story truthful.",
      status: "resolved"
    },
    {
      content: "We replaced the demo intelligence with the real system today."
    },
    {
      httpError: 500,
      body: "security model unavailable"
    }
  ]);

  const result = await system.processor.processForContent({
    projectId: "the-ghost-writer",
    source: "chatgpt",
    sessionId: "security-failure-001",
    text: "The live intelligence layer was implemented.",
    completionConfirmed: true
  });

  assert.equal(result.pipeline.state, "blocked");
  assert.equal(result.security.outcome, "blocked");
  assert.ok(result.security.findings.some((finding) => finding.type === "security_service_failure"));
});
