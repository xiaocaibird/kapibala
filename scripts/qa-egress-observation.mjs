// Explicit engineering preload; production entries never import this file.
// A ledger of the named Node hooks, not a kernel-wide/network-isolation claim.
import { createHash, randomUUID } from "node:crypto";
import diagnostics from "node:diagnostics_channel";
import { errorMonitor } from "node:events";
import {
  closeSync,
  constants,
  fsyncSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { isAbsolute } from "node:path";
import net from "node:net";

if (process.env.QA_EGRESS_OBSERVATION !== "true")
  throw new Error("QA_EGRESS_OPT_IN_REQUIRED");
if (process.version !== "v24.21.0" || process.versions.undici !== "7.29.1")
  throw new Error("QA_EGRESS_RUNTIME_NOT_VERIFIED");
const file = process.env.QA_EGRESS_LEDGER_PATH;
if (!file || !isAbsolute(file))
  throw new Error("QA_EGRESS_ABSOLUTE_LEDGER_REQUIRED");
const mode = process.env.QA_EGRESS_MODE ?? "strict";
if (!["strict", "observe"].includes(mode))
  throw new Error("QA_EGRESS_MODE_INVALID");
let endpoints;
try {
  endpoints = JSON.parse(process.env.QA_EGRESS_ALLOWED_ENDPOINTS ?? "[]");
} catch {
  throw new Error("QA_EGRESS_ENDPOINTS_INVALID");
}
if (
  !Array.isArray(endpoints) ||
  endpoints.some(
    (item) =>
      !item ||
      !["127.0.0.1", "::1"].includes(item.host) ||
      !Number.isInteger(item.port) ||
      item.port < 1 ||
      item.port > 65535 ||
      Object.keys(item).some((key) => !["host", "port"].includes(key)),
  )
)
  throw new Error("QA_EGRESS_ENDPOINTS_INVALID");
const allowed = new Set(endpoints.map(({ host, port }) => `${host}:${port}`));
const fd = openSync(
  file,
  constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_EXCL |
    constants.O_NOFOLLOW,
  0o600,
);
const instance = randomUUID();
const sockets = new WeakMap();
const requests = new WeakMap();
const activeSockets = new Set();
const activeRequests = new Set();
let sequence = 0,
  nextSocket = 0,
  nextRequest = 0,
  nextConnect = 0,
  gaps = 0;
let closed = false;
const code = (error) =>
  typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)
    ? error.code
    : null;
