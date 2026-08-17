import test from "node:test";
import assert from "node:assert/strict";
import { syncFromFactory, validatePacket } from "../src/cloudflare-worker.js";

class FakeDb {
  constructor() {
    this.memory = new Map();
    this.runs = [];
  }

  async exec() {
    return { count: 0, duration: 0 };
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    if (this.sql.startsWith("SELECT bridge_id, status FROM ghostwriter_memory")) {
      return this.db.memory.get(this.args[0]) ?? null;
    }
    if (this.sql.startsWith("SELECT COUNT(*) AS count FROM ghostwriter_memory")) {
      return { count: this.db.memory.size };
    }
    if (this.sql.includes("FROM ghostwriter_sync_runs")) {
      return this.db.runs.at(-1) ?? null;
    }
    return null;
  }

  async all() {
    return { results: [...this.db.memory.values()] };
  }

  async run() {
    if (this.sql.startsWith("INSERT INTO ghostwriter_memory")) {
      const [bridgeId, projectId, source, sessionId, title, text, truthState, privacy, contentEligible, occurredAt] = this.args;
      this.db.memory.set(bridgeId, {
        bridge_id: bridgeId,
        project_id: projectId,
        source,
        session_id: sessionId,
        title,
        text,
        truth_state: truthState,
        privacy,
        content_eligible: contentEligible,
        occurred_at: occurredAt,
        status: "captured"
      });
    } else if (this.sql.startsWith("UPDATE ghostwriter_memory")) {
      const [, bridgeId] = this.args;
      const entry = this.db.memory.get(bridgeId);
      if (entry) entry.status = "consumed";
    } else if (this.sql.startsWith("INSERT INTO ghostwriter_sync_runs")) {
      const [started_at, finished_at, pulled, stored, duplicates, consumed, failures] = this.args;
      this.db.runs.push({ started_at, finished_at, pulled, stored, duplicates, consumed, failures });
    }
    return { success: true };
  }
}

function packet(overrides = {}) {
  return {
    bridgeId: 42,
    projectId: "ai-factory",
    source: "knowledge_mine",
    sessionId: "knowledge:42",
    title: "Deployment lesson",
    text: "A successful deployment still needs route and runtime verification.",
    truthState: "tested",
    privacy: "content_eligible",
    contentEligible: true,
    occurredAt: "2026-08-17T10:00:00.000Z",
    evidence: [{ kind: "knowledge", title: "Deployment Doctor" }],
    ...overrides
  };
}

function env(db) {
  return {
    DB: db,
    AI_FACTORY_URL: "https://factory.example.test",
    AI_FACTORY_KEY: "secret-key"
  };
}

test("scheduled sync stores eligible packets before acknowledging them", async () => {
  const db = new FakeDb();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/ghostwriter-bridge/queue")) {
      return Response.json({ count: 1, packets: [packet()] });
    }
    if (String(url).endsWith("/api/ghostwriter-bridge/42/consume")) {
      assert.equal(db.memory.get(42)?.status, "captured");
      return Response.json({ ok: true });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  };

  try {
    const result = await syncFromFactory(env(db));
    assert.equal(result.pulled, 1);
    assert.equal(result.stored, 1);
    assert.equal(result.consumed, 1);
    assert.equal(result.failures, 0);
    assert.equal(db.memory.get(42)?.status, "consumed");
    assert.equal(db.runs.length, 1);
    assert.ok(calls.every((call) => call.init.headers?.["x-ai-factory-key"] === "secret-key"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("duplicate packets are durable and safely re-acknowledged", async () => {
  const db = new FakeDb();
  db.memory.set(42, { bridge_id: 42, status: "captured" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/queue")) return Response.json({ count: 1, packets: [packet()] });
    return Response.json({ ok: true });
  };

  try {
    const result = await syncFromFactory(env(db));
    assert.equal(result.stored, 0);
    assert.equal(result.duplicates, 1);
    assert.equal(result.consumed, 1);
    assert.equal(db.memory.get(42)?.status, "consumed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("content-ineligible packets are rejected and never acknowledged", async () => {
  const db = new FakeDb();
  let consumeCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/queue")) {
      return Response.json({ count: 1, packets: [packet({ privacy: "internal", contentEligible: false })] });
    }
    consumeCalls += 1;
    return Response.json({ ok: true });
  };

  try {
    const result = await syncFromFactory(env(db));
    assert.equal(result.failures, 1);
    assert.equal(result.consumed, 0);
    assert.equal(db.memory.size, 0);
    assert.equal(consumeCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("packet validation fails closed", () => {
  assert.throws(() => validatePacket({}), /bridgeId/);
  assert.throws(() => validatePacket(packet({ contentEligible: false })), /not content eligible/);
});
