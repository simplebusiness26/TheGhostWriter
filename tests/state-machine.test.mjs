import test from "node:test";
import assert from "node:assert/strict";
import { assertTransition, canTransition } from "../dist/src/domain/state-machine.js";

test("allows only the intended pipeline order", () => {
  assert.equal(canTransition("captured", "recorded"), true);
  assert.equal(canTransition("drafted", "published"), false);
  assert.equal(canTransition("security_passed", "human_approved"), true);
  assert.equal(canTransition("human_approved", "publish_queued"), true);
});

test("rejects stage skipping", () => {
  assert.throws(() => assertTransition("drafted", "human_approved"), /Invalid pipeline transition/);
  assert.throws(() => assertTransition("security_review", "published"), /Invalid pipeline transition/);
});
