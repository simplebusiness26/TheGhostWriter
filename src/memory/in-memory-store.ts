import type {
  Approval,
  DraftVersion,
  JourneyEntry,
  PipelineRecord,
  Publication,
  SecurityScan,
  StoryCandidate,
  WorkEvent
} from "../domain/types.js";

export class InMemoryStore {
  readonly events = new Map<string, WorkEvent>();
  readonly journeyEntries = new Map<string, JourneyEntry>();
  readonly storyCandidates = new Map<string, StoryCandidate>();
  readonly drafts = new Map<string, DraftVersion>();
  readonly scans = new Map<string, SecurityScan>();
  readonly approvals = new Map<string, Approval>();
  readonly publications = new Map<string, Publication>();
  readonly pipelines = new Map<string, PipelineRecord>();
  readonly dedupeKeys = new Set<string>();

  addEvent(event: WorkEvent): void {
    if (this.dedupeKeys.has(event.dedupeKey)) {
      throw new Error(`Duplicate event rejected: ${event.dedupeKey}`);
    }
    this.dedupeKeys.add(event.dedupeKey);
    this.events.set(event.id, event);
  }
}
