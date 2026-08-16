import type {
  DraftVersion,
  JourneyEntry,
  SecurityFinding,
  StoryCandidate,
  WorkEvent
} from "../domain/types.js";

export interface RecorderAgent {
  record(event: WorkEvent): Promise<Omit<JourneyEntry, "id" | "correctedByHuman">>;
}

export interface StoryFinderAgent {
  findStory(entry: JourneyEntry): Promise<Omit<StoryCandidate, "id"> | null>;
}

export interface WriterAgent {
  write(candidate: StoryCandidate): Promise<Omit<DraftVersion, "id" | "version" | "createdAt">>;
}

export interface ContextualSecurityReviewer {
  review(content: string): Promise<{
    safe: boolean;
    findings: SecurityFinding[];
  }>;
}
