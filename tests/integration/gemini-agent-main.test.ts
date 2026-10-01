import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test(
  "C2 offline entry: independent process loads only local key fields, random localhost port, sanitized logs and graceful lock release",
  { timeout: 15000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "kapibala-gemini-main-"));
    const key = "synthetic-startup-key-no-generation";
    const envFile = join(directory, ".env");
    await writeFile(
      envFile,
      `GEMINI_API_KEY=${key}\nDATABASE_URL=postgres://must-not-connect.invalid/test\nGATEWAY_URL=http://must-not-connect.invalid\n`,
      { mode: 0o600 },
    );
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/gemini-agent/src/main.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GEMINI_API_KEY: "",
          GOOGLE_API_KEY: "",
          GEMINI_ENV_FILE: envFile,
          GEMINI_SESSION_DIR: join(directory, "sessions"),
          GEMINI_AGENT_PORT: "0",
          GEMINI_MODEL: "gemini-3.1-flash-lite",
          DATABASE_URL: "postgres://must-not-connect.invalid/test",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const exited = once(child, "exit");
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
        try {
          await exited;
        } finally {
          clearTimeout(timer);
        }
      }
      await rm(directory, { recursive: true, force: true });
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const deadline = performance.now() + 5000;
    while (!stdout.includes("gemini-agent-ready")) {
      assert.ok(
        performance.now() < deadline && child.exitCode === null,
        "independent entry became ready",
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const ready = JSON.parse(stdout.trim());
    assert.match(ready.address, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal((await fetch(`${ready.address}/health`)).status, 200);
    const invalid = await fetch(`${ready.address}/agent/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: "synthetic",
        tools: [],
        messages: [
          { role: "user", content: [{ type: "text", text: "synthetic" }] },
        ],
      }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, "TOOLS_INVALID");
    child.kill("SIGTERM");
    const [code, signal] = await exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.equal(stdout.includes(key) || stderr.includes(key), false);
    assert.equal(stderr, "");
    await assert.rejects(access(join(directory, "sessions", "owner.lock")));
    t.diagnostic(
      JSON.stringify({
        childPid: child.pid,
        exitCode: code,
        serviceAddress: ready.address,
        realGenerationCalls: 0,
        keyLogged: false,
        ownerLockRemoved: true,
      }),
    );
  },
);
