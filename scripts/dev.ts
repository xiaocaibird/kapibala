import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const children: ChildProcess[] = [];
let stopping = false;
function stop(code = 0): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}
function launch(name: string, args: string[]): void {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  children.push(child);
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${name} exited (${code ?? "signal"})`);
      stop(code ?? 1);
    }
  });
}
if (!existsSync(".env"))
  console.log("Using local defaults; copy .env.example to .env to customize.");
mkdirSync(".runtime", { recursive: true });
writeFileSync(".runtime/dev.pid", String(process.pid));
launch("simulators", ["--import", "tsx", "apps/simulator/src/main.ts"]);
launch("server", ["--import", "tsx", "apps/server/src/main.ts"]);
launch("console", [
  "node_modules/vite/bin/vite.js",
  "--config",
  "apps/web/vite.config.ts",
  "apps/web",
]);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => stop());
console.log("Console http://127.0.0.1:5173 | API http://127.0.0.1:3100");
