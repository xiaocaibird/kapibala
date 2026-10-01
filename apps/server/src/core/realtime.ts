import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "./db.js";
import { authenticate } from "./auth.js";
import { boundedSocketSender, type RealtimeLimits } from "./socket-sender.js";
export async function registerRealtime(
  app: FastifyInstance,
  db: Database,
  limits?: RealtimeLimits,
): Promise<void> {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const connection = {
      connectionId: request.id,
      pid: process.pid,
      peerAddress: request.raw.socket.remoteAddress,
      peerPort: request.raw.socket.remotePort,
      localAddress: request.raw.socket.localAddress,
      localPort: request.raw.socket.localPort,
    };
    const logObservation = (
      fields: Record<string, unknown>,
      message: string,
    ) => {
      try {
        app.log.info({ ...connection, ...fields }, message);
      } catch {
        /* Diagnostics must not reject authentication or interrupt transport. */
      }
    };
    // Bounded lifecycle summaries only: no tokens, message bodies, per-frame
    // logs or client-receipt claims. The socket tuple links external readers.
    const sender = boundedSocketSender(socket, limits, (transport) => {
      logObservation(
        { component: "realtime-transport", ...transport },
        "Realtime transport observation",
      );
    });
    let token: string | undefined;
    let seq = 0;
    let authenticating = false;
    let stopped = false;
    let busy = false;
    let markerBusy = false;
    const pendingMarkers = new Set<string>();
    const deadline = setTimeout(() => {
      if (!token) sender.close(4401, "Authentication required");
    }, 5000);
    socket.on("message", async (raw) => {
      if (stopped || sender.stopped) return;
      if (token) {
        let input: unknown;
        try {
          input = JSON.parse(raw.toString()) as unknown;
        } catch {
          // Authenticated legacy clients could send ignored non-control frames.
          return;
        }
        const marker = z
          .object({
            type: z.literal("scope_marker"),
            requestId: z.string().min(1).max(128),
          })
          .safeParse(input);
        if (!marker.success) return;
        // Batch pending marker reads without dropping any admitted request ID.
        // The fixed queue also bounds work when a peer floods control frames.
        pendingMarkers.add(marker.data.requestId);
        if (pendingMarkers.size > 128) {
          pendingMarkers.clear();
          sender.close(1013, "Too many pending markers; reconnect to resume");
          return;
        }
        if (markerBusy) return;
        markerBusy = true;
        try {
          while (pendingMarkers.size && !sender.stopped) {
            const requestIds = [...pendingMarkers];
            pendingMarkers.clear();
            await authenticate(db, token);
            const startSeq = Number(
              (
                await db.query<{ seq: string }>(
                  "SELECT COALESCE(max(seq),0) AS seq FROM events",
                )
              ).rows[0]?.seq ?? 0,
            );
            // Control acknowledgements never advance the durable event replay cursor.
            for (const requestId of requestIds) {
              if (
                stopped ||
                !(await sender.send({
                  type: "scope_ready",
                  requestId,
                  startSeq,
                }))
              )
                break;
            }
          }
        } catch {
          sender.close(4401, "Session or connection unavailable");
        } finally {
          markerBusy = false;
        }
        return;
      }
      if (authenticating) return;
      authenticating = true;
      try {
        const auth = z
          .object({
            type: z.literal("auth"),
            accessToken: z.string(),
            sinceSeq: z.number().int().nonnegative().optional(),
          })
          .parse(JSON.parse(raw.toString()));
        await authenticate(db, auth.accessToken);
        // Read the current watermark before acknowledging; newly committed events are then replayed.
        seq =
          auth.sinceSeq ??
          Number(
            (
              await db.query<{ seq: string }>(
                "SELECT COALESCE(max(seq),0) AS seq FROM events",
              )
            ).rows[0]?.seq ?? 0,
          );
        token = auth.accessToken;
        logObservation(
          {
            component: "realtime-auth",
            at: new Date().toISOString(),
            monotonicMs: performance.now(),
            requestedSinceSeq: auth.sinceSeq ?? null,
            replayAfterSeq: seq,
          },
          "Realtime authentication accepted",
        );
        clearTimeout(deadline);
        await sender.send({ type: "auth", success: true });
      } catch {
        sender.close(4401, "Unauthorized");
      } finally {
        authenticating = false;
      }
    });
    const timer = setInterval(() => {
      if (stopped || sender.stopped || busy || !token) return;
      busy = true;
      void (async () => {
        await authenticate(db, token);
        const events = await db.query<{
          seq: string;
          type: string;
          payload: unknown;
        }>(
          "SELECT seq,type,payload FROM events WHERE seq>$1 ORDER BY seq LIMIT 500",
          [seq],
        );
        for (const row of events.rows) {
          const sent = await sender.send({
            seq: Number(row.seq),
            type: row.type,
            payload: row.payload,
          });
          if (!sent) break;
          seq = Number(row.seq);
        }
      })()
        .catch((error) => {
          app.log.warn({ err: error }, "Realtime stream interrupted");
          sender.close(4401, "Session or connection unavailable");
        })
        .finally(() => {
          busy = false;
        });
    }, 100);
    socket.on("close", () => {
      stopped = true;
      pendingMarkers.clear();
      clearInterval(timer);
      clearTimeout(deadline);
    });
  });
}