function record(event, facts = {}) {
  if (closed) return;
  const bytes = Buffer.from(
    JSON.stringify({
      protocol: "node-egress-hooks-v1",
      instance,
      pid: process.pid,
      seq: ++sequence,
      monoNs: process.hrtime.bigint().toString(),
      at: new Date().toISOString(),
      event,
      ...facts,
    }) + "\n",
  );
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(fd, bytes, offset, bytes.length - offset);
      if (!count) throw new Error("zero write");
      offset += count;
    }
  } catch {
    // Losing the witness invalidates this engineering run; never continue with a false zero.
    process.stderr.write("QA_EGRESS_LEDGER_WRITE_FAILED\n");
    closed = true;
    process.exit(78);
  }
}
function socketIdentity(socket) {
  let item = sockets.get(socket);
  if (!item) {
    item = { socketId: `s${++nextSocket}`, connectObserved: false };
    sockets.set(socket, item);
  }
  return item;
}
function peer(socket) {
  return {
    remoteAddress: socket.remoteAddress ?? null,
    remotePort: socket.remotePort ?? null,
    localAddress: socket.localAddress ?? null,
    localPort: socket.localPort ?? null,
  };
}
function hostValue(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_.:\[\]-]{1,253}$/.test(value)
    ? value
    : null;
}
function connectTarget(args) {
  // Node's own net.createConnection forwards its already-normalized argument array.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = first && typeof first === "object" ? first : null;
  if (options?.path || (typeof first === "string" && !/^\d+$/.test(first)))
    return { kind: "pipe", host: null, port: null };
  const port = Number(options ? options.port : first);
  const rawHost = options
    ? (options.host ?? "localhost")
    : typeof args[1] === "string"
      ? args[1]
      : "localhost";
  return {
    kind: "tcp",
    host: hostValue(rawHost),
    port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : null,
  };
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function observedConnect(...args) {
  const item = socketIdentity(this),
    connectId = `c${++nextConnect}`,
    target = connectTarget(args);
  item.connectObserved = true;
  const owned =
    target.kind === "tcp" && allowed.has(`${target.host}:${target.port}`);
  const blocked = mode === "strict" && !owned;
  record("socket-connect-call", { ...item, connectId, target, owned, blocked });
  activeSockets.add(item.socketId);
  const observe = (event, facts) =>
    record(event, { ...item, connectId, ...facts });
  const connected = () => observe("socket-connected", peer(this));
  const failed = (error) => observe("socket-error", { code: code(error) });
  const attempt = (ip, port, family) =>
    observe("socket-address-attempt", { ip: hostValue(ip), port, family });
  const attemptFailed = (ip, port, family, error) =>
    observe("socket-address-failed", {
      ip: hostValue(ip),
      port,
      family,
      code: code(error),
    });
  const attemptTimeout = (ip, port, family) =>
    observe("socket-address-timeout", { ip: hostValue(ip), port, family });
  const cleanup = () => {
    this.off("connect", connected);
    this.off(errorMonitor, failed);
    this.off("connectionAttempt", attempt);
    this.off("connectionAttemptFailed", attemptFailed);
    this.off("connectionAttemptTimeout", attemptTimeout);
    this.off("close", finished);
  };
  const finished = (hadError) => {
    activeSockets.delete(item.socketId);
    observe("socket-close", { hadError });
    cleanup();
  };
  this.once("connect", connected);
  this.on(errorMonitor, failed);
  this.once("close", finished);
  this.on("connectionAttempt", attempt);
  this.on("connectionAttemptFailed", attemptFailed);
  this.on("connectionAttemptTimeout", attemptTimeout);
  if (blocked) {
    record("socket-policy-denied", { ...item, connectId, target });
    const error = new Error("QA_EGRESS_DESTINATION_DENIED");
    error.code = "ERR_QA_EGRESS_DENIED";
    this.destroy(error);
    return this;
  }
  try {
    return Reflect.apply(originalConnect, this, args);
  } catch (error) {
    observe("socket-connect-threw", { code: code(error) });
    activeSockets.delete(item.socketId);
    cleanup();
    throw error;
  }
};
const installedConnect = net.Socket.prototype.connect;
function httpTarget(origin, path, method, basis) {
  // Never persist userinfo, query, fragment, headers, bodies or exception messages.
  const result = {
    method:
      typeof method === "string" && /^[A-Z-]{1,32}$/.test(method)
        ? method
        : null,
    originBasis: basis,
  };
  try {
    const url = new URL(String(path), String(origin));
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return {
      ...result,
      origin: url.origin,
      path: url.pathname,
      url: `${url.origin}${url.pathname}`,
      queryOmitted: Boolean(url.search),
      userinfoOmitted: Boolean(url.username || url.password),
    };
  } catch {
    return {
      ...result,
      origin: null,
      path: null,
      url: null,
      targetUnavailable: true,
    };
  }
}
function created(request, transport) {
  if (requests.has(request)) return requests.get(request);
  const requestId = `h${++nextRequest}`;
  requests.set(request, requestId);
  activeRequests.add(requestId);
  const target =
    transport === "undici"
      ? httpTarget(
          request.origin,
          request.path,
          request.method,
          "undici-request-origin",
        )
      : httpTarget(
          `${request.protocol}//${request.getHeader("host") ?? request.host}`,
          request.path,
          request.method,
          "native-http-authority",
        );
  record("http-request-created", { requestId, transport, ...target });
  if (transport === "native-http")
    request.once("close", () => {
      activeRequests.delete(requestId);
      record("http-request-close", { requestId });
    });
  return requestId;
}
function requestIdentity(request) {
  const id = requests.get(request);
  if (id) return id;
  gaps++;
  record("observer-gap", { reason: "request-event-without-create" });
  return null;
}
function subscribe(name, handle) {
  diagnostics.subscribe(name, (message) => {
    try {
      handle(message);
    } catch {
      gaps++;
      record("observer-gap", {
        reason: "diagnostic-shape-unrecognized",
        channel: name,
      });
    }
  });
}
subscribe("undici:request:create", ({ request }) => created(request, "undici"));
subscribe("undici:client:sendHeaders", ({ request, socket }) =>
  record("http-send-headers", {
    requestId: requestIdentity(request),
    ...socketIdentity(socket),
    ...peer(socket),
    transport: "undici",
  }),
);
subscribe("undici:request:headers", ({ request, response }) =>
  record("http-response-headers", {
    requestId: requestIdentity(request),
    status: response.statusCode,
  }),
);
for (const stage of ["trailers", "error"])
  subscribe(`undici:request:${stage}`, ({ request, error }) => {
    const requestId = requestIdentity(request);
    activeRequests.delete(requestId);
    record(
      stage === "error" ? "http-request-error" : "http-response-complete",
      { requestId, ...(error ? { code: code(error) } : {}) },
    );
  });
subscribe("http.client.request.created", ({ request }) =>
  created(request, "native-http"),
);
subscribe("http.client.request.start", ({ request }) =>
  record("http-request-start", {
    requestId: requestIdentity(request),
    ...socketIdentity(request.socket),
    ...peer(request.socket),
    transport: "native-http",
  }),
);
subscribe("http.client.request.error", ({ request, error }) =>
  record("http-request-error", {
    requestId: requestIdentity(request),
    code: code(error),
  }),
);
subscribe("http.client.response.finish", ({ request, response }) =>
  record("http-response-complete", {
    requestId: requestIdentity(request),
    status: response.statusCode,
  }),
);
record("observer-ready", {
  mode,
  endpoints,
  node: process.version,
  undici: process.versions.undici,
  preloadSha256: createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex"),
  scope: "this-JS-realm-node-socket-connect-and-named-http-diagnostics",
  excluded: [
    "prior-import-effects",
    "inherited-fd",
    "native-addon-direct-io",
    "unobserved-child-or-worker",
    "subsequent-hook-bypass",
    "http2-client",
    "dns-udp",
    "proxy-destination-connect",
  ],
  nativeHttpOrigin:
    "declared authority; compare physical peer separately; Host override and proxies can differ",
});
process.once("exit", (exitCode) => {
  record("process-exit", {
    exitCode,
    gaps,
    activeSocketIds: [...activeSockets],
    activeRequestIds: [...activeRequests],
    hookStillInstalled: net.Socket.prototype.connect === installedConnect,
  });
  if (!closed) {
    fsyncSync(fd);
    closeSync(fd);
    closed = true;
  }
});
