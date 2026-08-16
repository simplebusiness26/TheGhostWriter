export interface StructuredResponseFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface StructuredModelRequest {
  model: string;
  instructions: string;
  input: string;
  format: StructuredResponseFormat;
  maxOutputTokens?: number;
}

export type FetchLike = typeof fetch;

export class OpenAIResponsesClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
    private readonly fetchImpl: FetchLike = fetch
  ) {
    if (!apiKey.trim()) {
      throw new Error("OPENAI_API_KEY is required for live Ghost Writer intelligence");
    }
  }

  async structured<T>(request: StructuredModelRequest): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        store: false,
        instructions: request.instructions,
        input: request.input,
        max_output_tokens: request.maxOutputTokens ?? 1400,
        text: {
          format: {
            type: "json_schema",
            name: request.format.name,
            strict: true,
            schema: request.format.schema
          }
        }
      })
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 800);
      throw new Error(`OpenAI Responses API failed (${response.status}): ${body}`);
    }

    const payload = await response.json() as unknown;
    const outputText = extractOutputText(payload);

    try {
      return JSON.parse(outputText) as T;
    } catch {
      throw new Error("OpenAI returned structured output that could not be parsed as JSON");
    }
  }
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("OpenAI returned an invalid response payload");
  }

  const response = payload as { status?: unknown; output?: unknown };
  if (response.status && response.status !== "completed") {
    throw new Error(`OpenAI response did not complete: ${String(response.status)}`);
  }
  if (!Array.isArray(response.output)) {
    throw new Error("OpenAI response contained no output array");
  }

  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const candidate = part as { type?: unknown; text?: unknown; refusal?: unknown };
      if (candidate.type === "refusal" || typeof candidate.refusal === "string") {
        throw new Error("OpenAI refused the intelligence request");
      }
      if (candidate.type === "output_text" && typeof candidate.text === "string" && candidate.text.trim()) {
        return candidate.text;
      }
    }
  }

  throw new Error("OpenAI response contained no output text");
}
