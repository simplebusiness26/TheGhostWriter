import type { Approval, DraftVersion, JourneyEntry, PipelineRecord, Publication, SecurityScan, StoryCandidate, WorkEvent } from "../domain/types.js";

export interface MemoryStore {
  readonly events: Map<string, WorkEvent>;
  readonly journeyEntries: Map<string, JourneyEntry>;
  readonly storyCandidates: Map<string, StoryCandidate>;
  readonly drafts: Map<string, DraftVersion>;
  readonly scans: Map<string, SecurityScan>;
  readonly approvals: Map<string, Approval>;
  readonly publications: Map<string, Publication>;
  readonly pipelines: Map<string, PipelineRecord>;
  readonly dedupeKeys: Set<string>;
  addEvent(event: WorkEvent): void;
  persist(): void;
}
