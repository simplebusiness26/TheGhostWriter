export type Id = string;

export type WorkTruthState =
  | "idea"
  | "planned"
  | "in_progress"
  | "tested"
  | "completed"
  | "published";

export type PipelineState =
  | "captured"
  | "recorded"
  | "no_story"
  | "story_candidate"
  | "drafted"
  | "security_review"
  | "security_passed"
  | "blocked"
  | "human_approved"
  | "rejected"
  | "publish_queued"
  | "published";

export type PrivacyLevel = "private" | "internal" | "content_eligible";

export interface WorkEvent {
  id: Id;
  projectId: Id;
  source: string;
  eventType: string;
  occurredAt: string;
  truthState: WorkTruthState;
  privacy: PrivacyLevel;
  contentEligible: boolean;
  rawText: string;
  sanitizedText: string;
  sourceReference?: string;
  dedupeKey: string;
}

export interface JourneyEntry {
  id: Id;
  projectId: Id;
  eventIds: Id[];
  situation: string;
  goal?: string;
  action?: string;
  reason?: string;
  result?: string;
  nextStep?: string;
  truthState: WorkTruthState;
  evidence: EvidenceRef[];
  correctedByHuman: boolean;
}

export interface EvidenceRef {
  eventId: Id;
  sourceReference?: string;
  claim: string;
}

export type StoryStatus = "open" | "developing" | "resolved" | "needs_more_information";

export interface StoryCandidate {
  id: Id;
  projectId: Id;
  journeyEntryIds: Id[];
  story: string;
  lesson?: string;
  whyItMatters?: string;
  status: StoryStatus;
  evidence: EvidenceRef[];
}

export interface DraftVersion {
  id: Id;
  storyCandidateId: Id;
  platform: "x" | string;
  version: number;
  content: string;
  evidence: EvidenceRef[];
  createdAt: string;
}

export type SecurityOutcome = "safe" | "redacted" | "blocked";

export interface SecurityFinding {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

export interface SecurityScan {
  id: Id;
  draftVersionId: Id;
  outcome: SecurityOutcome;
  findings: SecurityFinding[];
  scannedContent: string;
  scannedAt: string;
}

export interface Approval {
  id: Id;
  draftVersionId: Id;
  approvedBy: string;
  approvedAt: string;
}

export interface Publication {
  id: Id;
  draftVersionId: Id;
  platform: string;
  status: "queued" | "published" | "failed";
  externalId?: string;
  externalUrl?: string;
  createdAt: string;
}

export interface PipelineRecord {
  eventId: Id;
  state: PipelineState;
  journeyEntryId?: Id;
  storyCandidateId?: Id;
  draftVersionId?: Id;
  securityScanId?: Id;
  approvalId?: Id;
  publicationId?: Id;
  updatedAt: string;
}
