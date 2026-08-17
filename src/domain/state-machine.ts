import type { PipelineState } from "./types.js";

const allowedTransitions: Record<PipelineState, readonly PipelineState[]> = {
  captured: ["recorded"],
  recorded: ["no_story", "story_candidate"],
  no_story: [],
  story_candidate: ["drafted"],
  drafted: ["security_review"],
  security_review: ["security_passed", "blocked"],
  security_passed: ["human_approved", "rejected", "drafted"],
  blocked: ["drafted", "rejected"],
  human_approved: ["publish_queued", "drafted"],
  rejected: [],
  publish_queued: ["published"],
  published: []
};

export function canTransition(from: PipelineState, to: PipelineState): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: PipelineState, to: PipelineState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid pipeline transition: ${from} -> ${to}`);
  }
}
