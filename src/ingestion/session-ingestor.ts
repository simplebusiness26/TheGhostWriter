import type { PrivacyLevel, WorkTruthState } from "../domain/types.js";
import type { GhostWriterOrchestrator } from "../orchestrator/orchestrator.js";
import { sanitizeUntrustedText } from "../security/sanitizer.js";
import type { SessionEvidenceInput, SessionIngestionResult, SessionMessageInput, UniversalSessionInput } from "./types.js";

export class UniversalSessionIngestor {
  constructor(
    private readonly orchestrator: GhostWriterOrchestrator,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  ingest(input: UniversalSessionInput): SessionIngestionResult {
    const projectId = requireText(input.projectId, "projectId");
    const source = requireText(input.source, "source");
    const canonicalText = buildCanonicalSession(input);
    const sanitation = sanitizeUntrustedText(canonicalText);
    const sanitizedText = normalizeText(sanitation.content);
    if (!sanitizedText) throw new Error("Session contains no usable text after normalization");

    const sourceReferences = collectReferences(input);
    const sessionKey = buildSessionKey(projectId, source, input.sessionId, sanitizedText);
    const dedupeKey = `session:${sessionKey}`;
    const existing = [...this.orchestrator.store.events.values()].find((event) => event.dedupeKey === dedupeKey);
    if (existing) {
      return {
        sessionKey,
        event: existing,
        duplicate: true,
        warnings: buildWarnings(input, sanitation.promptInjectionDetected),
        promptInjectionDetected: sanitation.promptInjectionDetected,
        sourceReferences
      };
    }

    const privacy = resolvePrivacy(input);
    const contentEligible = privacy === "content_eligible" && (input.contentEligible ?? true);
    const truthState = resolveTruthState(input);
    const event = this.orchestrator.capture({
      projectId,
      source,
      eventType: "work_session",
      occurredAt: input.endedAt ?? input.occurredAt ?? input.startedAt ?? this.now(),
      truthState,
      privacy,
      contentEligible,
      rawText: sanitizedText,
      sourceReference: input.sourceReference ?? sourceReferences[0],
      dedupeKey
    });

    return {
      sessionKey,
      event,
      duplicate: false,
      warnings: buildWarnings(input, sanitation.promptInjectionDetected),
      promptInjectionDetected: sanitation.promptInjectionDetected,
      sourceReferences
    };
  }
}

function buildCanonicalSession(input: UniversalSessionInput): string {
  const sections: string[] = [];
  if (input.title?.trim()) sections.push(`# ${normalizeText(input.title)}`);
  if (input.text?.trim()) sections.push(normalizeText(input.text));
  if (input.messages?.length) sections.push(formatMessages(input.messages));
  if (input.evidence?.length) sections.push(formatEvidence(input.evidence));
  return normalizeText(sections.filter(Boolean).join("\n\n"));
}

function formatMessages(messages: SessionMessageInput[]): string {
  return messages
    .filter((message) => message.content?.trim())
    .map((message) => {
      const role = normalizeText(message.role || "unknown").toLowerCase();
      const timestamp = message.occurredAt ? ` @ ${message.occurredAt}` : "";
      return `[${role}${timestamp}]\n${normalizeText(message.content)}`;
    })
    .join("\n\n");
}

function formatEvidence(evidence: SessionEvidenceInput[]): string {
  return evidence
    .filter((item) => item.text?.trim() || item.reference?.trim() || item.title?.trim())
    .map((item, index) => {
      const headerParts = [`evidence ${index + 1}`];
      if (item.kind?.trim()) headerParts.push(normalizeText(item.kind));
      if (item.title?.trim()) headerParts.push(normalizeText(item.title));
      if (item.occurredAt?.trim()) headerParts.push(item.occurredAt.trim());
      const lines = [`[${headerParts.join(" | ")}]`];
      if (item.reference?.trim()) lines.push(`reference: ${item.reference.trim()}`);
      if (item.text?.trim()) lines.push(normalizeText(item.text));
      return lines.join("\n");
    })
    .join("\n\n");
}

function collectReferences(input: UniversalSessionInput): string[] {
  const references = [input.sourceReference, ...(input.evidence ?? []).map((item) => item.reference)]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());
  return [...new Set(references)];
}

function buildSessionKey(projectId: string, source: string, sessionId: string | undefined, sanitizedText: string): string {
  const stableIdentity = sessionId?.trim()
    ? `${projectId}\n${source}\n${sessionId.trim()}`
    : `${projectId}\n${source}\n${sanitizedText}`;
  return stableHash(stableIdentity);
}

function resolveTruthState(input: UniversalSessionInput): WorkTruthState {
  if (input.truthState) return input.truthState;
  if (input.completionConfirmed === true) return "completed";
  return "in_progress";
}

function resolvePrivacy(input: UniversalSessionInput): PrivacyLevel {
  if (input.privacy) return input.privacy;
  return input.contentEligible === true ? "content_eligible" : "internal";
}

function buildWarnings(input: UniversalSessionInput, promptInjectionDetected: boolean): string[] {
  const warnings: string[] = [];
  if (!input.truthState && input.completionConfirmed !== true) {
    warnings.push("Truth state defaulted to in_progress because completion was not explicitly confirmed.");
  }
  if (!input.privacy && input.contentEligible !== true) {
    warnings.push("Session defaulted to internal and will not enter the public-content pipeline until explicitly marked content-eligible.");
  }
  if (promptInjectionDetected) {
    warnings.push("Prompt-injection-like text was detected and preserved only as untrusted evidence.");
  }
  return warnings;
}

function requireText(value: string, field: string): string {
  const normalized = normalizeText(value);
  if (!normalized) throw new Error(`Session ${field} is required`);
  return normalized;
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stableHash(value: string): string {
  return `${fnv1a64(value)}${fnv1a64([...value].reverse().join(""))}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
