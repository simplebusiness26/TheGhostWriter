import type { DraftVersion, JourneyEntry, SecurityFinding, StoryCandidate, WorkEvent } from "../domain/types.js";

export type RecorderOutput = Omit<
  JourneyEntry,
  "id" | "correctedByHuman" | "correction" | "createdAt" | "updatedAt"
>;

export interface RecorderContext {
  recentJourney: JourneyEntry[];
}

export interface StoryFinderContext {
  projectTimeline: JourneyEntry[];
}

export interface WriterContext {
  supportingJourney: JourneyEntry[];
}

export interface RecorderAgent {
  record(event: WorkEvent, context?: RecorderContext): Promise<RecorderOutput>;
}

export interface StoryFinderAgent {
  findStory(
    entry: JourneyEntry,
    context?: StoryFinderContext
  ): Promise<Omit<StoryCandidate, "id"> | null>;
}

export interface WriterAgent {
  write(
    candidate: StoryCandidate,
    context?: WriterContext
  ): Promise<Omit<DraftVersion, "id" | "version" | "createdAt">>;
}

export interface ContextualSecurityReviewer {
  review(content: string): Promise<{ safe: boolean; findings: SecurityFinding[] }>;
}
