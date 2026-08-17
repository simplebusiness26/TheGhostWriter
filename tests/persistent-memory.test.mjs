import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GhostWriterOrchestrator,
  JourneyMemory,
  PersistentMemoryStore,
  demoRecorder,
  demoSecurityReviewer,
  demoStoryFinder,
  demoWriter
} from "../dist/src/index.js";

function createSystem(filePath) {
  let counter = 0;
  const store = new PersistentMemoryStore(filePath);
  const system = new GhostWriterOrchestrator(store, {
    recorder: demoRecorder,
    storyFinder: demoStoryFinder,
    writer: demoWriter,
    securityReviewer: demoSecurityReviewer,
    now: () => "2026-08-16T16:00:00.000Z",
    id: () => `persist-${++counter}`
  });
  return { store, system };
}

test("journey survives a full process restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ghost-writer-memory-"));
  try {
    const file = join(dir, "memory.json");
    const { system } = createSystem(file);
    const event = system.capture({
      projectId: "designlab",
      source: "manual",
      eventType: "decision",
      occurredAt: "2026-08-16T16:00:00.000Z",
      truthState: "completed",
      privacy: "content_eligible",
      contentEligible: true,
      rawText: "We changed the design rules after the first test.",
      dedupeKey: "designlab:decision:1"
    });
    const pipeline = await system.process(event.id);
    const restarted = new PersistentMemoryStore(file);
    assert.equal(restarted.events.get(event.id)?.projectId, "designlab");
    assert.equal(restarted.pipelines.get(event.id)?.state, "security_passed");
    assert.equal(
      restarted.journeyEntries.get(pipeline.journeyEntryId)?.situation,
      "We changed the design rules after the first test."
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("human corrections become permanent source of truth", () => {
  const dir = mkdtempSync(join(tmpdir(), "ghost-writer-correction-"));
  try {
    const file = join(dir, "memory.json");
    const store = new PersistentMemoryStore(file);
    store.journeyEntries.set("j1", {
      id: "j1",
      projectId: "ghost-writer",
      eventIds: ["e1"],
      situation: "Wrong summary",
      nextStep: "Test memory",
      truthState: "in_progress",
      evidence: [{ eventId: "e1", claim: "source" }],
      correctedByHuman: false,
      createdAt: "2026-08-16T15:00:00.000Z",
      updatedAt: "2026-08-16T15:00:00.000Z"
    });
    store.persist();
    const memory = new JourneyMemory(store, () => "2026-08-16T16:05:00.000Z");
    memory.correctEntry(
      "j1",
      { situation: "Correct summary", lesson: "Keep memory factual" },
      "Craig",
      "Fixed AI misunderstanding"
    );
    const restarted = new PersistentMemoryStore(file);
    const entry = restarted.journeyEntries.get("j1");
    assert.equal(entry?.situation, "Correct summary");
    assert.equal(entry?.lesson, "Keep memory factual");
    assert.equal(entry?.correctedByHuman, true);
    assert.equal(entry?.correction?.correctedBy, "Craig");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("open loops are queryable by project", () => {
  const dir = mkdtempSync(join(tmpdir(), "ghost-writer-loops-"));
  try {
    const store = new PersistentMemoryStore(join(dir, "memory.json"));
    const base = {
      eventIds: ["e1"],
      situation: "Work",
      evidence: [{ eventId: "e1", claim: "source" }],
      correctedByHuman: false,
      createdAt: "2026-08-16T15:00:00.000Z",
      updatedAt: "2026-08-16T15:00:00.000Z"
    };
    store.journeyEntries.set("open", {
      ...base,
      id: "open",
      projectId: "ghost-writer",
      nextStep: "Connect a real session",
      truthState: "in_progress"
    });
    store.journeyEntries.set("done", {
      ...base,
      id: "done",
      projectId: "ghost-writer",
      nextStep: "Nothing",
      truthState: "completed"
    });
    store.journeyEntries.set("other", {
      ...base,
      id: "other",
      projectId: "other-project",
      nextStep: "Other",
      truthState: "planned"
    });
    store.persist();
    const openLoops = new JourneyMemory(store).getOpenLoops("ghost-writer");
    assert.deepEqual(openLoops.map((entry) => entry.id), ["open"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("secret material is sanitized before durable storage", () => {
  const dir = mkdtempSync(join(tmpdir(), "ghost-writer-secret-"));
  try {
    const file = join(dir, "memory.json");
    const { system } = createSystem(file);
    system.capture({
      projectId: "ghost-writer",
      source: "manual",
      eventType: "note",
      occurredAt: "2026-08-16T16:00:00.000Z",
      truthState: "in_progress",
      privacy: "internal",
      contentEligible: false,
      rawText: "password=supersecretvalue",
      dedupeKey: "secret:1"
    });
    const rawFile = readFileSync(file, "utf8");
    assert.doesNotMatch(rawFile, /supersecretvalue/);
    assert.match(rawFile, /REDACTED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
