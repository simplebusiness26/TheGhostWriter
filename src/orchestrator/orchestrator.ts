import type {
  Approval,
  DraftVersion,
  PipelineRecord,
  Publication,
  SecurityFinding,
  SecurityScan,
  WorkEvent
} from "../domain/types.js";
import { assertTransition } from "../domain/state-machine.js";
import type {
  ContextualSecurityReviewer,
  RecorderAgent,
  StoryFinderAgent,
  WriterAgent
} from "../agents/contracts.js";
import type { MemoryStore } from "../memory/store.js";
import { sanitizeUntrustedText } from "../security/sanitizer.js";

export interface GhostWriterDependencies {
  recorder: RecorderAgent;
  storyFinder: StoryFinderAgent;
  writer: WriterAgent;
  securityReviewer: ContextualSecurityReviewer;
  now?: () => string;
  id?: () => string;
}

export class GhostWriterOrchestrator {
  private readonly now: () => string;
  private readonly id: () => string;

  constructor(
    readonly store: MemoryStore,
    private readonly deps: GhostWriterDependencies
  ) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.id = deps.id ?? (() => `gw-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }

  capture(input: Omit<WorkEvent, "id" | "sanitizedText">): WorkEvent {
    const sanitation = sanitizeUntrustedText(input.rawText);
    const event: WorkEvent = {
      ...input,
      id: this.id(),
      rawText: sanitation.content,
      sanitizedText: sanitation.content
    };

    this.store.addEvent(event);
    this.store.pipelines.set(event.id, {
      eventId: event.id,
      state: "captured",
      updatedAt: this.now()
    });
    this.store.persist();
    return event;
  }

  async process(eventId: string): Promise<PipelineRecord> {
    const event = this.requireEvent(eventId);
    const pipeline = this.requirePipeline(eventId);

    if (event.privacy !== "content_eligible" || !event.contentEligible) {
      throw new Error("Private or content-ineligible events cannot enter the content pipeline");
    }
    if (pipeline.state !== "captured") {
      throw new Error(`Event is not ready for processing: ${pipeline.state}`);
    }

    const recorded = await this.deps.recorder.record(event);
    const journeyId = this.id();
    const timestamp = this.now();
    this.store.journeyEntries.set(journeyId, {
      ...recorded,
      id: journeyId,
      correctedByHuman: false,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    pipeline.journeyEntryId = journeyId;
    this.transition(pipeline, "recorded");

    const story = await this.deps.storyFinder.findStory(this.store.journeyEntries.get(journeyId)!);
    if (!story) {
      this.transition(pipeline, "no_story");
      return { ...pipeline };
    }

    const storyId = this.id();
    this.store.storyCandidates.set(storyId, { ...story, id: storyId });
    pipeline.storyCandidateId = storyId;
    this.transition(pipeline, "story_candidate");

    const written = await this.deps.writer.write(this.store.storyCandidates.get(storyId)!);
    const draftId = this.id();
    const draft: DraftVersion = {
      ...written,
      id: draftId,
      version: 1,
      createdAt: this.now()
    };
    this.store.drafts.set(draftId, draft);
    pipeline.draftVersionId = draftId;
    this.transition(pipeline, "drafted");

    await this.runSecurity(pipeline, draft);
    return { ...pipeline };
  }

  async editDraft(eventId: string, newContent: string): Promise<DraftVersion> {
    const pipeline = this.requirePipeline(eventId);
    if (!pipeline.draftVersionId) throw new Error("No draft exists");
    if (!["security_passed", "blocked", "human_approved"].includes(pipeline.state)) {
      throw new Error(`Draft cannot be edited from state ${pipeline.state}`);
    }

    const previous = this.store.drafts.get(pipeline.draftVersionId)!;
    const next: DraftVersion = {
      ...previous,
      id: this.id(),
      version: previous.version + 1,
      content: newContent,
      createdAt: this.now()
    };
    this.store.drafts.set(next.id, next);

    if (pipeline.approvalId) {
      this.store.approvals.delete(pipeline.approvalId);
      delete pipeline.approvalId;
    }
    delete pipeline.securityScanId;
    pipeline.draftVersionId = next.id;
    this.transition(pipeline, "drafted");
    await this.runSecurity(pipeline, next);
    return next;
  }

  approve(eventId: string, humanActor: string): Approval {
    const pipeline = this.requirePipeline(eventId);
    if (!humanActor.trim()) throw new Error("Human approver identity is required");
    if (pipeline.state !== "security_passed" || !pipeline.securityScanId || !pipeline.draftVersionId) {
      throw new Error("Only a security-passed draft can be human-approved");
    }

    const scan = this.store.scans.get(pipeline.securityScanId);
    if (!scan || scan.outcome === "blocked") throw new Error("Security has not cleared this draft");

    const approval: Approval = {
      id: this.id(),
      draftVersionId: pipeline.draftVersionId,
      approvedBy: humanActor,
      approvedAt: this.now()
    };
    this.store.approvals.set(approval.id, approval);
    pipeline.approvalId = approval.id;
    this.transition(pipeline, "human_approved");
    return approval;
  }

  reject(eventId: string): void {
    const pipeline = this.requirePipeline(eventId);
    if (pipeline.state !== "security_passed") {
      throw new Error("Only a security-passed draft can be rejected by the approval gate");
    }
    this.transition(pipeline, "rejected");
  }

  queuePublication(eventId: string): Publication {
    const pipeline = this.requirePipeline(eventId);
    if (pipeline.state !== "human_approved" || !pipeline.approvalId || !pipeline.draftVersionId) {
      throw new Error("Publication requires an exact human-approved draft version");
    }

    const approval = this.store.approvals.get(pipeline.approvalId);
    if (!approval || approval.draftVersionId !== pipeline.draftVersionId) {
      throw new Error("Approval does not match the current draft version");
    }

    const publication: Publication = {
      id: this.id(),
      draftVersionId: pipeline.draftVersionId,
      platform: this.store.drafts.get(pipeline.draftVersionId)!.platform,
      status: "queued",
      createdAt: this.now()
    };
    this.store.publications.set(publication.id, publication);
    pipeline.publicationId = publication.id;
    this.transition(pipeline, "publish_queued");
    return publication;
  }

  markPublished(eventId: string, externalId: string, externalUrl?: string): Publication {
    const pipeline = this.requirePipeline(eventId);
    if (pipeline.state !== "publish_queued" || !pipeline.publicationId) {
      throw new Error("Only queued publications can be marked published");
    }
    const publication = this.store.publications.get(pipeline.publicationId)!;
    publication.status = "published";
    publication.externalId = externalId;
    publication.externalUrl = externalUrl;
    this.transition(pipeline, "published");
    return publication;
  }

  private async runSecurity(pipeline: PipelineRecord, draft: DraftVersion): Promise<SecurityScan> {
    this.transition(pipeline, "security_review");

    const deterministic = sanitizeUntrustedText(draft.content);
    const contextual = await this.safeContextualReview(deterministic.content);
    const findings = [...deterministic.findings, ...contextual.findings];

    let outcome: SecurityScan["outcome"];
    if (!contextual.safe) {
      outcome = "blocked";
    } else if (deterministic.changed) {
      const rescan = sanitizeUntrustedText(deterministic.content);
      outcome = rescan.changed ? "blocked" : "redacted";
    } else {
      outcome = "safe";
    }

    const scan: SecurityScan = {
      id: this.id(),
      draftVersionId: draft.id,
      outcome,
      findings,
      scannedContent: deterministic.content,
      scannedAt: this.now()
    };
    this.store.scans.set(scan.id, scan);
    pipeline.securityScanId = scan.id;

    if (outcome === "blocked") {
      this.transition(pipeline, "blocked");
      return scan;
    }

    if (outcome === "redacted" && deterministic.content !== draft.content) {
      draft.content = deterministic.content;
    }
    this.transition(pipeline, "security_passed");
    return scan;
  }

  private async safeContextualReview(content: string): Promise<{ safe: boolean; findings: SecurityFinding[] }> {
    try {
      return await this.deps.securityReviewer.review(content);
    } catch {
      return {
        safe: false,
        findings: [{
          type: "security_service_failure",
          severity: "critical",
          description: "Contextual security review failed; system failed closed"
        }]
      };
    }
  }

  private transition(pipeline: PipelineRecord, next: PipelineRecord["state"]): void {
    assertTransition(pipeline.state, next);
    pipeline.state = next;
    pipeline.updatedAt = this.now();
    this.store.persist();
  }

  private requireEvent(eventId: string): WorkEvent {
    const event = this.store.events.get(eventId);
    if (!event) throw new Error(`Unknown event: ${eventId}`);
    return event;
  }

  private requirePipeline(eventId: string): PipelineRecord {
    const pipeline = this.store.pipelines.get(eventId);
    if (!pipeline) throw new Error(`Unknown pipeline: ${eventId}`);
    return pipeline;
  }
}
