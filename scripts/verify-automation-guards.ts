import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

// Two fixed, deliberately invalid patches in a disposable committed-source copy.
// The fixture creates/drops its own databases; DATABASE_URL must point at a
// developer-owned isolated PostgreSQL service, never the demo or QA service.
const exec = promisify(execFile);
const source = process.cwd();
assert.ok(
  process.env.DATABASE_URL,
  "DATABASE_URL must select an owned isolated PostgreSQL service",
);
assert.equal(
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  "",
  "commit the source before creating an evidence copy",
);
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const outputArg = process.argv.indexOf("--output");
assert.ok(
  outputArg >= 0 && process.argv[outputArg + 1],
  "--output evidence-directory is required",
);
const output = resolve(process.argv[outputArg + 1]!);
await mkdir(output, { recursive: true });
const copy = await mkdtemp(join(tmpdir(), "kapibala-guard-mutation-"));
const env: NodeJS.ProcessEnv = { ...process.env, GEMINI_LIVE_TESTS: "0" };
delete env.GEMINI_API_KEY;
delete env.GOOGLE_API_KEY;
delete env.GEMINI_ENV_FILE;
const file = "apps/server/src/modules/automation/tool-execution.ts";
const records: Record<string, unknown>[] = [];
let outcome = "failed";
try {
  const archive = execFileSync(
    "git",
    [
      "archive",
      "HEAD",
      "apps/server",
      "packages",
      "db",
      "scripts",
      "tests",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
    ],
    { maxBuffer: 128 * 1024 * 1024 },
  );
  const extraction = spawnSync("tar", ["-xf", "-", "-C", copy], {
    input: archive,
  });
  assert.equal(extraction.status, 0, extraction.stderr?.toString());
  await symlink(
    join(source, "node_modules"),
    join(copy, "node_modules"),
    "dir",
  );
  const original = await readFile(join(copy, file), "utf8");
  const scenarios = [
    { name: "baseline", from: "", to: "", assertion: "" },
    {
      name: "audit-fail-bypass",
      from: 'if (verdict === "fail") {\n      await complete(',
      to: "if (false) {\n      await complete(",
      assertion:
        "guard effects: audit fail creates no message/key and makes no remote send",
    },
    {
      name: "same-key-repeat-audit",
      from: "if (existing) {\n      await complete(await deliver(existing.client_msg_id, true));",
      to: "if (existing) {\n      await this.audit(run, step, input.text, fact.attemptId);\n      await complete(await deliver(existing.client_msg_id, true));",
      assertion:
        "guard effects: same key reuses original identity without a second audit or remote send",
    },
  ];
  for (const scenario of scenarios) {
    let modified = original;
    if (scenario.from) {
      assert.equal(
        original.split(scenario.from).length,
        2,
        "mutation anchor must match exactly once",
      );
      modified = original.replace(scenario.from, scenario.to);
    }
    await writeFile(join(copy, file), modified);
    await writeFile(
      join(output, `${scenario.name}.patch.json`),
      JSON.stringify({ file, from: scenario.from, to: scenario.to }, null, 2) +
        "\n",
    );
    const args = [
      join(copy, "node_modules/tsx/dist/cli.mjs"),
      "--test",
      "--test-reporter=tap",
      "--test-concurrency=1",
      "tests/integration/automation-guard-effects.test.ts",
    ];
    let code = 0,
      stdout = "",
      stderr = "";
    try {
      ({ stdout, stderr } = await exec(process.execPath, args, {
        cwd: copy,
        env,
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
      }));
    } catch (error) {
      const failure = error as {
        code: number | string;
        stdout: string;
        stderr: string;
        killed?: boolean;
      };
      assert.notEqual(
        failure.killed,
        true,
        "timeout is not mutation detection",
      );
      assert.equal(
        failure.code,
        1,
        "infrastructure/compile failures are not acceptable",
      );
      code = 1;
      stdout = failure.stdout;
      stderr = failure.stderr;
    }
    await writeFile(join(output, `${scenario.name}.tap`), stdout + stderr);
    if (scenario.name === "baseline") assert.equal(code, 0, stdout + stderr);
    else {
      assert.equal(code, 1, "the deliberately wrong implementation must fail");
      assert.match(stdout, /code: 'ERR_ASSERTION'/);
      assert.ok(
        stdout.includes(
          `not ok ${scenario.name === "audit-fail-bypass" ? "1" : "2"} - ${scenario.assertion}`,
        ),
        stdout,
      );
      assert.match(stdout, /# pass 1\n# fail 1/);
    }
    records.push({
      name: scenario.name,
      exitCode: code,
      detectedBy: scenario.assertion || null,
      command: [
        process.execPath,
        "node_modules/tsx/dist/cli.mjs",
        ...args.slice(1),
      ],
      sourceSha256: createHash("sha256").update(modified).digest("hex"),
    });
  }
  await writeFile(join(copy, file), original);
  const violation = join(
    copy,
    "apps/server/src/modules/gateway/controlled-boundary-violation.ts",
  );
  await writeFile(
    violation,
    'await tx.query("UPDATE agent_runs SET cancel_requested=true WHERE group_id=$1", [id]);\n',
  );
  let rejected = false;
  try {
    await exec(
      process.execPath,
      [
        join(copy, "node_modules/tsx/dist/cli.mjs"),
        "scripts/check-automation-boundaries.ts",
      ],
      { cwd: copy, env },
    );
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    assert.equal(failure.code, 1);
    assert.match(
      failure.stderr,
      /controlled-boundary-violation.ts:1: direct write/,
    );
    await writeFile(
      join(output, "controlled-boundary-violation.log"),
      failure.stdout + failure.stderr,
    );
    rejected = true;
  }
  assert.equal(rejected, true);
  records.push({
    name: "literal SQL boundary controlled violation",
    exitCode: 1,
    file: "apps/server/src/modules/gateway/controlled-boundary-violation.ts",
  });
  outcome = "passed";
} finally {
  await rm(copy, { recursive: true, force: true });
  await writeFile(
    join(output, "manifest.json"),
    JSON.stringify(
      {
        revision,
        outcome,
        node: process.version,
        records,
        temporaryCopy: copy,
        temporaryCopyRemoved: true,
        credentialsIncluded: false,
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `Two fixed mutation checks and the finite ownership violation check ${outcome}; evidence: ${output}`,
);
