// Copy unchanged to .db002-application.mjs in each isolated source archive.
// Run with Node 24 --import tsx. This mounts real HTTP routes, with ticks disabled.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createApp } from "./apps/server/src/app.ts";
import { createGatewayModule } from "./apps/server/src/modules/gateway/index.ts";

assert.ok(process.env.DATABASE_URL, "explicit owned DATABASE_URL required");
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, "127.0.0.1");
assert.ok(database.port && database.port !== "55432", "use an owned isolated database port");
const manifest = JSON.parse(await readFile(process.env.DB002_MANIFEST, "utf8"));
const variant = process.env.DB002_VARIANT;
assert.ok(variant === "optimized" || variant === "original");
const actualSha256 = createHash("sha256")
  .update(await readFile(manifest.file)).digest("hex");
assert.equal(actualSha256, manifest.sourceSha256[
  variant === "optimized" ? "product" : "controlledOriginalQueryVariant"
]);
// No dotenv/key-file loading, provider request, database migration or fixture writing.
process.env.GATEWAY_URL = "http://127.0.0.1:1";
process.env.AGENT_URL = "http://127.0.0.1:1";
const app = await createApp({
  logger: false,
  background: false,
  modules: (ctx) => [createGatewayModule(ctx)],
});
const apiUrl = await app.listen({ host: "127.0.0.1", port: 0 });
console.log(JSON.stringify({
  kind: "db002-application-ready", baseRevision: manifest.productRevision,
  variant, sourceSha256: actualSha256, pid: process.pid, apiUrl,
  databaseHost: database.hostname, databasePort: database.port,
  databaseName: database.pathname.slice(1), backgroundEnabled: false,
}));
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  if (closing) return;
  closing = true;
  void app.close().then(() => process.exit(0), () => process.exit(1));
});
