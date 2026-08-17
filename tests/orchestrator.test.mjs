import test from "node:test";
import assert from "node:assert/strict";
import {
  GhostWriterOrchestrator,
  InMemoryStore,
  demoRecorder,
  demoSecurityReviewer,
  demoStoryFinder,
  demoWriter
} from "../dist/src/index.js";

function makeSystem(overrides = {}) {
  let counter = 0;
  return new GhostWriterOrchestrator(new InMemoryStore(), {
    recorder: demoRecorder,
    storyFinder: demoStoryFinder,
    writer: demoWriter,
    securityReviewer: demoSecurityReviewer,
    now: () => "2026-08-16T15:00:00.000Z",
    id: () => `id-${++counter}`,
    ...overrides
  });
}

function captureCompleted(system, rawText = "We completed the first working pipeline.") {
  return system.capture({
    projectId: "ghost-writer",
    source: "manual",
    eventType: "work_session",
    occurredAt: "2026-08-16T15:00:00.000Z",
    truthState: "completed",
    privacy: "content_eligible",
    contentEligible: true,
    rawText,
    dedupeKey: `manual:${rawText}`
  });
}

test("runs a real event through recording, story, writing and security", async () => {
  const system = makeSystem();
  const event = captureCompleted(system);
  const pipeline = await system.process(event.id);
  assert.equal(pipeline.state, "security_passed");
  assert.ok(pipeline.journeyEntryId);
  assert.ok(pipeline.storyCandidateId);
  assert.ok(pipeline.draftVersionId);
  assert.ok(pipeline.securityScanId);
});

test("planned work does not become a fake achievement", async () => {
  const system = makeSystem();
  const event = system.capture({
    projectId: "ghost-writer",
    source: "manual",
    eventType: "idea",
    occurredAt: "2026-08-16T15:00:00.000Z",
    truthState: "planned",
    privacy: "content_eligible",
    contentEligible: true,
    rawText: "We plan to connect X publishing later.",
    dedupeKey: "manual:planned-x"
  });
  const pipeline = await system.process(event.id);
  assert.equal(pipeline.state, "no_story");
  assert.equal(pipeline.draftVersionId, undefined);
});

test("private work cannot enter the public content pipeline", async () => {
  const system = makeSystem();
  const event = system.capture({
    projectId: "ghost-writer",
    source: "manual",
    eventType: "private_note",
    occurredAt: "2026-08-16T15:00:00.000Z",
    truthState: "completed",
    privacy: "private",
    contentEligible: false,
    rawText: "Private internal note",
    dedupeKey: "manual:private"
  });
  await assert.rejects(() => system.process(event.id), /content-ineligible/);
});

test("security fails closed when contextual review fails", async () => {
  const system = makeSystem({
    securityReviewer: { async review() { throw new Error("reviewer down"); } }
  });
  const event = captureCompleted(system, "A safe-looking draft.");
  const pipeline = await system.process(event.id);
  assert.equal(pipeline.state, "blocked");
  assert.throws(() => system.approve(event.id, "Craig"), /security-passed/);
});

test("editing an approved draft invalidates approval and forces security again", async () => {
  const system = makeSystem();
  const event = captureCompleted(system, "We completed a secure milestone.");
  await system.process(event.id);
  const approval = system.approve(event.id, "Craig");
  assert.ok(approval.id);
  const edited = await system.editDraft(event.id, "Updated wording after approval.");
  const pipeline = system.store.pipelines.get(event.id);
  assert.equal(edited.version, 2);
  assert.equal(pipeline.state, "security_passed");
  assert.equal(pipeline.approvalId, undefined);
});

test("publication cannot be queued before exact human approval", async () => {
  const system = makeSystem();
  const event = captureCompleted(system, "We finished another milestone.");
  await system.process(event.id);
  assert.throws(() => system.queuePublication(event.id), /human-approved/);
  system.approve(event.id, "Craig");
  const publication = system.queuePublication(event.id);
  assert.equal(publication.status, "queued");
});

test("duplicate ingestion is rejected", () => {
  const system = makeSystem();
  captureCompleted(system, "Same event");
  assert.throws(() => captureCompleted(system, "Same event"), /Duplicate event rejected/);
});

test("secret-bearing draft is redacted before approval", async () => {
  const system = makeSystem({
    writer: {
      async write(candidate) {
        return {
          storyCandidateId: candidate.id,
          platform: "x",
          content: "We shipped it. password=supersecretvalue",
          evidence: candidate.evidence
        };
      }
    }
  });
  const event = captureCompleted(system, "We shipped the feature.");
  const pipeline = await system.process(event.id);
  const draft = system.store.drafts.get(pipeline.draftVersionId);
  const scan = system.store.scans.get(pipeline.securityScanId);
  assert.equal(pipeline.state, "security_passed");
  assert.equal(scan.outcome, "redacted");
  assert.match(draft.content, /REDACTED/);
  assert.doesNotMatch(draft.content, /supersecretvalue/);
});
