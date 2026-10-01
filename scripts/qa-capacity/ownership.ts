import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Binding, Target } from "./protocol.js";
import { ControlError } from "./protocol.js";
const execute = promisify(execFile);
export interface Registration {
  instanceId: string;
  socket: string;
  appPid: number;
  appStarted: string;
  guardianStarted: string;
  binding: Binding;
}
export async function registryDirectory(path: string): Promise<string> {
  const directory = resolve(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await stat(directory);
  if (
    !info.isDirectory() ||
    info.uid !== process.getuid!() ||
    info.mode & 0o077
  )
    throw new ControlError(
      403,
      "Registry must be owned by this uid with mode 0700",
    );
  return directory;
}
export async function processIdentity(pid: number) {
  const { stdout } = await execute(
    "ps",
    ["-p", String(pid), "-o", "ppid=,pgid=,uid=,lstart="],
    { timeout: 2000 },
  );
  const match = stdout.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
  if (!match) throw new ControlError(409, "Process is no longer alive");
  return {
    ppid: Number(match[1]),
    pgid: Number(match[2]),
    uid: Number(match[3]),
    started: match[4]!,
  };
}
export async function sourceRevision(): Promise<string> {
  const { stdout: dirty } = await execute("git", [
    "status",
    "--porcelain",
    "--untracked-files=normal",
    "--",
    "apps/server",
    "packages",
    "scripts",
    "db",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
  ]);
  if (dirty.trim())
    throw new ControlError(
      409,
      "Commit engineering and product sources before starting the controlled SUT",
    );
  const { stdout } = await execute("git", ["rev-parse", "HEAD"]);
  return stdout.trim();
}
export async function verifyOwnership(
  registration: Registration,
  target: Target,
): Promise<void> {
  const b = registration.binding;
  if (
    b.apiUrl !== target.apiUrl ||
    b.revision !== target.revision ||
    b.pid !== target.pid
  )
    throw new ControlError(
      409,
      "Target does not match the live SUT registration",
    );
  const app = await processIdentity(registration.appPid);
  const guardian = await processIdentity(b.pid);
  if (
    app.uid !== process.getuid!() ||
    guardian.uid !== app.uid ||
    app.pgid !== b.pid ||
    guardian.pgid !== b.pid ||
    app.started !== registration.appStarted ||
    guardian.started !== registration.guardianStarted
  )
    throw new ControlError(403, "SUT owner process identity changed");
  let ancestor = registration.appPid;
  const seen = new Set<number>();
  while (ancestor !== b.pid) {
    if (ancestor <= 1 || seen.has(ancestor))
      throw new ControlError(403, "SUT is not a guardian descendant");
    seen.add(ancestor);
    const identity = await processIdentity(ancestor);
    if (identity.uid !== app.uid || identity.pgid !== b.pid)
      throw new ControlError(403, "SUT ancestry left its owned group");
    ancestor = identity.ppid;
  }
  const port = new URL(b.apiUrl).port;
  const { stdout } = await execute(
    "lsof",
    [
      "-nP",
      "-a",
      "-p",
      String(registration.appPid),
      "-iTCP:" + port,
      "-sTCP:LISTEN",
      "-Fp",
    ],
    { timeout: 2000 },
  );
  if (!stdout.split("\n").includes(`p${registration.appPid}`))
    throw new ControlError(
      403,
      "API listener is not owned by the registered application",
    );
}
