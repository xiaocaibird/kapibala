import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { SyntaxKind, createScanner } from "typescript/unstable/ast";

// A deliberately finite boundary: gateway may read automation-owned tables,
// but writes must stay in automation (transaction helpers retain the caller's tx).
// This scans literal SQL fragments, not arbitrary SQL/dataflow or dynamic names.
const writes =
  /\b(?:update|insert\s+into|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?(?:agent_runs|agent_steps|agent_pending|agent_send_keys|sequence_runs|sequence_steps)\b/i;
function violations(_name: string, text: string): number[] {
  // The repository pins TypeScript 7; its scanner skips source comments and
  // decodes string escapes. Re-scan template tails after interpolation braces.
  const scanner = createScanner(true, undefined, text);
  const templateDepth: number[] = [];
  const lines: number[] = [];
  for (
    let kind = scanner.scan();
    kind !== SyntaxKind.EndOfFile;
    kind = scanner.scan()
  ) {
    if (kind === SyntaxKind.OpenBraceToken && templateDepth.length)
      templateDepth[templateDepth.length - 1]!++;
    if (kind === SyntaxKind.CloseBraceToken && templateDepth.length) {
      if (templateDepth.at(-1) === 0) kind = scanner.reScanTemplateToken(false);
      else templateDepth[templateDepth.length - 1]!--;
    }
    if (kind === SyntaxKind.TemplateHead) templateDepth.push(0);
    if (kind === SyntaxKind.TemplateTail) templateDepth.pop();
    if (
      [
        SyntaxKind.StringLiteral,
        SyntaxKind.NoSubstitutionTemplateLiteral,
        SyntaxKind.TemplateHead,
        SyntaxKind.TemplateMiddle,
        SyntaxKind.TemplateTail,
      ].includes(kind)
    ) {
      const sql = scanner
        .getTokenValue()
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/--[^\n]*/g, " ")
        .replaceAll('"', "");
      if (writes.test(sql))
        lines.push(text.slice(0, scanner.getTokenStart()).split("\n").length);
    }
  }
  return lines;
}

if (process.argv.includes("--self-test")) {
  assert.deepEqual(
    violations(
      "allowed.ts",
      'await requestGroupAgentCancellation(tx, id); await tx.query("SELECT * FROM agent_runs");',
    ),
    [],
  );
  assert.deepEqual(
    violations(
      "comment.ts",
      "// UPDATE agent_runs SET cancel_requested=true\n",
    ),
    [],
  );
  assert.equal(
    violations(
      "forbidden.ts",
      'await tx.query("UPDATE agent_runs SET cancel_requested=true WHERE group_id=$1", [id]);',
    ).length,
    1,
  );
  assert.equal(
    violations(
      "quoted.ts",
      'await tx.query(`DELETE FROM "public"."agent_steps" WHERE run_id=$1`, [id]);',
    ).length,
    1,
  );
  assert.equal(
    violations(
      "template.ts",
      "await tx.query(`${tablePrefix} UPDATE agent_runs SET cancel_requested=true`);",
    ).length,
    1,
  );
  assert.equal(
    violations(
      "nested-template.ts",
      "await tx.query(`${({ value: `nested ${id}` }).value} DELETE FROM agent_steps`);",
    ).length,
    1,
  );
  console.log(
    "Boundary self-test: allowed transaction delegation and controlled direct-write violations distinguished.",
  );
}

const rootIndex = process.argv.indexOf("--root");
const root = resolve(
  rootIndex < 0 ? process.cwd() : process.argv[rootIndex + 1]!,
);
const directory = resolve(root, "apps/server/src/modules/gateway");
let files = 0;
let failed = false;
async function inspect(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files++;
      for (const line of violations(file, await readFile(file, "utf8"))) {
        console.error(
          `${relative(root, file)}:${line}: direct write to an automation-owned table; delegate with the existing transaction.`,
        );
        failed = true;
      }
    }
  }
}
await inspect(directory);
if (failed) process.exitCode = 1;
else
  console.log(
    `Automation boundary: ${files} gateway TypeScript files checked (literal SQL only).`,
  );
