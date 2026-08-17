import type { PrivacyLevel, WorkEvent, WorkTruthState } from "../domain/types.js";

export interface SessionMessageInput {
  role: string;
  content: string;
  occurredAt?: string;
}

export interface SessionEvidenceInput {
  kind?: string;
  title?: string;
  text?: string;
  reference?: string;
  occurredAt?: string;
}

export interface UniversalSessionInput {
  projectId: string;
  source: string;
  sessionId?: string;
  title?: string;
  text?: string;
  messages?: SessionMessageInput[];
  evidence?: SessionEvidenceInput[];
  sourceReference?: string;
  startedAt?: string;
  endedAt?: string;
  occurredAt?: string;
  truthState?: WorkTruthState;
  completionConfirmed?: boolean;
  privacy?: PrivacyLevel;
  contentEligible?: boolean;
}

export interface SessionIngestionResult {
  sessionKey: string;
  event: WorkEvent;
  duplicate: boolean;
  warnings: string[];
  promptInjectionDetected: boolean;
  sourceReferences: string[];
}
