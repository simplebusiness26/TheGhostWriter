import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Approval, DraftVersion, JourneyEntry, PipelineRecord, Publication, SecurityScan, StoryCandidate, WorkEvent } from "../domain/types.js";
import type { MemoryStore } from "./store.js";

interface MemorySnapshotV1 {
  schemaVersion: 1;
  savedAt: string;
  events: WorkEvent[];
  journeyEntries: JourneyEntry[];
  storyCandidates: StoryCandidate[];
  drafts: DraftVersion[];
  scans: SecurityScan[];
  approvals: Approval[];
  publications: Publication[];
  pipelines: PipelineRecord[];
  dedupeKeys: string[];
}

export class PersistentMemoryStore implements MemoryStore {
  readonly events = new Map<string, WorkEvent>();
  readonly journeyEntries = new Map<string, JourneyEntry>();
  readonly storyCandidates = new Map<string, StoryCandidate>();
  readonly drafts = new Map<string, DraftVersion>();
  readonly scans = new Map<string, SecurityScan>();
  readonly approvals = new Map<string, Approval>();
  readonly publications = new Map<string, Publication>();
  readonly pipelines = new Map<string, PipelineRecord>();
  readonly dedupeKeys = new Set<string>();
  readonly filePath: string;

  constructor(filePath = resolve(process.cwd(), "data", "ghost-writer-memory.json")) {
    this.filePath = resolve(filePath);
    this.load();
  }

  addEvent(event: WorkEvent): void {
    if (this.dedupeKeys.has(event.dedupeKey)) throw new Error(`Duplicate event rejected: ${event.dedupeKey}`);
    this.dedupeKeys.add(event.dedupeKey);
    this.events.set(event.id, event);
  }

  persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const snapshot: MemorySnapshotV1 = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      events: [...this.events.values()],
      journeyEntries: [...this.journeyEntries.values()],
      storyCandidates: [...this.storyCandidates.values()],
      drafts: [...this.drafts.values()],
      scans: [...this.scans.values()],
      approvals: [...this.approvals.values()],
      publications: [...this.publications.values()],
      pipelines: [...this.pipelines.values()],
      dedupeKeys: [...this.dedupeKeys]
    };
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryPath, this.filePath);
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Ghost Writer memory is not valid JSON: ${String(error)}`);
    }
    if (!isMemorySnapshotV1(parsed)) throw new Error("Unsupported or corrupt Ghost Writer memory snapshot");
    for (const value of parsed.events) this.events.set(value.id, value);
    for (const value of parsed.journeyEntries) this.journeyEntries.set(value.id, value);
    for (const value of parsed.storyCandidates) this.storyCandidates.set(value.id, value);
    for (const value of parsed.drafts) this.drafts.set(value.id, value);
    for (const value of parsed.scans) this.scans.set(value.id, value);
    for (const value of parsed.approvals) this.approvals.set(value.id, value);
    for (const value of parsed.publications) this.publications.set(value.id, value);
    for (const value of parsed.pipelines) this.pipelines.set(value.eventId, value);
    for (const value of parsed.dedupeKeys) this.dedupeKeys.add(value);
  }
}

function isMemorySnapshotV1(value: unknown): value is MemorySnapshotV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MemorySnapshotV1>;
  return candidate.schemaVersion === 1
    && Array.isArray(candidate.events)
    && Array.isArray(candidate.journeyEntries)
    && Array.isArray(candidate.storyCandidates)
    && Array.isArray(candidate.drafts)
    && Array.isArray(candidate.scans)
    && Array.isArray(candidate.approvals)
    && Array.isArray(candidate.publications)
    && Array.isArray(candidate.pipelines)
    && Array.isArray(candidate.dedupeKeys);
}
