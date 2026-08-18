import test from "node:test";
import assert from "node:assert/strict";
import { fetchQueuePackets } from "../src/cloudflare-worker.js";

const env = {
  AI_FACTORY_URL: "https://factory.example.test",
  AI_FACTORY_KEY: "secret-key"
};

function packet() {
  return {
    projectId: "ai-factory",
    source: "ai-factory:knowledge-mine",
    sessionId: "knowledge:42",
    title: "Deployment lesson",
    text: "A successful deployment still needs live verification.",
    truthState: "tested",
    privacy: "content_eligible",
    contentEligible: true
  };
}

test("queue 404 falls back to the protected bridge status endpoint", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/ghostwriter-bridge/queue")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    if (String(url).endsWith("/api/ghostwriter-bridge?status=queued")) {
      return Response.json({
        summary: { queued: 1 },
        events: [{ id: 42, packet: packet() }]
      });
    }
    return Response.json({ error: "unexpected" }, { status: 500 });
  };

  try {
    const packets = await fetchQueuePackets(env);
    assert.equal(packets.length, 1);
    assert.equal(packets[0].bridgeId, 42);
    assert.equal(packets[0].contentEligible, true);
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /ghostwriter-bridge\?status=queued$/);
    assert.ok(calls.every((call) => call.init.headers?.["x-ai-factory-key"] === "secret-key"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("non-404 queue failures do not bypass authentication errors", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ error: "unauthorized" }, { status: 401 });
  };

  try {
    await assert.rejects(() => fetchQueuePackets(env), /HTTP 401/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
