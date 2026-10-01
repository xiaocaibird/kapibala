import { isAbsolute, resolve } from "node:path";
import { createGeminiAgent } from "../apps/gemini-agent/src/app.js";
import { GeminiProvider } from "../apps/gemini-agent/src/provider.js";
import { AgentError } from "../apps/gemini-agent/src/protocol.js";
import { usageOptions } from "../apps/gemini-agent/src/usage.js";
import { QaUsageObservation } from "./qa-usage-observation.js";
import { createQaGeminiTransport } from "./qa-gemini-transport.js";

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

  const usageEntry = process.env.QA_GEMINI_USAGE_ENTRY ?? "main";
  if (!["main", "factory"].includes(usageEntry))
    throw new AgentError(500, "QA_USAGE_ENTRY_INVALID");
  const factoryUsage = process.env.QA_GEMINI_FACTORY_USAGE;
  if (factoryUsage !== undefined && !["true", "false"].includes(factoryUsage))
    throw new AgentError(500, "QA_FACTORY_USAGE_INVALID");
  const usage =
    usageEntry === "main"
      ? usageOptions(process.env)
      : factoryUsage === "true"
        ? { ...usageOptions(process.env), enabled: true }
        : undefined;
  const usageEnabled = process.env.QA_GEMINI_USAGE_OBSERVATION === "true";
  const transportEnabled =
    process.env.QA_GEMINI_TRANSPORT_OBSERVATION === "true";
  const token = process.env.QA_ACCEPTANCE_RESOURCE_TOKEN;
  if (
    (usageEnabled || transportEnabled) &&
    (!token || token.length < 32 || token.length > 256)
  )
    throw new AgentError(500, "QA_OBSERVATION_TOKEN_REQUIRED");
  const observation =
    usageEnabled || transportEnabled
      ? new QaUsageObservation({
          token: token!,
          usageEnabled,
          transportEnabled,
          entry: usageEntry as "main" | "factory",
          optionsSupplied: usage !== undefined,
          configuredEnabled: usage !== undefined && usage.enabled !== false,
        })
      : undefined;
  if (usage && usageEnabled) usage.testObserver = observation;
  const syntheticKey = "qa-offline-synthetic-key";
  const localTransport = createQaGeminiTransport({
    providerPort,
    providerPath,
    expectedUrl,
    syntheticKey,
    ...(transportEnabled
      ? { observe: (event) => observation!.transport(event) }
      : {}),
  });
  const app = await createGeminiAgent({
    stateDirectory: sessionDirectory,
    provider: new GeminiProvider({
      apiKey: syntheticKey,
      model,
      fetch: localTransport,
    }),
    ...(usage ? { usage } : {}),
  });
  observation?.register(app);
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
        ...(process.env.QA_GEMINI_USAGE_ENTRY ? { usageEntry } : {}),
        ...(observation
          ? {
              observation: {
                protocol: observation.protocol,
                instanceId: observation.instanceId,
                basePath: observation.basePath,
                usageEnabled,
                transportEnabled,
              },
            }
          : {}),
      }),
    );
  } catch (error) {
    observation?.close();
    await app.close();
    throw error;
  }
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;
      observation?.close();
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
