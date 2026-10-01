import { randomUUID } from "node:crypto";
import { chmod, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import {
  processIdentity,
  registryDirectory,
  type Registration,
} from "../qa-capacity/ownership.js";
import { ControlError } from "../qa-capacity/protocol.js";
import type { ObservationRequest, ObservationRuntime } from "./types.js";

/** Explicit engineering entry only. Its registry binds the already-listening
 * real application and guardian; no production route or environment auto-hook. */
export async function createObservationBridge<R extends ObservationRequest>({
  directory,
  apiUrl,
  revision,
  runtime,
}: {
  directory: string;
  apiUrl: string;
  revision: string;
  runtime: ObservationRuntime<R>;
}) {
  const token = process.env.QA_ACCEPTANCE_RESOURCE_TOKEN;
  if (!token)
    throw new ControlError(403, "Explicit QA resource token required");
  const folder = await registryDirectory(directory);
  const identity = await processIdentity(process.pid);
  const guardian = await processIdentity(identity.pgid);
  const instanceId = randomUUID();
  const socket = join(folder, `${instanceId}.sock`);
  if (Buffer.byteLength(socket) > 100)
    throw new ControlError(400, "Registry socket path exceeds 100 bytes");
  const registration: Registration = {
    instanceId,
    socket,
    appPid: process.pid,
    appStarted: identity.started,
    guardianStarted: guardian.started,
    binding: {
      apiUrl,
      revision,
      pid: identity.pgid,
      observedOwnerToken: token,
    },
  };
  const app = Fastify({ logger: false, bodyLimit: 16384 });
  app.setErrorHandler((error, _req, reply) =>
    reply
      .code(error instanceof ControlError ? error.status : 503)
      .send({ error: String(error) }),
  );
  app.get("/identity", () => registration);
  app.get("/protocol", () => ({ protocol: runtime.protocol }));
  app.get("/capabilities", () => runtime.capabilities());
  app.put<{ Params: { id: string }; Body: { request: R; expiresAt: string } }>(
    "/leases/:id",
    (r) =>
      runtime.establish(
        r.params.id,
        r.body.request,
        r.body.expiresAt,
        registration.binding,
      ),
  );
  app.get<{ Params: { id: string } }>("/leases/:id", (r) =>
    runtime.snapshot(r.params.id),
  );
  app.post<{ Params: { id: string } }>("/leases/:id/advance", (r) =>
    runtime.advance(r.params.id),
  );
  app.delete<{ Params: { id: string } }>("/leases/:id", (r) =>
    runtime.release(r.params.id),
  );
  const file = join(folder, `${instanceId}.json`);
  try {
    await app.listen({ path: socket });
    await chmod(socket, 0o600);
    await writeFile(`${file}.tmp`, JSON.stringify(registration), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(`${file}.tmp`, file);
  } catch (error) {
    await app.close();
    await unlink(`${file}.tmp`).catch(() => undefined);
    throw error;
  }
  return {
    registration,
    close: async () => {
      await app.close();
      await unlink(file).catch(() => undefined);
    },
  };
}
