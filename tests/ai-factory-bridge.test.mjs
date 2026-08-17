import test from "node:test";
import assert from "node:assert/strict";
import {
  AiFactoryBridgeClient,
  GhostWriterOrchestrator,
  InMemoryStore,
  UniversalSessionIngestor,
  demoRecorder,
  demoStoryFinder,
  demoWriter,
  demoSecurityReviewer
} from "../dist/src/index.js";

function makeIngestor() {
  let counter = 0;
  const orchestrator = new GhostWriterOrchestrator(new InMemoryStore(), {
    recorder: demoRecorder,
    storyFinder: demoStoryFinder,
    writer: demoWriter,
    securityReviewer: demoSecurityReviewer,
    now: () => "2026-08-17T06:00:00.000Z",
    id: () => `bridge-${++counter}`
  });
  return { orchestrator, ingestor: new UniversalSessionIngestor(orchestrator) };
}

function fakeFetch(queue, calls = []) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/ghostwriter-bridge/queue")) {
      return new Response(JSON.stringify({ count: queue.length, packets: queue }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (/\/api\/ghostwriter-bridge\/\d+\/consume$/.test(String(url))) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  };
}

function queuedPacket(overrides = {}) {
  return {
    bridgeId: 12,
    projectId: "xplorer",
    source: "github",
    sessionId: "github:xplorer:abc123",
    title: "Xplorer build",
    text: "Implemented and tested the next Xplorer change.",
    truthState: "tested",
    privacy: "content_eligible",
    contentEligible: true,
    occurredAt: "2026-08-17T05:30:00.000Z",
    evidence: [{ kind: "github_commit", title: "Commit abc123", text: "Implemented change" }],
    ...overrides
  };
}

test("pulls queued AI Factory evidence into Ghost Writer ingestion and marks it consumed", async () => {
  const calls = [];
  const client = new AiFactoryBridgeClient({
    baseUrl: "https://factory.example.test",
    apiKey: "test-write-key",
    fetchImpl: fakeFetch([queuedPacket()], calls)
  });
  const { orchestrator, ingestor } = makeIngestor();

  const result = await client.pullInto(ingestor);

  assert.equal(result.pulled, 1);
  assert.equal(result.ingested, 1);
  assert.equal(result.consumed, 1);
  assert.equal(result.failed.length, 0);
  assert.equal(orchestrator.store.events.size, 1);
  const event = [...orchestrator.store.events.values()][0];
  assert.equal(event.projectId, "xplorer");
  assert.equal(event.truthState, "tested");
  assert.equal(event.privacy, "content_eligible");
  assert.equal(orchestrator.store.pipelines.get(event.id)?.state, "captured");
  assert.ok(calls.some((call) => call.url.endsWith("/api/ghostwriter-bridge/12/consume")));
  assert.ok(calls.every((call) => call.init.headers?.["x-ai-factory-key"] === "test-write-key"));
});

test("duplicate packets are idempotent and can still be acknowledged", async () => {
  const packet = queuedPacket();
  const client = new AiFactoryBridgeClient({
    baseUrl: "https://factory.example.test/",
    apiKey: "test-write-key",
    fetchImpl: fakeFetch([packet])
  });
  const { ingestor } = makeIngestor();

  const first = await client.pullInto(ingestor);
  assert.equal(first.ingested, 1);

  const secondClient = new AiFactoryBridgeClient({
    baseUrl: "https://factory.example.test",
    apiKey: "test-write-key",
    fetchImpl: fakeFetch([packet])
  });
  const second = await secondClient.pullInto(ingestor);
  assert.equal(second.duplicates, 1);
  assert.equal(second.consumed, 1);
});

test("does not acknowledge a packet when ingestion fails", async () => {
  const calls = [];
  const client = new AiFactoryBridgeClient({
    baseUrl: "https://factory.example.test",
    apiKey: "test-write-key",
    fetchImpl: fakeFetch([queuedPacket()], calls)
  });
  const failingIngestor = {
    ingest() {
      throw new Error("simulated ingestion failure");
    }
  };

  const result = await client.pullInto(failingIngestor);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].error, /simulated ingestion failure/);
  assert.equal(result.consumed, 0);
  assert.equal(calls.filter((call) => call.url.includes("/consume")).length, 0);
});

test("rejects any queue packet that is not explicitly content eligible", async () => {
  const client = new AiFactoryBridgeClient({
    baseUrl: "https://factory.example.test",
    apiKey: "test-write-key",
    fetchImpl: fakeFetch([queuedPacket({ privacy: "internal", contentEligible: false })])
  });
  await assert.rejects(() => client.listQueued(), /not content eligible/);
});

test("requires protected bridge configuration", () => {
  assert.throws(() => new AiFactoryBridgeClient({ baseUrl: "", apiKey: "x" }), /AI_FACTORY_URL/);
  assert.throws(() => new AiFactoryBridgeClient({ baseUrl: "https://example.test", apiKey: "" }), /AI_FACTORY_KEY/);
});
