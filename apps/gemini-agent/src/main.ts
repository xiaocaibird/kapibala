import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { createGeminiAgent } from "./app.js";
import { GeminiProvider } from "./provider.js";
import { AgentError } from "./protocol.js";
import { usageOptions } from "./usage.js";

async function main() {
  let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    // Read only the key fields; never import another checkout's DB/URLs into
    // this independent service or copy its .env into this worktree.
    const env = parse(
      await readFile(process.env.GEMINI_ENV_FILE ?? resolve(".env")),
    );
    apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  }
  if (!apiKey) throw new AgentError(500, "GEMINI_KEY_MISSING");
  const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
  const port = Number(process.env.GEMINI_AGENT_PORT ?? 0);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
    throw new AgentError(500, "PORT_INVALID");
  const app = await createGeminiAgent({
    stateDirectory: process.env.GEMINI_SESSION_DIR ?? ".runtime/gemini-agent",
    provider: new GeminiProvider({ apiKey, model }),
    usage: usageOptions(process.env),
  });
  try {
    const address = await app.listen({ host: "127.0.0.1", port });
    console.log(
      JSON.stringify({ event: "gemini-agent-ready", address, model }),
    );
  } catch (error) {
    await app.close();
    throw error;
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "gemini-agent-start-failed",
      code:
        error instanceof AgentError ? error.code : "CONFIG_OR_STARTUP_ERROR",
    }),
  );
  process.exitCode = 1;
});
