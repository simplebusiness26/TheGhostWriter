const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return healthResponse(env);
    }

    if (request.method === "POST" && url.pathname === "/api/sync") {
      if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
      try {
        const result = await syncFromFactory(env);
        return json({ ok: true, ...result });
      } catch (error) {
        return json({ ok: false, error: errorMessage(error) }, 500);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/memory") {
      if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
      await ensureSchema(env.DB);
      const limit = clampLimit(Number(url.searchParams.get("limit") || 50));
      const result = await env.DB.prepare(
        `SELECT bridge_id, project_id, source, session_id, title, text, truth_state,
                occurred_at, received_at, status
           FROM ghostwriter_memory
          ORDER BY received_at DESC
          LIMIT ?1`
      ).bind(limit).all();
      return json({ count: result.results?.length ?? 0, entries: result.results ?? [] });
    }

    return json({
      service: "ghost-writer-receiver",
      status: "running",
      automaticSync: true,
      schedule: "every 15 minutes",
      health: "/health"
    });
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      syncFromFactory(env).catch((error) => {
        console.error("Ghost Writer scheduled sync failed", error);
      })
    );
  }
};

export async function syncFromFactory(env) {
  requireEnv(env);
  await ensureSchema(env.DB);

  const startedAt = new Date().toISOString();
  const summary = {
    pulled: 0,
    stored: 0,
    duplicates: 0,
    consumed: 0,
    failures: 0,
    startedAt,
    finishedAt: null,
    errors: []
  };

  try {
    const queueResponse = await fetch(`${normalizeBaseUrl(env.AI_FACTORY_URL)}/api/ghostwriter-bridge/queue`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-ai-factory-key": env.AI_FACTORY_KEY
      }
    });

    if (!queueResponse.ok) {
      throw new Error(`AI Factory queue request failed: HTTP ${queueResponse.status}`);
    }

    const payload = await queueResponse.json();
    if (!payload || !Array.isArray(payload.packets)) {
      throw new Error("AI Factory returned an invalid bridge queue payload");
    }

    summary.pulled = payload.packets.length;

    for (const rawPacket of payload.packets) {
      let packet;
      try {
        packet = validatePacket(rawPacket);
        const existing = await env.DB.prepare(
          "SELECT bridge_id, status FROM ghostwriter_memory WHERE bridge_id = ?1"
        ).bind(packet.bridgeId).first();

        if (existing) {
          summary.duplicates += 1;
        } else {
          await storePacket(env.DB, packet);
          summary.stored += 1;
        }

        const consumeResponse = await fetch(
          `${normalizeBaseUrl(env.AI_FACTORY_URL)}/api/ghostwriter-bridge/${packet.bridgeId}/consume`,
          {
            method: "POST",
            headers: {
              accept: "application/json",
              "x-ai-factory-key": env.AI_FACTORY_KEY
            }
          }
        );

        if (!consumeResponse.ok) {
          throw new Error(`consume failed for bridge ${packet.bridgeId}: HTTP ${consumeResponse.status}`);
        }

        await env.DB.prepare(
          "UPDATE ghostwriter_memory SET status = 'consumed', consumed_at = ?1 WHERE bridge_id = ?2"
        ).bind(new Date().toISOString(), packet.bridgeId).run();
        summary.consumed += 1;
      } catch (error) {
        summary.failures += 1;
        summary.errors.push({
          bridgeId: packet?.bridgeId ?? rawPacket?.bridgeId ?? null,
          error: errorMessage(error)
        });
      }
    }
  } catch (error) {
    summary.failures += 1;
    summary.errors.push({ bridgeId: null, error: errorMessage(error) });
  }

  summary.finishedAt = new Date().toISOString();
  await recordSyncRun(env.DB, summary);
  return summary;
}

