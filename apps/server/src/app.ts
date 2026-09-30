import Fastify from "fastify";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { Database } from "./core/db.js";
import { AppError, RemoteError } from "./core/errors.js";
import { RemoteClient } from "./core/remote.js";
import { registerAuth } from "./core/auth.js";
import { registerRealtime } from "./core/realtime.js";
import { assertSchemaCurrent } from "./core/migrations.js";
import type { AppContext } from "./core/context.js";
import type { PlatformModule } from "./core/messaging.js";
import { ModuleProgress } from "./core/module-progress.js";
import type { RealtimeLimits } from "./core/socket-sender.js";
export interface AppOptions {
  db?: Database;
  modules?: (ctx: AppContext) => PlatformModule[];
  background?: boolean;
  logger?: boolean;
  realtime?: RealtimeLimits;
}
export async function createApp(options: AppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: () => randomUUID(),
  });
  const db =
    options.db ??
    new Database(
      process.env.DATABASE_URL ??
        "postgres://kapibala:kapibala@localhost:55432/kapibala",
    );
  let version: number;
  try {
    version = await assertSchemaCurrent(db);
  } catch (error) {
    if (!options.db) await db.close();
    throw error;
  }
  await app.register(cookie);
  await app.register(websocket);
  app.setErrorHandler((error, request, reply) => {
    const err = error as Error;
    if (err instanceof AppError)
      return reply.code(err.status).send({
        error: {
          code:
            err.status === 401
              ? "UNAUTHORIZED"
              : err.status === 403
                ? "FORBIDDEN"
                : err.code,
          message: err.message,
          requestId: request.id,
          ...err.details,
        },
      });
    if (
      err instanceof ZodError ||
      ("statusCode" in err && err.statusCode === 400)
    )
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数不合法",
          requestId: request.id,
          ...(err instanceof ZodError ? { issues: err.issues } : {}),
        },
      });
    app.log.error({ err, requestId: request.id }, "Request failed");
    return reply.code(err instanceof RemoteError ? 502 : 500).send({
      error: {
        code: err instanceof RemoteError ? err.code : "INTERNAL_ERROR",
        message:
          err instanceof RemoteError
            ? "外部服务暂时不可用"
            : "请求未完成，请查看关联日志",
        requestId: request.id,
      },
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: "接口不存在",
        requestId: request.id,
      },
    }),
  );
  await registerAuth(app, db);
  await registerRealtime(app, db, options.realtime);
  app.get("/api/health", async () => ({ ok: true, schemaVersion: version }));
  const ctx: AppContext = {
    db,
    gateway: new RemoteClient(
      process.env.GATEWAY_URL ?? "http://127.0.0.1:3101",
    ),
    agent: new RemoteClient(process.env.AGENT_URL ?? "http://127.0.0.1:3102"),
    log: app.log,
  };
  const modules = options.modules?.(ctx) ?? [];
  const progress = modules.map(
    (module, index) =>
      new ModuleProgress(
        "name" in module && typeof module.name === "string"
          ? module.name
          : `module-${index + 1}`,
        options.background !== false,
      ),
  );
  app.get("/api/diagnostics/background", async (request) => {
    if (request.identity?.role !== "admin")
      throw new AppError(403, "FORBIDDEN", "后台运行诊断仅管理员可查看");
    return {
      scope: "process",
      semantics: "scheduler-ticks-not-business-completion",
      observedAt: new Date().toISOString(),
      backgroundEnabled: options.background !== false,
      modules: progress.map((activity) => activity.snapshot()),
    };
  });
  for (const module of modules) await module.register(app);
  const timers: NodeJS.Timeout[] = [];
  const ticks = new Set<Promise<void>>();
  if (options.background !== false)
    for (const [index, module] of modules.entries()) {
      const activity = progress[index]!;
      activity.recovery = "running";
      try {
        await module.recover?.();
        activity.recovery = "succeeded";
      } catch (err) {
        activity.recovery = "failed";
        app.log.error({ err, module: activity.name }, "Module recovery failed");
        throw err;
      }
      let busy = false;
      timers.push(
        setInterval(() => {
          if (busy) return;
          busy = true;
          activity.start();
          const tick = Promise.resolve()
            .then(() => module.tick())
            .then(() => activity.finish(true))
            .catch((err) => {
              activity.finish(false);
              app.log.error(
                { err, module: activity.name },
                "Module tick failed",
              );
            })
            .finally(() => {
              busy = false;
              ticks.delete(tick);
            });
          ticks.add(tick);
        }, 100),
      );
    }
  app.addHook("onClose", async () => {
    timers.forEach(clearInterval);
    // Do not let an in-flight scheduler reopen resources after module shutdown.
    await Promise.allSettled(ticks);
    for (const module of modules) await module.close?.();
    if (!options.db) await db.close();
  });
  return app;
}
