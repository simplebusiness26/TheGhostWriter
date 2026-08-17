import type { DraftVersion, JourneyEntry, SecurityFinding, StoryCandidate, WorkEvent } from "../domain/types.js";

export type RecorderOutput = Omit<
  JourneyEntry,
  "id" | "correctedByHuman" | "correction" | "createdAt" | "updatedAt"
>;

export interface RecorderAgent {
  record(event: WorkEvent): Promise<RecorderOutput>;
}

export interface StoryFinderAgent {
  findStory(entry: JourneyEntry): Promise<Omit<StoryCandidate, "id"> | null>;
}

export interface WriterAgent {
  write(candidate: StoryCandidate): Promise<Omit<DraftVersion, "id" | "version" | "createdAt">>;
}

export interface ContextualSecurityReviewer {
  review(content: string): Promise<{ safe: boolean; findings: SecurityFinding[] }>;
}
