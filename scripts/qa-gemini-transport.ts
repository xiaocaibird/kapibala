import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";

export interface QaTransportEvent {
  seq: number;
  at: string;
  monotonicMs: number;
  requestId: string;
  kind:
    | "attempt"
    | "request-rejected"
    | "request-created"
    | "socket-assigned"
    | "socket-connected"
    | "response-status"
    | "redirect-rejected"
    | "response-conversion-rejected"
    | "signal-aborted"
    | "request-error"
    | "response-end"
    | "response-close"
    | "socket-close";
  details: Record<string, string | number | boolean | null>;
}

/** Pins only this provider transport to a numeric loopback socket. No proxy agent. */
export function createQaGeminiTransport(config: {
  providerPort: number;
  providerPath: string;
  expectedUrl: string;
  syntheticKey: string;
  observe?: (event: QaTransportEvent) => void;
}): typeof fetch {
  let sequence = 0;
  return async (input, options) => {
    const requestId = randomUUID();
    const emit = (
      kind: QaTransportEvent["kind"],
      details: QaTransportEvent["details"] = {},
    ) => {
      if (!config.observe) return;
      try {
        config.observe({
          seq: ++sequence,
          at: new Date().toISOString(),
          monotonicMs: performance.now(),
          requestId,
          kind,
          details,
        });
      } catch {
        /* Observation must not change transport behavior. */
      }
    };
    const url = input instanceof Request ? input.url : String(input);
    const allowed = url === config.expectedUrl;
    const headers = new Headers(options?.headers);
    const key = headers.get("x-goog-api-key");
    emit("attempt", {
      inputUrl: allowed ? url : "[redacted]",
      inputUrlAllowed: allowed,
      method: [
        "POST",
        "GET",
        "PUT",
        "DELETE",
        "PATCH",
        "HEAD",
        "OPTIONS",
      ].includes(options?.method ?? "")
        ? options!.method!
        : "[other-or-unset]",
      redirect: ["error", "follow", "manual"].includes(options?.redirect ?? "")
        ? options!.redirect!
        : "[unset]",
      modelPath: allowed ? config.providerPath : "[redacted]",
      keyHeaderPresent: key !== null,
      matchesSyntheticKey: key === config.syntheticKey,
      syntheticKeyElsewhere:
        url.includes(config.syntheticKey) ||
        (typeof options?.body === "string" &&
          options.body.includes(config.syntheticKey)) ||
        [...headers].some(
          ([name, value]) =>
            name !== "x-goog-api-key" && value.includes(config.syntheticKey),
        ),
    });
    if (
      !allowed ||
      options?.method !== "POST" ||
      typeof options.body !== "string"
    ) {
      emit("request-rejected", { reason: "unexpected-provider-request" });
      throw new Error("QA_PROVIDER_REQUEST_REJECTED");
    }
    return new Promise<Response>((resolveResponse, reject) => {
      const aborted = () => emit("signal-aborted");
      if (options.signal?.aborted) aborted();
      options.signal?.addEventListener("abort", aborted, { once: true });
      let request;
      try {
        request = httpRequest(
          {
            hostname: "127.0.0.1",
            port: config.providerPort,
            path: config.providerPath,
            method: options.method,
            agent: false,
            headers: Object.fromEntries(headers),
            signal: options.signal ?? undefined,
          },
          (response) => {
            const status = response.statusCode ?? 502;
            emit("response-status", { status });
            response.once("end", () => emit("response-end"));
            response.once("close", () =>
              emit("response-close", { complete: response.complete }),
            );
            try {
              if ([301, 302, 303, 307, 308].includes(status)) {
                emit("redirect-rejected", { status });
                throw new Error("QA_PROVIDER_REDIRECT_REJECTED");
              }
              const responseHeaders = new Headers();
              for (
                let index = 0;
                index < response.rawHeaders.length;
                index += 2
              )
                responseHeaders.append(
                  response.rawHeaders[index]!,
                  response.rawHeaders[index + 1]!,
                );
              const body = [204, 205, 304].includes(status)
                ? null
                : (Readable.toWeb(response) as ReadableStream<Uint8Array>);
              const result = new Response(body, {
                status,
                headers: responseHeaders,
              });
              if (body === null) response.resume();
              resolveResponse(result);
            } catch (error) {
              if (![301, 302, 303, 307, 308].includes(status))
                emit("response-conversion-rejected", { status });
              response.destroy();
              reject(error);
            }
          },
        );
      } catch (error) {
        options.signal?.removeEventListener("abort", aborted);
        emit("request-error", { code: "REQUEST_SETUP_FAILED" });
        reject(error);
        return;
      }
      emit("request-created", {
        hostname: "127.0.0.1",
        port: config.providerPort,
        modelPath: config.providerPath,
        proxyAgent: false,
      });
      request.once("socket", (socket) => {
        const socketId = randomUUID();
        emit("socket-assigned", { socketId });
        socket.once("connect", () =>
          emit("socket-connected", {
            socketId,
            localAddress:
              socket.localAddress === "127.0.0.1" ? "127.0.0.1" : "[other]",
            localPort: socket.localPort ?? null,
            remoteAddress:
              socket.remoteAddress === "127.0.0.1" ? "127.0.0.1" : "[other]",
            remotePort: socket.remotePort ?? null,
          }),
        );
        socket.once("close", (hadError) =>
          emit("socket-close", { socketId, hadError }),
        );
      });
      request.once("close", () =>
        options.signal?.removeEventListener("abort", aborted),
      );
      request.once("error", (error: NodeJS.ErrnoException) => {
        emit("request-error", {
          code: /^[A-Z_0-9]{1,64}$/.test(error.code ?? "")
            ? error.code!
            : "REQUEST_FAILED",
        });
        reject(error);
      });
      request.end(options.body);
    });
  };
}
