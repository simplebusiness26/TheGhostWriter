import type {
  ContextualSecurityReviewer,
  RecorderAgent,
  StoryFinderAgent,
  WriterAgent
} from "./contracts.js";

export const demoRecorder: RecorderAgent = {
  async record(event) {
    return {
      projectId: event.projectId,
      eventIds: [event.id],
      situation: event.sanitizedText,
      truthState: event.truthState,
      evidence: [{
        eventId: event.id,
        sourceReference: event.sourceReference,
        claim: event.sanitizedText
      }]
    };
  }
};

export const demoStoryFinder: StoryFinderAgent = {
  async findStory(entry) {
    if (entry.truthState === "idea" || entry.truthState === "planned") return null;
    return {
      projectId: entry.projectId,
      journeyEntryIds: [entry.id],
      story: entry.situation,
      lesson: undefined,
      whyItMatters: undefined,
      status: entry.truthState === "completed" ? "resolved" : "developing",
      evidence: entry.evidence
    };
  }
};

export const demoWriter: WriterAgent = {
  async write(candidate) {
    return {
      storyCandidateId: candidate.id,
      platform: "x",
      content: candidate.lesson
        ? `${candidate.story}\n\nWhat we learned: ${candidate.lesson}`
        : candidate.story,
      evidence: candidate.evidence
    };
  }
};

export const demoSecurityReviewer: ContextualSecurityReviewer = {
  async review() {
    return { safe: true, findings: [] };
  }
};
