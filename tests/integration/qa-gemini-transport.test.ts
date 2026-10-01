import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { test, type TestContext } from "node:test";
import {
  createQaGeminiTransport,
  type QaTransportEvent,
} from "../../scripts/qa-gemini-transport.js";

const syntheticKey = "qa-offline-synthetic-key";
const providerPath = "/v1beta/models/gemini-3.1-flash-lite:generateContent";
const expectedUrl = `https://generativelanguage.googleapis.com${providerPath}`;
const body = "synthetic-private-request-body";
const options = {
  method: "POST",
  body,
  redirect: "error" as const,
  headers: { "x-goog-api-key": syntheticKey },
};
async function listen(t: TestContext, handler: RequestListener) {
  const server = createServer(handler);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}
async function until(predicate: () => boolean) {
  const deadline = performance.now() + 3000;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, "transport event deadline");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
test(
  "QA transport facts: actual request/socket and unconsumed redirect or unknown-destination attempts",
  { timeout: 10000 },
  async (t) => {
    const events: QaTransportEvent[] = [];
    let sourceCalls = 0;
    let targetCalls = 0;
    let redirect = false;
    const targetPort = await listen(t, (_request, response) => {
      targetCalls++;
      response.end("unexpected");
    });
    const providerPort = await listen(t, (request, response) => {
      sourceCalls++;
      assert.equal(request.url, providerPath);
      assert.equal(request.headers["x-goog-api-key"], syntheticKey);
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        assert.equal(Buffer.concat(chunks).toString(), body);
        if (redirect)
          response
            .writeHead(302, {
              location: `http://127.0.0.1:${targetPort}/private-location`,
            })
            .end();
        else response.end("actual-provider-bytes");
      });
    });
    const transport = createQaGeminiTransport({
      providerPort,
      providerPath,
      expectedUrl,
      syntheticKey,
      observe: (event) => events.push(event),
    });
    assert.equal(
      await (await transport(expectedUrl, options)).text(),
      "actual-provider-bytes",
    );
    await until(() => events.some((event) => event.kind === "socket-close"));
    const attempt = events[0]!;
    assert.equal(attempt.kind, "attempt");
    assert.equal(attempt.details.inputUrl, expectedUrl);
    assert.equal(attempt.details.method, "POST");
    assert.equal(attempt.details.redirect, "error");
    assert.equal(attempt.details.keyHeaderPresent, true);
    assert.equal(attempt.details.matchesSyntheticKey, true);
    assert.equal(attempt.details.syntheticKeyElsewhere, false);
    assert.ok(
      events.some(
        (event) =>
          event.kind === "socket-connected" &&
          event.details.remotePort === providerPort &&
          event.details.remoteAddress === "127.0.0.1",
      ),
    );
    assert.ok(events.some((event) => event.kind === "response-end"));
    assert.ok(events.some((event) => event.kind === "response-close"));
    assert.ok(events.every((event) => event.requestId === attempt.requestId));
    redirect = true;
    await assert.rejects(
      transport(expectedUrl, options),
      /QA_PROVIDER_REDIRECT_REJECTED/,
    );
    assert.equal(targetCalls, 0);
    assert.ok(
      events.some(
        (event) =>
          event.kind === "redirect-rejected" && event.details.status === 302,
      ),
    );
    const beforeUnknown = events.length;
    await assert.rejects(
      transport(`https://not-allowed.invalid/${syntheticKey}`, {
        ...options,
        body: syntheticKey,
      }),
      /QA_PROVIDER_REQUEST_REJECTED/,
    );
    const unknown = events.slice(beforeUnknown);
    assert.deepEqual(
      unknown.map((event) => event.kind),
      ["attempt", "request-rejected"],
    );
    assert.equal(unknown[0]!.details.inputUrl, "[redacted]");
    assert.equal(unknown[0]!.details.inputUrlAllowed, false);
    assert.equal(unknown[0]!.details.syntheticKeyElsewhere, true);
    assert.equal(sourceCalls, 2);
    assert.equal(targetCalls, 0);
    const serialized = JSON.stringify(events);
    assert.ok(!serialized.includes(syntheticKey));
    assert.ok(!serialized.includes(body));
    assert.ok(!serialized.includes("private-location"));
  },
);

test(
  "QA transport facts: conversion error, actual abort, connection error, throwing/absent observation preserve behavior",
  { timeout: 10000 },
  async (t) => {
    const events: QaTransportEvent[] = [];
    let mode = "600";
    let reached: (() => void) | undefined;
    const providerPort = await listen(t, (request, response) => {
      request.resume();
      if (mode === "600") response.writeHead(600).end("invalid");
      else if (mode === "abort") reached?.();
      else if (mode === "reset") request.socket.destroy();
      else response.end("recovered");
    });
    const config = { providerPort, providerPath, expectedUrl, syntheticKey };
    const transport = createQaGeminiTransport({
      ...config,
      observe: (event) => events.push(event),
    });
    await assert.rejects(transport(expectedUrl, options), RangeError);
    assert.ok(
      events.some(
        (event) =>
          event.kind === "response-conversion-rejected" &&
          event.details.status === 600,
      ),
    );
    mode = "abort";
    const received = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const abort = new AbortController();
    const pending = transport(expectedUrl, {
      ...options,
      signal: abort.signal,
    });
    const rejection = assert.rejects(pending, { name: "AbortError" });
    await received;
    abort.abort();
    await rejection;
    assert.ok(events.some((event) => event.kind === "signal-aborted"));
    assert.ok(
      events.some(
        (event) =>
          event.kind === "request-error" && event.details.code === "ABORT_ERR",
      ),
    );
    mode = "reset";
    await assert.rejects(transport(expectedUrl, options));
    assert.ok(
      events.some(
        (event) =>
          event.kind === "request-error" && event.details.code === "ECONNRESET",
      ),
    );
    mode = "success";
    const throwingObserver = createQaGeminiTransport({
      ...config,
      observe: () => {
        throw new Error("observer failed");
      },
    });
    assert.equal(
      await (await throwingObserver(expectedUrl, options)).text(),
      "recovered",
    );
    assert.equal(
      await (
        await createQaGeminiTransport(config)(expectedUrl, options)
      ).text(),
      "recovered",
    );
    assert.equal(
      await (await transport(expectedUrl, options)).text(),
      "recovered",
    );
  },
);
