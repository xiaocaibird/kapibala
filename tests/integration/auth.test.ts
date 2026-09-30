import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../apps/server/src/app.js";
import { Database } from "../../apps/server/src/core/db.js";
import { migrate } from "../../scripts/migrate.js";
const url =
  process.env.DATABASE_URL ??
  "postgres://kapibala:kapibala@localhost:55432/kapibala";
test("PostgreSQL sessions rotate, revoke on reuse, enforce viewer and logout", async () => {
  const db = new Database(url);
  await migrate(db);
  await migrate(db);
  const app = await createApp({ db, logger: false, background: false });
  app.post("/api/test-write", async () => ({ ok: true }));
  try {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "admin" },
    });
    assert.equal(login.statusCode, 200);
    const cookie1 = login.cookies[0]!;
    assert.equal(cookie1.httpOnly, true);
    assert.equal(Object.hasOwn(login.json(), "refreshToken"), false);
    const first = login.json<{ accessToken: string }>().accessToken;
    const rotated = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { refreshToken: cookie1.value },
    });
    assert.equal(rotated.statusCode, 200);
    const second = rotated.json<{ accessToken: string }>().accessToken;
    assert.equal(
      (
        await app.inject({
          url: "/api/auth/me",
          headers: { authorization: `Bearer ${second}` },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/refresh",
          cookies: { refreshToken: cookie1.value },
        })
      ).statusCode,
      401,
    );
    for (const token of [first, second])
      assert.equal(
        (
          await app.inject({
            url: "/api/auth/me",
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
        401,
      );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/refresh",
          cookies: { refreshToken: rotated.cookies[0]!.value },
        })
      ).statusCode,
      401,
    );
    const viewer = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "viewer", password: "viewer" },
    });
    const access = viewer.json<{ accessToken: string }>().accessToken;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/test-write",
          headers: { authorization: `Bearer ${access}` },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: { authorization: `Bearer ${access}` },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/auth/me",
          headers: { authorization: `Bearer ${access}` },
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
    await db.close();
  }
});
