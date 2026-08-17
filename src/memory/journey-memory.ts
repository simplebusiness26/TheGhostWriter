import type { JourneyEntry, WorkTruthState } from "../domain/types.js";
import type { MemoryStore } from "./store.js";

export type JourneyCorrectionPatch = Partial<Pick<JourneyEntry, "situation" | "goal" | "action" | "reason" | "result" | "nextStep" | "lesson" | "truthState">>;

export class JourneyMemory {
  constructor(
    private readonly store: MemoryStore,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  getProjectTimeline(projectId: string): JourneyEntry[] {
    return [...this.store.journeyEntries.values()]
      .filter((entry) => entry.projectId === projectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getOpenLoops(projectId: string): JourneyEntry[] {
    return this.getProjectTimeline(projectId)
      .filter((entry) => isOpenTruthState(entry.truthState) && Boolean(entry.nextStep?.trim()));
  }

  getEntry(entryId: string): JourneyEntry {
    const entry = this.store.journeyEntries.get(entryId);
    if (!entry) throw new Error(`Unknown journey entry: ${entryId}`);
    return entry;
  }

  correctEntry(
    entryId: string,
    patch: JourneyCorrectionPatch,
    humanActor: string,
    note?: string
  ): JourneyEntry {
    if (!humanActor.trim()) throw new Error("Human corrector identity is required");
    if (Object.keys(patch).length === 0) throw new Error("Journey correction requires at least one changed field");
    const previous = this.getEntry(entryId);
    const correctedAt = this.now();
    const corrected: JourneyEntry = {
      ...previous,
      ...patch,
      id: previous.id,
      projectId: previous.projectId,
      eventIds: [...previous.eventIds],
      evidence: [...previous.evidence],
      correctedByHuman: true,
      correction: { correctedBy: humanActor, correctedAt, note },
      updatedAt: correctedAt
    };
    this.store.journeyEntries.set(entryId, corrected);
    this.store.persist();
    return corrected;
  }
}

function isOpenTruthState(state: WorkTruthState): boolean {
  return state !== "completed" && state !== "published";
}
