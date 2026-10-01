// Independent engineering self-test. No QA asset or product-module imports.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  setImmediate as immediate,
  setTimeout as delay,
} from "node:timers/promises";
import pg from "pg";

const canary = "synthetic-egress-canary-value";
const self = fileURLToPath(import.meta.url);
const preload = fileURLToPath(
  new URL("./qa-egress-observation.mjs", import.meta.url),
);

async function request(url, options = {}) {
  const transport = String(url).startsWith("https:") ? https : http;
  return new Promise((resolveResponse, reject) => {
    const outgoing = transport.request(url, options, (incoming) => {
      incoming.resume();
      incoming.once("end", () => resolveResponse(incoming.statusCode));
      incoming.once("error", reject);
    });
    outgoing.once("error", reject);
    outgoing.end(options.method === "POST" ? canary : undefined);
  });
}
async function worker(kind) {
  const cfg = JSON.parse(process.env.QA_EGRESS_TEST_CONFIG);
  if (kind === "proxy") {
    const result = await fetch(
      `http://qa-owned-proxy.invalid/proxy-example?omit=${canary}`,
    );
    assert.equal(await result.text(), "ok");
  } else if (kind === "kill") {
    await fetch(`${cfg.origin}/hold-kill`);
    throw new Error("Kill window unexpectedly returned");
  } else if (kind === "unhandled") {
    net.connect(cfg.deniedPort, "127.0.0.1");
    await delay(5000);
    throw new Error("Unhandled error was swallowed");
  } else {
    for (const suffix of ["one", "two", "three"]) {
      const result = await fetch(
        `${cfg.origin}/fetch-${suffix}?omit=${canary}`,
        {
          method: "POST",
          headers: { authorization: canary },
          body: canary,
        },
      );
      assert.equal(await result.text(), "ok");
      await immediate();
    }
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    for (const suffix of ["one", "two"])
      assert.equal(
        await request(`${cfg.origin}/native-${suffix}?omit=${canary}`, {
          agent,
          headers: { authorization: canary },
        }),
        200,
      );
    agent.destroy();
    const tlsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 1,
      ca: await readFile(cfg.cert),
    });
    assert.equal(
      await request(`${cfg.secureOrigin}/native-tls`, { agent: tlsAgent }),
      200,
    );
    tlsAgent.destroy();
    assert.equal(
      await (await fetch(`${cfg.secureOrigin}/fetch-tls`)).text(),
      "ok",
    );
    const connected = net.connect(cfg.port, "127.0.0.1");
    await once(connected, "connect");
    const preconnectedAgent = new http.Agent({ keepAlive: false });
    preconnectedAgent.createConnection = () => connected;
    assert.equal(
      await request(`${cfg.origin}/preconnected`, { agent: preconnectedAgent }),
      200,
    );
    preconnectedAgent.destroy();
    assert.equal(
      await (await fetch(`${cfg.origin}/redirect-follow`)).text(),
      "ok",
    );
    const manual = await fetch(`${cfg.origin}/redirect-manual`, {
      redirect: "manual",
    });
    assert.equal(manual.status, 302);
    await manual.body.cancel();
    await assert.rejects(fetch(`http://127.0.0.1:${cfg.deniedPort}/denied`));
    await assert.rejects(fetch(`http://127.0.0.1:${cfg.refusedPort}/refused`));
    const controller = new AbortController();
    const reached = once(process, "message");
    const held = fetch(`${cfg.origin}/hold`, { signal: controller.signal });
    const settled = held.then(
      () => "fulfilled",
      () => "rejected",
    );
    await reached;
    controller.abort();
    assert.equal(await settled, "rejected");
    const client = new pg.Client({
      connectionString: process.env.QA_EGRESS_TEST_DATABASE_URL,
    });
    try {
      await client.connect();
      assert.equal(
        (await client.query("SELECT 42 AS value")).rows[0].value,
        42,
      );
    } finally {
      await client.end();
    }
    await delay(40);
  }
  process.send?.({ event: "worker-finished", kind });
  process.disconnect?.();
}

