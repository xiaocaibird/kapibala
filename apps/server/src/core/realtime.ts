import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "./db.js";
import { authenticate } from "./auth.js";
export async function registerRealtime(
  app: FastifyInstance,
  db: Database,
): Promise<void> {
  app.get("/ws", { websocket: true }, (socket) => {
    let token: string | undefined;
    let seq = 0;
    let authenticating = false;
    let stopped = false;
    let busy = false;
    const deadline = setTimeout(() => {
      if (!token) socket.close(4401, "Authentication required");
    }, 5000);
    socket.on("message", async (raw) => {
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
        try {
          await authenticate(db, token);
          const startSeq = Number(
            (
              await db.query<{ seq: string }>(
                "SELECT COALESCE(max(seq),0) AS seq FROM events",
              )
            ).rows[0]?.seq ?? 0,
          );
          // Control acknowledgements never advance the durable event replay cursor.
          if (!stopped && socket.readyState === 1)
            socket.send(
              JSON.stringify({
                type: "scope_ready",
                requestId: marker.data.requestId,
                startSeq,
              }),
            );
        } catch {
          socket.close(4401, "Session or connection unavailable");
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
        clearTimeout(deadline);
        socket.send(JSON.stringify({ type: "auth", success: true }));
      } catch {
        socket.close(4401, "Unauthorized");
      } finally {
        authenticating = false;
      }
    });
    const timer = setInterval(() => {
      if (stopped || busy || !token) return;
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
          if (socket.readyState !== 1) break;
          socket.send(
            JSON.stringify({
              seq: Number(row.seq),
              type: row.type,
              payload: row.payload,
            }),
          );
          seq = Number(row.seq);
        }
      })()
        .catch((error) => {
          app.log.warn({ err: error }, "Realtime stream interrupted");
          socket.close(4401, "Session or connection unavailable");
        })
        .finally(() => {
          busy = false;
        });
    }, 100);
    socket.on("close", () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(deadline);
    });
  });
}
