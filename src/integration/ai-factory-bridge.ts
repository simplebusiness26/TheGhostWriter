import type { UniversalSessionInput, SessionIngestionResult } from "../ingestion/types.js";
import type { UniversalSessionIngestor } from "../ingestion/session-ingestor.js";

export type AiFactoryFetchLike = typeof fetch;

export interface AiFactoryBridgeClientConfig {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: AiFactoryFetchLike;
}

export interface AiFactoryQueuedPacket extends UniversalSessionInput {
  bridgeId: number;
}

export interface AiFactoryQueueResponse {
  count: number;
  packets: AiFactoryQueuedPacket[];
}

export interface AiFactoryPullResult {
  pulled: number;
  ingested: number;
  duplicates: number;
  consumed: number;
  failed: Array<{ bridgeId: number; error: string }>;
  results: Array<{ bridgeId: number; ingestion: SessionIngestionResult }>;
}

export class AiFactoryBridgeClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: AiFactoryFetchLike;

  constructor(config: AiFactoryBridgeClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.apiKey = config.apiKey.trim();
    this.fetchImpl = config.fetchImpl ?? fetch;
    if (!this.baseUrl) throw new Error("AI_FACTORY_URL is required");
    if (!this.apiKey) throw new Error("AI_FACTORY_KEY is required");
  }

  async listQueued(): Promise<AiFactoryQueuedPacket[]> {
    const payload = await this.request<AiFactoryQueueResponse>("/api/ghostwriter-bridge/queue", {
      method: "GET"
    });
    if (!payload || !Array.isArray(payload.packets)) {
      throw new Error("AI Factory bridge returned an invalid queue payload");
    }
    return payload.packets.map(validatePacket);
  }

  async markConsumed(bridgeId: number): Promise<void> {
    requireBridgeId(bridgeId);
    await this.request(`/api/ghostwriter-bridge/${bridgeId}/consume`, {
      method: "POST"
    });
  }

  async pullInto(
    ingestor: UniversalSessionIngestor,
    options: { markConsumed?: boolean; limit?: number } = {}
  ): Promise<AiFactoryPullResult> {
    const queued = await this.listQueued();
    const limit = clampLimit(options.limit);
    const packets = queued.slice(0, limit);
    const result: AiFactoryPullResult = {
      pulled: packets.length,
      ingested: 0,
      duplicates: 0,
      consumed: 0,
      failed: [],
      results: []
    };

    for (const packet of packets) {
      try {
        const { bridgeId, ...session } = packet;
        const ingestion = ingestor.ingest(session);
        result.results.push({ bridgeId, ingestion });
        if (ingestion.duplicate) result.duplicates += 1;
        else result.ingested += 1;

        if (options.markConsumed !== false) {
          await this.markConsumed(bridgeId);
          result.consumed += 1;
        }
      } catch (error) {
        result.failed.push({
          bridgeId: packet.bridgeId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return result;
  }

  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        accept: "application/json",
        "x-ai-factory-key": this.apiKey
      }
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json() as { error?: unknown };
        if (typeof body?.error === "string" && body.error.trim()) detail = body.error.trim();
      } catch {}
      throw new Error(`AI Factory bridge request failed: ${detail}`);
    }

    return await response.json() as T;
  }
}

export function aiFactoryBridgeConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AiFactoryBridgeClientConfig {
  const baseUrl = env.AI_FACTORY_URL?.trim();
  const apiKey = env.AI_FACTORY_KEY?.trim();
  if (!baseUrl) throw new Error("AI_FACTORY_URL is required");
  if (!apiKey) throw new Error("AI_FACTORY_KEY is required");
  return { baseUrl, apiKey };
}

function validatePacket(value: unknown): AiFactoryQueuedPacket {
  if (!value || typeof value !== "object") {
    throw new Error("AI Factory bridge returned a non-object packet");
  }
  const packet = value as Partial<AiFactoryQueuedPacket>;
  requireBridgeId(packet.bridgeId);
  if (!packet.projectId?.trim()) throw new Error(`Bridge packet ${packet.bridgeId} is missing projectId`);
  if (!packet.source?.trim()) throw new Error(`Bridge packet ${packet.bridgeId} is missing source`);
  if (!packet.text?.trim()) throw new Error(`Bridge packet ${packet.bridgeId} is missing text`);
  if (packet.privacy !== "content_eligible" || packet.contentEligible !== true) {
    throw new Error(`Bridge packet ${packet.bridgeId} is not content eligible`);
  }
  return packet as AiFactoryQueuedPacket;
}

function requireBridgeId(value: unknown): asserts value is number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error("AI Factory bridge packet requires a positive bridgeId");
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("AI_FACTORY_URL must be an absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("AI_FACTORY_URL must use http or https");
  }
  return trimmed;
}

function clampLimit(value: number | undefined): number {
  if (value === undefined) return 50;
  if (!Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(200, Math.floor(value)));
}
