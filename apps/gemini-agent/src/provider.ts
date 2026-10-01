import { randomUUID } from "node:crypto";
import { AgentError } from "./protocol.js";

export interface Generation {
  purpose: "turn" | "audit";
  system: string;
  payload: unknown;
  schema: Record<string, unknown>;
  signal: AbortSignal;
  timeoutMs: number;
  correlation?: { requestId: string; attemptId: string; runId?: string };
  observe?: (value: UsageObservation) => void;
}
export interface ModelProvider {
  generate(request: Generation): Promise<unknown>;
}
export interface UsageObservation {
  requestId: string;
  attemptId: string;
  runId: string | null;
  observedAt: string;
  stage: "provider" | "validated-generation";
  outcome: "success" | "failure";
  errorCode: string | null;
  purpose: Generation["purpose"];
  model: string;
  elapsedMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export class GeminiProvider implements ModelProvider {
  constructor(
    private options: {
      apiKey: string;
      model?: string;
      fetch?: typeof fetch;
      observe?: (value: UsageObservation) => void;
    },
  ) {
    if (!options.apiKey) throw new AgentError(500, "GEMINI_KEY_MISSING");
    if (
      !/^gemini-[a-zA-Z0-9.-]+$/.test(options.model ?? "gemini-3.1-flash-lite")
    )
      throw new AgentError(500, "MODEL_NAME_INVALID");
  }
  async generate(input: Generation): Promise<unknown> {
    const began = performance.now();
    const model = this.options.model ?? "gemini-3.1-flash-lite";
    const correlation = input.correlation ?? {
      requestId: randomUUID(),
      attemptId: randomUUID(),
    };
    const tokens = {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    } as Pick<UsageObservation, "inputTokens" | "outputTokens" | "totalTokens">;
    let failure: AgentError | undefined;
    const timeout = AbortSignal.timeout(input.timeoutMs);
    const signal = AbortSignal.any([timeout, input.signal]);
    try {
      const response = await (this.options.fetch ?? fetch)(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          redirect: "error",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.options.apiKey,
          },
          signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.system }] },
            contents: [
              {
                role: "user",
                parts: [{ text: JSON.stringify(input.payload) }],
              },
            ],
            generationConfig: {
              candidateCount: 1,
              maxOutputTokens: input.purpose === "audit" ? 1024 : 2048,
              temperature: 0,
              ...(model.startsWith("gemini-3")
                ? { thinkingConfig: { thinkingLevel: "MINIMAL" } }
                : {}),
              responseFormat: {
                text: { mimeType: "APPLICATION_JSON", schema: input.schema },
              },
            },
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new AgentError(
          response.status === 429 ? 429 : 502,
          response.status === 429
            ? "MODEL_RATE_LIMITED"
            : [401, 403].includes(response.status)
              ? "MODEL_AUTH_ERROR"
              : response.status === 400
                ? "MODEL_REQUEST_INVALID"
                : "MODEL_UNAVAILABLE",
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new AgentError(502, "MODEL_INVALID_OUTPUT");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1024 * 1024)
            throw new AgentError(502, "MODEL_RESPONSE_TOO_LARGE");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      signal.throwIfAborted();
      const body = JSON.parse(Buffer.concat(chunks).toString()) as {
        promptFeedback?: { blockReason?: string };
        candidates?: {
          finishReason?: string;
          content?: {
            parts?: {
              text?: string;
              functionCall?: unknown;
              thought?: boolean;
            }[];
          };
        }[];
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };
      const token = (value: unknown): number | null =>
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0
          ? value
          : null;
      tokens.inputTokens = token(body.usageMetadata?.promptTokenCount);
      tokens.outputTokens = token(body.usageMetadata?.candidatesTokenCount);
      tokens.totalTokens = token(body.usageMetadata?.totalTokenCount);
      if (body.promptFeedback?.blockReason)
        throw new AgentError(502, "MODEL_BLOCKED");
      if (
        body.candidates?.length !== 1 ||
        body.candidates[0]!.finishReason !== "STOP"
      )
        throw new AgentError(502, "MODEL_INVALID_OUTPUT");
      const parts = body.candidates[0]!.content?.parts;
      if (
        !parts?.length ||
        parts.some(
          (part) =>
            typeof part.text !== "string" ||
            part.functionCall !== undefined ||
            part.thought,
        )
      )
        throw new AgentError(502, "MODEL_INVALID_OUTPUT");
      const output: unknown = JSON.parse(
        parts.map((part) => part.text).join(""),
      );

      return output;
    } catch (error) {
      failure =
        error instanceof AgentError
          ? error
          : input.signal.aborted
            ? new AgentError(499, "MODEL_CANCELLED")
            : timeout.aborted
              ? new AgentError(504, "MODEL_TIMEOUT")
              : error instanceof SyntaxError
                ? new AgentError(502, "MODEL_INVALID_OUTPUT")
                : new AgentError(502, "MODEL_UNAVAILABLE");
      // Never surface provider bodies, request headers, URLs or exception text.
      throw failure;
    } finally {
      const observation: UsageObservation = {
        ...correlation,
        runId: correlation.runId ?? null,
        observedAt: new Date().toISOString(),
        stage: "provider",
        purpose: input.purpose,
        model,
        elapsedMs: performance.now() - began,
        outcome: failure ? "failure" : "success",
        errorCode: failure?.code ?? null,
        ...tokens,
      };
      for (const observe of [this.options.observe, input.observe]) {
        try {
          observe?.(observation);
        } catch {
          /* Observations cannot authorize or interrupt a generation. */
        }
      }
    }
  }
}