async function main() {
  const database = process.env.QA_EGRESS_TEST_DATABASE_URL;
  if (!database) throw new Error("QA_EGRESS_TEST_DATABASE_URL_REQUIRED");
  const db = new URL(database);
  assert.equal(db.hostname, "127.0.0.1");
  assert.notEqual(db.port, "55432");
  assert.ok(
    db.pathname.startsWith("/egress_observation_"),
    "Only explicit isolated engineering database accepted",
  );
  const base = resolve(".runtime");
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "egress-observation-"));
  const key = join(directory, "fixture.key"),
    cert = join(directory, "fixture.crt");
  const generated = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    generated.status,
    0,
    "Local synthetic TLS certificate generation failed",
  );
  const wire = [],
    proxyWire = [],
    servers = [],
    children = new Set();
  const listen = async (server) => {
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return server.address().port;
  };
  let activeChild, activeKind;
  const handler = (incoming, outgoing) => {
    const fact = {
      run: activeKind,
      path: new URL(incoming.url, "http://local").pathname,
      method: incoming.method,
      at: new Date().toISOString(),
      remotePort: incoming.socket.remotePort,
      responseFinished: false,
      closed: false,
    };
    wire.push(fact);
    incoming.resume();
    outgoing.once("finish", () => {
      fact.responseFinished = true;
    });
    outgoing.once("close", () => {
      fact.closed = true;
    });
    if (fact.path === "/hold") {
      activeChild.send({ event: "hold-received" });
      return;
    }
    if (fact.path === "/hold-kill") {
      activeChild.kill("SIGKILL");
      return;
    }
    if (fact.path === "/redirect-follow") {
      outgoing.writeHead(302, { location: "/follow-target" }).end();
      return;
    }
    if (fact.path === "/redirect-manual") {
      outgoing.writeHead(302, { location: "/must-not-follow" }).end();
      return;
    }
    outgoing.end("ok");
  };
  let report;
  try {
    const source = http.createServer(handler),
      port = await listen(source);
    const secure = https.createServer(
      { key: await readFile(key), cert: await readFile(cert) },
      handler,
    );
    const securePort = await listen(secure);
    const denied = http.createServer(handler),
      deniedPort = await listen(denied);
    const refused = net.createServer(),
      refusedPort = await listen(refused);
    await new Promise((done) => refused.close(done));
    servers.splice(servers.indexOf(refused), 1);
    const proxy = http.createServer((req, res) => {
      proxyWire.push({
        type: "http",
        path: new URL(req.url, "http://local").pathname,
      });
      handler(req, res);
    });
    proxy.on("connect", (req, client, head) => {
      proxyWire.push({ type: "connect", authority: req.url });
      // An owned fixture maps this tunnel to our owned source, never to the requested host.
      const upstream = net.connect(port, "127.0.0.1", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
      client.on("error", () => upstream.destroy());
      upstream.on("error", () => client.destroy());
      client.on("close", () => upstream.destroy());
      upstream.on("close", () => client.destroy());
    });
    const proxyPort = await listen(proxy);
    const cfg = {
      origin: `http://127.0.0.1:${port}`,
      port,
      secureOrigin: `https://127.0.0.1:${securePort}`,
      cert,
      deniedPort,
      refusedPort,
    };
    const endpoints = [
      port,
      securePort,
      refusedPort,
      proxyPort,
      Number(db.port),
    ].map((entry) => ({ host: "127.0.0.1", port: entry }));
    const runs = [];
    for (const kind of [
      "standard",
      "standard-tsx",
      "proxy",
      "unhandled",
      "kill",
    ]) {
      const ledgerPath = join(directory, `${kind}.ndjson`);
      const environment = {
        PATH: process.env.PATH,
        NODE_EXTRA_CA_CERTS: cert,
        QA_EGRESS_OBSERVATION: "true",
        QA_EGRESS_LEDGER_PATH: ledgerPath,
        QA_EGRESS_MODE: "strict",
        QA_EGRESS_ALLOWED_ENDPOINTS: JSON.stringify(endpoints),
        QA_EGRESS_TEST_CONFIG: JSON.stringify(cfg),
        QA_EGRESS_TEST_DATABASE_URL: database,
        ...(kind === "proxy"
          ? {
              NODE_USE_ENV_PROXY: "1",
              HTTP_PROXY: `http://127.0.0.1:${proxyPort}`,
              HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`,
              NO_PROXY: "",
            }
          : {}),
      };
      const child = spawn(
        process.execPath,
        [
          "--import",
          preload,
          ...(kind === "standard-tsx" ? ["--import", "tsx"] : []),
          self,
          "--worker",
          kind,
        ],
        {
          env: environment,
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        },
      );
      activeChild = child;
      activeKind = kind;
      children.add(child);
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const watchdog = setTimeout(() => child.kill("SIGKILL"), 15000);
      const [exitCode, signal] = await once(child, "exit");
      clearTimeout(watchdog);
      children.delete(child);
      const raw = await readFile(ledgerPath, "utf8"),
        events = raw
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
      await writeFile(
        join(directory, `${kind}.process.json`),
        JSON.stringify({ exitCode, signal, stdout, stderr }, null, 2),
      );
      assert.ok(
        !raw.includes(canary),
        "Ledger must not contain query/header/body canary",
      );
      assert.ok(
        !raw.includes(decodeURIComponent(db.password)),
        "Ledger must not contain database credential",
      );
      assert.equal(new Set(events.map((event) => event.instance)).size, 1);
      for (let index = 0; index < events.length; index++) {
        assert.equal(events[index].seq, index + 1);
        if (index)
          assert.ok(
            BigInt(events[index].monoNs) >= BigInt(events[index - 1].monoNs),
          );
      }
      assert.equal(
        events.filter((event) => event.event === "observer-gap").length,
        0,
      );
      if (["standard", "standard-tsx", "proxy"].includes(kind))
        assert.equal(exitCode, 0, stderr);
      if (kind === "unhandled") {
        assert.equal(exitCode, 1);
        assert.ok(stderr.includes("ERR_QA_EGRESS_DENIED"));
      }
      if (kind === "kill") {
        assert.equal(signal, "SIGKILL");
        assert.ok(!events.some((event) => event.event === "process-exit"));
      }
      runs.push({
        kind,
        exitCode,
        signal,
        events,
        sha256: createHash("sha256").update(raw).digest("hex"),
      });
    }
    const standard = runs.find((run) => run.kind === "standard").events;
    const requests = standard.filter(
      (event) => event.event === "http-request-created",
    );
    for (const path of [
      "/fetch-one",
      "/fetch-two",
      "/fetch-three",
      "/native-one",
      "/native-two",
      "/native-tls",
      "/fetch-tls",
      "/preconnected",
      "/redirect-follow",
      "/follow-target",
      "/redirect-manual",
      "/denied",
      "/refused",
      "/hold",
    ])
      assert.equal(
        requests.filter((event) => event.path === path).length,
        1,
        `Actual HTTP request must be independently captured: ${path}`,
      );
    assert.ok(!requests.some((event) => event.path === "/must-not-follow"));
    assert.ok(
      !wire.some(
        (event) => event.path === "/denied" || event.path === "/refused",
      ),
    );
    for (const prefix of ["/fetch-", "/native-"]) {
      const pair = requests.filter((event) =>
        [prefix + "one", prefix + "two"].includes(event.path),
      );
      const sent = standard.filter(
        (event) =>
          ["http-request-start", "http-send-headers"].includes(event.event) &&
          pair.some((request) => request.requestId === event.requestId),
      );
      assert.equal(sent.length, 2);
      assert.equal(
        new Set(sent.map((event) => event.socketId)).size,
        1,
        `${prefix}: actual keep-alive reuse`,
      );
    }
    assert.ok(
      standard.some(
        (event) =>
          event.event === "socket-connected" &&
          event.remotePort === Number(db.port),
      ),
      "Actual PG peer must be observed",
    );
    assert.ok(
      standard.some(
        (event) =>
          event.event === "socket-policy-denied" &&
          event.target.port === deniedPort,
      ),
    );
    assert.ok(
      standard.some(
        (event) =>
          event.event === "socket-error" && event.code === "ECONNREFUSED",
      ),
    );
    const held = requests.find((event) => event.path === "/hold");
    assert.ok(
      standard.some(
        (event) =>
          event.event === "http-request-error" &&
          event.requestId === held.requestId,
      ),
    );
    const proxyEvents = runs.find((run) => run.kind === "proxy").events;
    assert.ok(
      proxyEvents.some(
        (event) =>
          event.event === "http-request-created" &&
          event.origin === "http://qa-owned-proxy.invalid",
      ),
    );
    assert.ok(
      proxyEvents.some(
        (event) =>
          event.event === "socket-connected" && event.remotePort === proxyPort,
      ),
    );
    assert.ok(
      !proxyEvents.some(
        (event) =>
          event.event === "socket-connect-call" &&
          event.target.host === "qa-owned-proxy.invalid",
      ),
    );
    for (const kind of ["standard", "standard-tsx"]) {
      const created = runs
        .find((run) => run.kind === kind)
        .events.filter((event) => event.event === "http-request-created");
      const received = wire.filter((event) => event.run === kind);
      assert.deepEqual(
        created
          .filter((event) => !["/denied", "/refused"].includes(event.path))
          .map((event) => event.path)
          .sort(),
        received.map((event) => event.path).sort(),
        "Every actually received request maps to one created request, including keep-alive and redirects",
      );
    }
    for (
      let count = 0;
      count < 100 &&
      wire.some((event) => event.path.startsWith("/hold") && !event.closed);
      count++
    )
      await delay(10);
    assert.ok(
      wire
        .filter((event) => event.path.startsWith("/hold"))
        .every((event) => event.closed && !event.responseFinished),
    );
    report = {
      result: "PASS",
      node: process.version,
      undici: process.versions.undici,
      sut: spawnSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).stdout.trim(),
      status: spawnSync("git", ["status", "--short"], { encoding: "utf8" })
        .stdout,
      preloadSha256: createHash("sha256")
        .update(await readFile(preload))
        .digest("hex"),
      driverSha256: createHash("sha256")
        .update(await readFile(self))
        .digest("hex"),
      loader:
        "entire standard transport sequence also ran with --import preload --import tsx",
      cases: [
        "fetch-http-and-native-http-keepalive",
        "fetch-https-and-native-https",
        "preconnected-http",
        "follow-vs-manual-redirect",
        "strict-denial-is-visible-attempt",
        "real-refused-connect",
        "real-fetch-abort",
        "real-pg",
        "env-proxy-original-vs-peer",
        "unhandled-socket-errors-preserved",
        "sigkill-incomplete-tail",
        "canary-not-retained",
      ],
      runs: runs.map(({ kind, exitCode, signal, events, sha256 }) => ({
        kind,
        exitCode,
        signal,
        records: events.length,
        sha256,
      })),
      wire,
      proxyWire,
      limits: [
        "named Node hooks in preloaded JS realm only",
        "HTTP creation is not successful dispatch",
        "native HTTP origin is declared authority",
        "socket allowlist does not police tunnel destination",
        "SIGKILL has no complete tail",
        "PG query contents intentionally absent",
      ],
    };
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        result: report.result,
        directory,
        cases: report.cases.length,
      }),
    );
  } catch (error) {
    await writeFile(
      join(directory, "failure.json"),
      JSON.stringify(
        { error: String(error), stack: error.stack, wire, proxyWire },
        null,
        2,
      ),
    );
    console.error(`Engineering evidence: ${directory}`);
    throw error;
  } finally {
    for (const child of children) child.kill("SIGKILL");
    for (const server of servers) {
      server.closeAllConnections?.();
      await new Promise((done) => server.close(done));
    }
    await unlink(key);
    await unlink(cert);
  }
}
if (process.argv[2] === "--worker") await worker(process.argv[3]);
else await main();
