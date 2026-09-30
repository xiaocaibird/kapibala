import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "./errors.js";
import type { Database, Queryable } from "./db.js";
export interface Identity {
  sessionId: string;
  username: string;
  role: "admin" | "viewer";
}
declare module "fastify" {
  interface FastifyRequest {
    identity?: Identity;
  }
}
const hash = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/auth",
  maxAge: 7 * 86400,
};
async function issue(
  tx: Queryable,
  sessionId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(48).toString("base64url");
  await tx.query(
    "INSERT INTO auth_tokens(token_hash,session_id,kind,expires_at) VALUES($1,$3,'access',now()+interval '15 minutes'),($2,$3,'refresh',now()+interval '7 days')",
    [hash(accessToken), hash(refreshToken), sessionId],
  );
  return { accessToken, refreshToken };
}
export async function authenticate(
  db: Database,
  token: string | undefined,
): Promise<Identity> {
  if (!token) throw new AppError(401, "UNAUTHORIZED", "请登录后继续");
  const r = await db.query<{
    session_id: string;
    username: string;
    role: "admin" | "viewer";
  }>(
    "SELECT t.session_id,s.username,s.role FROM auth_tokens t JOIN auth_sessions s ON s.id=t.session_id WHERE t.token_hash=$1 AND t.kind='access' AND t.expires_at>now() AND s.revoked_at IS NULL",
    [hash(token)],
  );
  const row = r.rows[0];
  if (!row) throw new AppError(401, "UNAUTHORIZED", "登录会话已失效");
  return { sessionId: row.session_id, username: row.username, role: row.role };
}
export const bearer = (request: FastifyRequest): string | undefined =>
  request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
export async function registerAuth(
  app: FastifyInstance,
  db: Database,
): Promise<void> {
  app.addHook("onRequest", async (request) => {
    const path = request.url.split("?")[0] ?? "";
    if (
      !path.startsWith("/api/") ||
      ["/api/health", "/api/auth/login", "/api/auth/refresh"].includes(path)
    )
      return;
    request.identity = await authenticate(db, bearer(request));
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      path !== "/api/auth/logout" &&
      request.identity.role !== "admin"
    )
      throw new AppError(403, "FORBIDDEN", "只读账号不能执行写操作");
  });
  app.post("/api/auth/login", async (request, reply) => {
    const { username, password } = z
      .object({ username: z.string(), password: z.string() })
      .parse(request.body);
    const allowed = username === "admin" || username === "viewer";
    const valid =
      allowed &&
      timingSafeEqual(Buffer.from(hash(password)), Buffer.from(hash(username)));
    if (!valid) throw new AppError(401, "UNAUTHORIZED", "用户名或密码错误");
    const result = await db.transaction(async (tx) => {
      const id = randomUUID();
      await tx.query(
        "INSERT INTO auth_sessions(id,username,role) VALUES($1,$2,$2)",
        [id, username],
      );
      return issue(tx, id);
    });
    reply.setCookie("refreshToken", result.refreshToken, cookieOptions);
    return { accessToken: result.accessToken };
  });
  app.post("/api/auth/refresh", async (request, reply) => {
    const token = request.cookies.refreshToken;
    if (!token) throw new AppError(401, "UNAUTHORIZED", "缺少续期会话");
    // Reuse revocation must commit. Throwing inside this transaction would undo it.
    const result = await db.transaction(async (tx) => {
      const lookup = await tx.query<{ session_id: string }>(
        "SELECT session_id FROM auth_tokens WHERE token_hash=$1 AND kind=$2",
        [hash(token), "refresh"],
      );
      const found = lookup.rows[0];
      if (!found) return null;
      const session = await tx.query<{ revoked_at: Date | null }>(
        "SELECT revoked_at FROM auth_sessions WHERE id=$1 FOR UPDATE",
        [found.session_id],
      );
      if (!session.rows[0] || session.rows[0].revoked_at) return null;
      const row = (
        await tx.query<{ used_at: Date | null; expired: boolean }>(
          "SELECT used_at,expires_at<=now() AS expired FROM auth_tokens WHERE token_hash=$1",
          [hash(token)],
        )
      ).rows[0];
      if (!row || row.expired || row.used_at) {
        await tx.query(
          "UPDATE auth_sessions SET revoked_at=now() WHERE id=$1",
          [found.session_id],
        );
        return null;
      }
      await tx.query(
        "UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1",
        [hash(token)],
      );
      return issue(tx, found.session_id);
    });
    if (!result) {
      reply.clearCookie("refreshToken", cookieOptions);
      throw new AppError(401, "UNAUTHORIZED", "续期会话已失效");
    }
    reply.setCookie("refreshToken", result.refreshToken, cookieOptions);
    return { accessToken: result.accessToken };
  });
  app.get("/api/auth/me", async (request) => ({
    username: request.identity!.username,
    role: request.identity!.role,
  }));
  app.post("/api/auth/logout", async (request, reply) => {
    await db.query("UPDATE auth_sessions SET revoked_at=now() WHERE id=$1", [
      request.identity!.sessionId,
    ]);
    reply.clearCookie("refreshToken", cookieOptions);
    return { ok: true };
  });
}
