import type {
  DraftVersion,
  JourneyEntry,
  PipelineRecord,
  SecurityScan,
  StoryCandidate
} from "../domain/types.js";
import type { UniversalSessionInput, SessionIngestionResult } from "../ingestion/types.js";
import { UniversalSessionIngestor } from "../ingestion/session-ingestor.js";
import { GhostWriterOrchestrator } from "../orchestrator/orchestrator.js";

export interface ContentProcessingResult {
  ingestion: SessionIngestionResult;
  pipeline: PipelineRecord;
  journey?: JourneyEntry;
  story?: StoryCandidate;
  draft?: DraftVersion;
  security?: SecurityScan;
}

export class GhostWriterContentProcessor {
  constructor(
    private readonly ingestor: UniversalSessionIngestor,
    private readonly orchestrator: GhostWriterOrchestrator
  ) {}

  async processForContent(input: UniversalSessionInput): Promise<ContentProcessingResult> {
    if (input.privacy && input.privacy !== "content_eligible") {
      throw new Error("A private/internal session cannot be forced into the content pipeline");
    }
    if (input.contentEligible === false) {
      throw new Error("A content-ineligible session cannot be processed for content");
    }

    const ingestion = this.ingestor.ingest({
      ...input,
      privacy: "content_eligible",
      contentEligible: true
    });

    let pipeline = this.orchestrator.store.pipelines.get(ingestion.event.id);
    if (!pipeline) throw new Error(`Missing pipeline for ingested event: ${ingestion.event.id}`);

    if (pipeline.state === "captured") {
      pipeline = await this.orchestrator.process(ingestion.event.id);
    }

    return this.materialize(ingestion, pipeline);
  }

  private materialize(
    ingestion: SessionIngestionResult,
    pipeline: PipelineRecord
  ): ContentProcessingResult {
    return {
      ingestion,
      pipeline: { ...pipeline },
      journey: pipeline.journeyEntryId
        ? this.orchestrator.store.journeyEntries.get(pipeline.journeyEntryId)
        : undefined,
      story: pipeline.storyCandidateId
        ? this.orchestrator.store.storyCandidates.get(pipeline.storyCandidateId)
        : undefined,
      draft: pipeline.draftVersionId
        ? this.orchestrator.store.drafts.get(pipeline.draftVersionId)
        : undefined,
      security: pipeline.securityScanId
        ? this.orchestrator.store.scans.get(pipeline.securityScanId)
        : undefined
    };
  }
}
