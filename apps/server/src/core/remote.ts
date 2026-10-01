import { randomUUID } from "node:crypto";
import { RemoteError } from "./errors.js";
import { currentOperationSignal } from "./db.js";
export interface RemoteSignalSource {
  source: "activity-budget" | "kick-lock";
  signal: AbortSignal;
}
export interface RemoteObservation {
  stage:
    | "dispatch"
    | "response-headers"
    | "response-body"
    | "source-aborted"
    | "combined-aborted"
    | "fetch-settled"
    | "body-settled"
    | "request-settled";
  requestId: string;
  observedAtMonoNs: string;
  observedWindowMs: [number, number];
  method: "GET" | "POST";
  timeoutMs: number;
  fetchPending: boolean;
  bodyPending: boolean;
  configuredSources: string[];
  abortedSources: string[];
  reasonMatchedSources: string[];
  source?: string;
  outcome?: "fulfilled" | "rejected";
  errorName?: string;
  transportCode?: string;
  responseStatus?: number;
}
function safeError(
  error: unknown,
): Pick<RemoteObservation, "errorName" | "transportCode"> {
  if (!(error instanceof Error)) return { errorName: "non-error" };
  const errorName = [
    "AbortError",
    "TimeoutError",
    "TypeError",
    "RemoteError",
    "Error",
  ].includes(error.name)
    ? error.name
    : "other-error";
  const cause = error.cause;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? cause.code
      : undefined;
  // Never serialize an error message, URL, response body or arbitrary code.
  const transportCode =
    typeof code === "string" &&
    [
      "ECONNRESET",
      "ECONNREFUSED",
      "EPIPE",
      "ENOTFOUND",
      "EAI_AGAIN",
      "UND_ERR_SOCKET",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
    ].includes(code)
      ? code
      : undefined;
  return { errorName, ...(transportCode ? { transportCode } : {}) };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export class RemoteClient {
  constructor(readonly baseUrl: string) {}
  async request<T>(
    path: string,
    body?: unknown,
    timeoutMs = 15000,
    signal?: AbortSignal,
    assertDispatchAllowed?: () => void,
    observe?: (fact: RemoteObservation) => void,
    signalSources?: readonly RemoteSignalSource[],
  ): Promise<T> {
    const operationSignal = currentOperationSignal();
    operationSignal?.throwIfAborted();
    assertDispatchAllowed?.();
    signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(timeoutMs);
    const requestSignal = AbortSignal.any([
      timeout,
      ...(operationSignal ? [operationSignal] : []),
      ...(signal ? [signal] : []),
    ]);
    const url = `${this.baseUrl}${path}`;
    const method = body === undefined ? "GET" : "POST";
    const init = {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: requestSignal,
    };
    // A timer cannot fire while synchronous work or microtasks keep the event
    // loop busy. Check the original deadline after serialization, without an
    // await between this assertion and dispatch.
    assertDispatchAllowed?.();
    const requestId = observe ? randomUUID() : "";
    const sources = observe
      ? [
          { source: "request-deadline", signal: timeout },
          ...(operationSignal
            ? [{ source: "operation", signal: operationSignal }]
            : []),
          ...(signal ? [{ source: "caller", signal }] : []),
          ...(signalSources ?? []),
        ]
      : [];
    let fetchPending = false;
    let bodyPending = false;
    let responseStatus: number | undefined;
    const record = (
      fact: Pick<RemoteObservation, "stage"> & Partial<RemoteObservation>,
    ): void => {
      if (!observe) return;
      try {
        const before = performance.now();
        const observedAtMonoNs = process.hrtime.bigint().toString();
        const after = performance.now();
        observe({
          requestId,
          observedAtMonoNs,
          observedWindowMs: [before, after],
          method,
          timeoutMs,
          fetchPending,
          bodyPending,
          responseStatus,
          configuredSources: sources.map((entry) => entry.source),
          abortedSources: sources
            .filter((entry) => entry.signal.aborted)
            .map((entry) => entry.source),
          // These are observed signal identities, including composite aliases.
          // Multiple matches are retained; they are not reduced to a guessed root cause.
          reasonMatchedSources: requestSignal.aborted
            ? sources
                .filter(
                  (entry) =>
                    entry.signal.aborted &&
                    entry.signal.reason === requestSignal.reason,
                )
                .map((entry) => entry.source)
            : [],
          ...fact,
        });
      } catch {
        /* Engineering observation must not change the HTTP result. */
      }
    };
    const listeners: { signal: AbortSignal; listener: () => void }[] = [];
    if (observe) {
      for (const entry of sources) {
        const listener = () =>
          record({ stage: "source-aborted", source: entry.source });
        entry.signal.addEventListener("abort", listener, { once: true });
        listeners.push({ signal: entry.signal, listener });
      }
      const listener = () => record({ stage: "combined-aborted" });
      requestSignal.addEventListener("abort", listener, { once: true });
      listeners.push({ signal: requestSignal, listener });
    }
    try {
      fetchPending = true;
      record({ stage: "dispatch" });
      let response: Response;
      try {
        response = await fetch(url, init);
        responseStatus = response.status;
        fetchPending = false;
        record({ stage: "fetch-settled", outcome: "fulfilled" });
      } catch (error) {
        fetchPending = false;
        record({
          stage: "fetch-settled",
          outcome: "rejected",
          ...safeError(error),
        });
        throw error;
      }
      record({ stage: "response-headers" });
      let raw: string;
      bodyPending = true;
      try {
        raw = await response.text();
        bodyPending = false;
        record({ stage: "body-settled", outcome: "fulfilled" });
      } catch (error) {
        bodyPending = false;
        record({
          stage: "body-settled",
          outcome: "rejected",
          ...safeError(error),
        });
        throw error;
      }
      record({ stage: "response-body" });
      let data: unknown;
      try {
        data = raw ? (JSON.parse(raw) as unknown) : {};
      } catch {
        throw new RemoteError(response.status, "BAD_JSON", { raw });
      }
      requestSignal.throwIfAborted();
      if (!response.ok) {
        const envelope = isRecord(data) ? data : { raw };
        const nested = isRecord(envelope.error) ? envelope.error : undefined;
        const code =
          typeof envelope.code === "string"
            ? envelope.code
            : typeof nested?.code === "string"
              ? nested.code
              : `HTTP_${response.status}`;
        throw new RemoteError(response.status, code, envelope);
      }
      record({ stage: "request-settled", outcome: "fulfilled" });
      return data as T;
    } catch (error) {
      record({
        stage: "request-settled",
        outcome: "rejected",
        ...safeError(error),
      });
      throw error;
    } finally {
      for (const { signal: observedSignal, listener } of listeners)
        observedSignal.removeEventListener("abort", listener);
    }
  }
}
