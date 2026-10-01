import { request as httpRequest } from "node:http";
import { isAbsolute, resolve } from "node:path";
import { Readable } from "node:stream";
import { createGeminiAgent } from "../apps/gemini-agent/src/app.js";
import { GeminiProvider } from "../apps/gemini-agent/src/provider.js";
import { AgentError } from "../apps/gemini-agent/src/protocol.js";
import { usageOptions } from "../apps/gemini-agent/src/usage.js";

// A development-only process entry. Never load main.ts, dotenv or key fields.
async function main() {
  if (process.env.QA_GEMINI_OFFLINE !== "true")
    throw new AgentError(500, "QA_OFFLINE_REQUIRED");
  const providerAddress = process.env.QA_GEMINI_PROVIDER_URL ?? "";
  // Validate the raw spelling, before URL normalization can accept aliases,
  // credentials, default ports, encoded hosts, queries or fragments.
  const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/?$/.exec(
    providerAddress,
  );
  const providerPort = Number(match?.[1]);
  if (!match || providerPort > 65535)
    throw new AgentError(500, "QA_PROVIDER_URL_INVALID");
  const providerOrigin = `http://127.0.0.1:${providerPort}`;
  const directory = process.env.QA_GEMINI_SESSION_DIR;
  if (!directory || !isAbsolute(directory))
    throw new AgentError(500, "QA_SESSION_DIRECTORY_REQUIRED");
  const sessionDirectory = resolve(directory);
  const model = process.env.QA_GEMINI_MODEL ?? "gemini-3.1-flash-lite";
  const providerPath = `/v1beta/models/${model}:generateContent`;
  const expectedUrl = `https://generativelanguage.googleapis.com${providerPath}`;

  // Adapt only the transport. Native http pins the socket to numeric loopback
  // and cannot consult fetch's global dispatcher or environment proxy settings.
  // Provider body, headers, response bytes and abort signal remain unchanged.
  const localTransport: typeof fetch = async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (
      url !== expectedUrl ||
      options?.method !== "POST" ||
      typeof options.body !== "string"
    )
      throw new Error("QA_PROVIDER_REQUEST_REJECTED");
    return new Promise<Response>((resolveResponse, reject) => {
      const request = httpRequest(
        {
          hostname: "127.0.0.1",
          port: providerPort,
          path: providerPath,
          method: options.method,
          // Do not use Node's process-global agent, which may enable env proxies.
          agent: false,
          headers: Object.fromEntries(new Headers(options.headers)),
          signal: options.signal ?? undefined,
        },
        (response) => {
          const status = response.statusCode ?? 502;
          // There is no redirect request path, even to another loopback server.
          if ([301, 302, 303, 307, 308].includes(status)) {
            response.destroy();
            reject(new Error("QA_PROVIDER_REDIRECT_REJECTED"));
            return;
          }
          const headers = new Headers();
          for (let index = 0; index < response.rawHeaders.length; index += 2)
            headers.append(
              response.rawHeaders[index]!,
              response.rawHeaders[index + 1]!,
            );
          const body = [204, 205, 304].includes(status)
            ? null
            : (Readable.toWeb(response) as ReadableStream<Uint8Array>);
          if (body === null) response.resume();
          resolveResponse(new Response(body, { status, headers }));
        },
      );
      request.once("error", reject);
      request.end(options.body);
    });
  };
  const app = await createGeminiAgent({
    stateDirectory: sessionDirectory,
    provider: new GeminiProvider({
      apiKey: "qa-offline-synthetic-key",
      model,
      fetch: localTransport,
    }),
    usage: usageOptions(process.env),
  });
  try {
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    console.log(
      JSON.stringify({
        event: "qa-gemini-agent-ready",
        address,
        model,
        offline: true,
        providerOrigin,
        providerTransport: "loopback-http",
        credentialSource: "synthetic",
        sessionDirectory,
      }),
    );
  } catch (error) {
    await app.close();
    throw error;
  }
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;
      void app.close().then(
        () => process.exit(0),
        (error: unknown) => {
          report("qa-gemini-agent-stop-failed", error);
          process.exit(1);
        },
      );
    });
}

function report(event: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event,
      code:
        error instanceof AgentError ? error.code : "CONFIG_OR_STARTUP_ERROR",
    }),
  );
}
main().catch((error: unknown) => {
  report("qa-gemini-agent-start-failed", error);
  process.exitCode = 1;
});
