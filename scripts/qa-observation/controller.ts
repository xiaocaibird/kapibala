import { readFile, readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import { z, ZodError } from "zod";
import {
  ControlError,
  same,
  targetSchema,
  type Target,
} from "../qa-capacity/protocol.js";
import {
  processIdentity,
  registryDirectory,
  verifyOwnership,
  type Registration,
} from "../qa-capacity/ownership.js";

import { bridgeRequest } from "../qa-capacity/controller.js";
import type {
  ObservationRequest as LeaseRequest,
  ObservationSnapshot as Snapshot,
} from "./types.js";
interface Record {
  request: LeaseRequest;
  registration: Registration;
  snapshot?: Snapshot;
  expiresAt: string;
  timer: NodeJS.Timeout;
}
export async function createObservationController<R extends LeaseRequest>({
  directory,
  prefix,
  protocol,
  requestSchema,
}: {
  directory: string;
  prefix: string;
  protocol: string;
  requestSchema: z.ZodType<R>;
}) {
  const folder = await registryDirectory(directory);
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  // The versioned QA client sends Content-Type on bodyless DELETE too.
  // Accept that exact empty form; PUT still requires parsed, validated JSON.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      if (
        (request.method === "DELETE" || request.method === "POST") &&
        body === ""
      )
        return done(null, undefined);
      try {
        done(null, JSON.parse(String(body)));
      } catch {
        done(new ControlError(400, "Expected a JSON request body"));
      }
    },
  );
  const leases = new Map<string, Record>();
  let creation: Promise<unknown> = Promise.resolve();
  let refreshing = false;
  app.setErrorHandler((error, _request, reply) =>
    reply
      .code(
        error instanceof ControlError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 503,
      )
      .send({ error: String(error) }),
  );
  async function locate(target: Target): Promise<Registration> {
    for (const file of await readdir(folder)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(file)) continue;
      try {
        const path = join(folder, file);
        const info = await lstat(path);
        if (
          !info.isFile() ||
          info.uid !== process.getuid!() ||
          info.mode & 0o077
        )
          continue;
        const candidate = JSON.parse(
          await readFile(path, "utf8"),
        ) as Registration;
        if (
          candidate.socket !== join(folder, `${candidate.instanceId}.sock`) ||
          `${candidate.instanceId}.json` !== file
        )
          continue;
        if (
          candidate.binding.apiUrl !== target.apiUrl ||
          candidate.binding.pid !== target.pid ||
          candidate.binding.revision !== target.revision
        )
          continue;
        const socket = await lstat(candidate.socket);
        if (
          !socket.isSocket() ||
          socket.uid !== process.getuid!() ||
          socket.mode & 0o077
        )
          continue;
        const live = await bridgeRequest<Registration>(
          candidate,
          "GET",
          "/identity",
        );
        if (!same(candidate, live) || !live.binding.observedOwnerToken)
          continue;
        await verifyOwnership(live, target);
        const advertised = await bridgeRequest<{ protocol: string }>(
          candidate,
          "GET",
          "/protocol",
        );
        if (advertised.protocol !== protocol) continue;
        return live;
      } catch {
        /* Stale registrations never authorize another live target. */
      }
    }
    throw new ControlError(
      409,
      "No live owned SUT matches API, guardian, token source and revision",
    );
  }
  function retain(record: Record, snapshot: Snapshot): Snapshot {
    if (record.snapshot) {
      const old = record.snapshot;
      const common = Math.min(old.events.length, snapshot.events.length);
      if (
        old.expiresAt !== snapshot.expiresAt ||
        !same(old.binding, snapshot.binding) ||
        !same(old.correlation, snapshot.correlation) ||
        !same(old.events.slice(0, common), snapshot.events.slice(0, common))
      )
        throw new ControlError(502, "SUT rewrote immutable lease history");
      // Concurrent GETs can finish out of order. Preserve the already exposed
      // prefix and released state, never roll history backwards.
      if (old.events.length > snapshot.events.length)
        snapshot.events = old.events;
      if (old.state === "released") snapshot.state = "released";
    }
    record.snapshot = structuredClone(snapshot);
    return structuredClone(record.snapshot);
  }
  async function gone(record: Record): Promise<boolean> {
    try {
      process.kill(record.registration.appPid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
      throw error;
    }
    try {
      return (
        (await processIdentity(record.registration.appPid)).started !==
        record.registration.appStarted
      );
    } catch (error) {
      // ps timing out is not proof that the holder process died. Only ESRCH
      // from a fresh kernel PID check authorizes this release fallback.
      try {
        process.kill(record.registration.appPid, 0);
      } catch (probe) {
        if ((probe as NodeJS.ErrnoException).code === "ESRCH") return true;
        throw probe;
      }
      throw error;
    }
  }
  async function refresh(
    id: string,
    method: "GET" | "DELETE" | "POST" = "GET",
  ): Promise<Snapshot> {
    const record = leases.get(id);
    if (!record)
      throw new ControlError(404, "Unknown lease; no resource was touched");
    try {
      return retain(
        record,
        await bridgeRequest<Snapshot>(
          record.registration,
          method,
          `/leases/${id}${method === "POST" ? "/advance" : ""}`,
        ),
      );
    } catch (error) {
      if (!(await gone(record))) throw error;
      if (!record.snapshot)
        throw new ControlError(
          409,
          "SUT died before any established holder snapshot was observed",
        );
      // The old process (and therefore all its JS slots) is gone. Never route
      // this cleanup by API port, which a subsequent SUT may already reuse.
      record.snapshot.state = "released";
      return structuredClone(record.snapshot);
    }
  }
  app.get<{ Querystring: { apiUrl: string; revision: string; pid: string } }>(
    `${prefix}/capabilities`,
    async (request) => {
      const target = targetSchema.parse({
        ...request.query,
        pid: Number(request.query.pid),
      });
      const registered = await locate(target);
      return {
        protocol,
        binding: registered.binding,
        capabilities: await bridgeRequest<string[]>(
          registered,
          "GET",
          "/capabilities",
        ),
      };
    },
  );
  app.put<{ Params: { id: string } }>(
    `${prefix}/leases/:id`,
    async (request) => {
      const id = z.uuid().parse(request.params.id);
      const body = requestSchema.parse(request.body);
      if (body.protocol !== protocol)
        throw new ControlError(400, "Wrong observation protocol");
      const operation = creation
        .catch(() => undefined)
        .then(async () => {
          const old = leases.get(id);
          if (old) {
            if (!same(old.request, body))
              throw new ControlError(
                409,
                "Lease UUID is already bound to different parameters",
              );
            return refresh(id);
          }
          const registration = await locate(body.target);
          for (const [otherId, record] of leases) {
            if (
              record.registration.instanceId === registration.instanceId &&
              record.snapshot?.state !== "released"
            ) {
              if ((await refresh(otherId)).state !== "released")
                throw new ControlError(
                  409,
                  "Target already has an independently owned lease",
                );
            }
          }
          const expiresAt = new Date(Date.now() + body.ttlMs).toISOString();
          const record: Record = {
            request: body,
            registration,
            expiresAt,
            timer: setTimeout(() => {
              void refresh(id, "DELETE").catch((error: unknown) =>
                app.log.error(error),
              );
            }, body.ttlMs),
          };
          leases.set(id, record); // Reserve before PUT: a lost response remains addressable.
          try {
            const snapshot = await bridgeRequest<Snapshot>(
              registration,
              "PUT",
              `/leases/${id}`,
              { request: body, expiresAt },
            );
            return retain(record, snapshot);
          } catch (error) {
            try {
              await refresh(id, "DELETE");
            } catch (cleanup) {
              // An explicit failed PUT response followed by a bridge 404 proves
              // establishment finished without registering holders. A transport
              // timeout does NOT prove that: retain that reservation until TTL.
              if (
                error instanceof ControlError &&
                cleanup instanceof ControlError &&
                cleanup.status === 404
              ) {
                clearTimeout(record.timer);
                leases.delete(id);
              }
            }
            throw error;
          }
        });
      creation = operation;
      return operation;
    },
  );
  for (const method of ["GET", "DELETE"] as const)
    app.route<{ Params: { id: string } }>({
      method,
      url: `${prefix}/leases/:id`,
      handler: (request) => refresh(z.uuid().parse(request.params.id), method),
    });
  app.post<{ Params: { id: string } }>(
    `${prefix}/leases/:id/advance`,
    async (request) => {
      if (request.body !== undefined)
        throw new ControlError(400, "Advance accepts no body");
      return refresh(z.uuid().parse(request.params.id), "POST");
    },
  );
  const poll = setInterval(() => {
    if (refreshing) return;
    refreshing = true;
    void Promise.allSettled(
      [...leases.keys()].map((id) => refresh(id)),
    ).finally(() => {
      refreshing = false;
    });
  }, 200);
  poll.unref();
  app.addHook("onClose", async () => {
    clearInterval(poll);
    await creation.catch(() => undefined);
    for (const [id, record] of leases) {
      clearTimeout(record.timer);
      await refresh(id, "DELETE").catch((error: unknown) =>
        app.log.error(error),
      );
    }
  });
  return app;
}