export async function ensureSchema(db) {
  if (!db) throw new Error("D1 binding DB is required");
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ghostwriter_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bridge_id INTEGER NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      source TEXT NOT NULL,
      session_id TEXT,
      title TEXT,
      text TEXT NOT NULL,
      truth_state TEXT,
      privacy TEXT NOT NULL,
      content_eligible INTEGER NOT NULL,
      occurred_at TEXT,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      packet_json TEXT NOT NULL,
      received_at TEXT NOT NULL,
      consumed_at TEXT,
      status TEXT NOT NULL DEFAULT 'captured'
    );
    CREATE INDEX IF NOT EXISTS idx_ghostwriter_memory_project
      ON ghostwriter_memory(project_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ghostwriter_memory_status
      ON ghostwriter_memory(status, received_at DESC);
    CREATE TABLE IF NOT EXISTS ghostwriter_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      pulled INTEGER NOT NULL,
      stored INTEGER NOT NULL,
      duplicates INTEGER NOT NULL,
      consumed INTEGER NOT NULL,
      failures INTEGER NOT NULL,
      errors_json TEXT NOT NULL DEFAULT '[]'
    );
  `);
}

async function storePacket(db, packet) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO ghostwriter_memory (
       bridge_id, project_id, source, session_id, title, text, truth_state,
       privacy, content_eligible, occurred_at, evidence_json, packet_json,
       received_at, status
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'captured')`
  ).bind(
    packet.bridgeId,
    packet.projectId,
    packet.source,
    packet.sessionId ?? null,
    packet.title ?? null,
    packet.text,
    packet.truthState ?? null,
    packet.privacy,
    packet.contentEligible ? 1 : 0,
    packet.occurredAt ?? null,
    JSON.stringify(packet.evidence ?? []),
    JSON.stringify(packet),
    now
  ).run();
}

async function recordSyncRun(db, summary) {
  await db.prepare(
    `INSERT INTO ghostwriter_sync_runs (
       started_at, finished_at, pulled, stored, duplicates, consumed, failures, errors_json
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).bind(
    summary.startedAt,
    summary.finishedAt,
    summary.pulled,
    summary.stored,
    summary.duplicates,
    summary.consumed,
    summary.failures,
    JSON.stringify(summary.errors)
  ).run();
}

async function healthResponse(env) {
  const checks = {
    worker: true,
    d1: Boolean(env.DB),
    aiFactoryUrl: Boolean(env.AI_FACTORY_URL),
    aiFactoryKey: Boolean(env.AI_FACTORY_KEY)
  };

  let memoryCount = null;
  let lastSync = null;
  if (env.DB) {
    try {
      await ensureSchema(env.DB);
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM ghostwriter_memory").first();
      memoryCount = Number(count?.count ?? 0);
      lastSync = await env.DB.prepare(
        `SELECT started_at, finished_at, pulled, stored, duplicates, consumed, failures
           FROM ghostwriter_sync_runs
          ORDER BY id DESC LIMIT 1`
      ).first();
    } catch (error) {
      checks.d1 = false;
      checks.d1Error = errorMessage(error);
    }
  }

  const ready = checks.worker && checks.d1 && checks.aiFactoryUrl && checks.aiFactoryKey;
  return json({
    service: "ghost-writer-receiver",
    ready,
    automaticSync: true,
    schedule: "*/15 * * * *",
    checks,
    memoryCount,
    lastSync
  }, ready ? 200 : 503);
}

export function validatePacket(value) {
  if (!value || typeof value !== "object") throw new Error("bridge packet must be an object");
  if (!Number.isInteger(value.bridgeId) || value.bridgeId <= 0) throw new Error("bridgeId must be a positive integer");
  if (typeof value.projectId !== "string" || !value.projectId.trim()) throw new Error(`bridge ${value.bridgeId} missing projectId`);
  if (typeof value.source !== "string" || !value.source.trim()) throw new Error(`bridge ${value.bridgeId} missing source`);
  if (typeof value.text !== "string" || !value.text.trim()) throw new Error(`bridge ${value.bridgeId} missing text`);
  if (value.privacy !== "content_eligible" || value.contentEligible !== true) {
    throw new Error(`bridge ${value.bridgeId} is not content eligible`);
  }
  return value;
}

function requireEnv(env) {
  if (!env.DB) throw new Error("D1 binding DB is required");
  if (!env.AI_FACTORY_URL?.trim()) throw new Error("AI_FACTORY_URL is required");
  if (!env.AI_FACTORY_KEY?.trim()) throw new Error("AI_FACTORY_KEY is required");
}

function authorized(request, env) {
  const expected = env.AI_FACTORY_KEY?.trim();
  if (!expected) return false;
  const supplied = request.headers.get("x-ai-factory-key")?.trim();
  return supplied === expected;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function clampLimit(value) {
  if (!Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(200, Math.floor(value)));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}
