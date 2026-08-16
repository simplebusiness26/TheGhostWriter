import type { MemoryStore } from "../memory/store.js";
import { UniversalSessionIngestor } from "../ingestion/session-ingestor.js";
import { GhostWriterOrchestrator } from "../orchestrator/orchestrator.js";
import { GhostWriterContentProcessor } from "./content-processor.js";
import {
  OpenAIContextualSecurityReviewer,
  OpenAIRecorderAgent,
  OpenAIStoryFinderAgent,
  OpenAIWriterAgent
} from "./openai-agents.js";
import { OpenAIResponsesClient, type FetchLike } from "./openai-responses-client.js";

export interface LiveGhostWriterConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  recorderModel?: string;
  storyFinderModel?: string;
  writerModel?: string;
  securityModel?: string;
  fetchImpl?: FetchLike;
}

export interface LiveGhostWriter {
  client: OpenAIResponsesClient;
  orchestrator: GhostWriterOrchestrator;
  ingestor: UniversalSessionIngestor;
  processor: GhostWriterContentProcessor;
}

export function createLiveGhostWriter(
  store: MemoryStore,
  config: LiveGhostWriterConfig
): LiveGhostWriter {
  const sharedModel = config.model?.trim() || "gpt-5.6";
  const client = new OpenAIResponsesClient(
    config.apiKey,
    config.baseUrl,
    config.fetchImpl
  );

  const orchestrator = new GhostWriterOrchestrator(store, {
    recorder: new OpenAIRecorderAgent(
      client,
      config.recorderModel?.trim() || sharedModel
    ),
    storyFinder: new OpenAIStoryFinderAgent(
      client,
      config.storyFinderModel?.trim() || sharedModel
    ),
    writer: new OpenAIWriterAgent(
      client,
      config.writerModel?.trim() || sharedModel
    ),
    securityReviewer: new OpenAIContextualSecurityReviewer(
      client,
      config.securityModel?.trim() || sharedModel
    )
  });

  const ingestor = new UniversalSessionIngestor(orchestrator);
  const processor = new GhostWriterContentProcessor(ingestor, orchestrator);

  return {
    client,
    orchestrator,
    ingestor,
    processor
  };
}

export function liveGhostWriterConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): LiveGhostWriterConfig {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for live Ghost Writer intelligence");
  }

  const sharedModel = env.GHOSTWRITER_MODEL?.trim() || "gpt-5.6";

  return {
    apiKey,
    baseUrl: env.GHOSTWRITER_OPENAI_BASE_URL?.trim() || undefined,
    model: sharedModel,
    recorderModel: env.GHOSTWRITER_RECORDER_MODEL?.trim() || sharedModel,
    storyFinderModel: env.GHOSTWRITER_STORY_MODEL?.trim() || sharedModel,
    writerModel: env.GHOSTWRITER_WRITER_MODEL?.trim() || sharedModel,
    securityModel: env.GHOSTWRITER_SECURITY_MODEL?.trim() || sharedModel
  };
}
