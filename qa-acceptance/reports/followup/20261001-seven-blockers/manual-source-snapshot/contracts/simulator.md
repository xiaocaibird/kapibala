# Independent Gateway and Agent simulator contract

These simulators implement the external interfaces in `docs/original-interview-question.md` without importing application code. Their own tests contact only newly created loopback simulators. They do not establish that any acceptance requirement of the application has passed.

Keep simulator processes alive while restarting the application. Their in-memory external facts and complete event history then survive application crashes. Restarting a simulator itself creates a fresh external world; this is not a persistence test of the simulator.

## Starting and observing

```ts
import { GatewaySimulator } from '../harness/gateway.js';
import { AgentSimulator } from '../harness/agent.js';

const gateway = await new GatewaySimulator({ accountIds: ['a1', 'a2'] }).start();
const agent = await new AgentSimulator().start();
// Wire only gateway.url / agent.url into GATEWAY_URL / AGENT_URL.
// controlUrl is a separate HTTP listener for the QA controller.
try {
  // Run an explicitly authorized scenario against its isolated application.
} finally {
  await Promise.all([gateway.close(), agent.close()]);
}
```

`start({ host?, port? })` defaults to `127.0.0.1` and an OS-selected business port; the control port is selected independently. Container targets must be given an explicitly configured, reachable hostname. Do not expose control ports to users or put them behind application routing.

Both simulators provide `snapshot()` returning a deep copy, `barriers`, `waitForRequest(predicate, timeoutMs = 5000)`, and `close()`. The request predicate searches retained history; include the relevant identifier or capture an initial request count when waiting for a later occurrence. Gateway snapshot fields are:

| Field | External evidence |
| --- | --- |
| `requests` | `{ id, at, method, path, body, responseStatus?, completedAt? }`; `path` is the pathname without query parameters |
| `messages` | Actual landed messages: `{ groupId, accountId, clientMsgId, msgId, senderPlatformUserId, text, sentAt, mediaUrl? }` |
| `groups` | Current `{ groupId, creatorAccountId, writable, members: [{ platformUserId, role }] }` |
| `accounts` | `{ id, platformUserId, connected, status, rateLimitedUntil }`; external status is `available / suspended / session_expired`, not the application's state machine |
| `events` | All retained `{ eventId, type, data }`; `data` also includes `eventId` and `type` |
| `effects` | Timestamped actual connect/disconnect/create/invite/join/promote/send/kick/leave/terminal-leave effects |
| `barriers` | Reached synchronization points and their request context |
| `backgroundErrors` | Simulator errors; a nonempty array invalidates that test environment |
| `connectedStreams` | Current SSE connection count |

Outbound `clientMsgId` is deliberately **not deduplicated**. Two valid send requests may produce two actual messages. A by-client-id query returns the first landed matching message. Imported external messages have `accountId = null` unless their sender matches a seeded service identity, and `clientMsgId = null`.

Agent `snapshot()` contains `turns`, `audits`, `sessions`, `barriers`, and `backgroundErrors`. Each turn/audit is `{ id, at, path, body, responseStatus?, rawResponse?, completedAt? }`. Full request bodies retain runId, tools, and message history; `sessions` groups request IDs by runId. The simulator does not deduplicate turns or silently compensate for repeated application requests.

## Gateway fault plans

`enqueue(path, ...plans)` adds one-shot plans for an exact business pathname. Each request consumes the first queued plan with no `method` restriction or a matching method. Global unavailability does not consume queued plans.

```ts
gateway.enqueue(`/groups/${gatewayGroupId}/send`, {
  status: 504,
  code: 'NETWORK_TIMEOUT',
  effect: 'apply',
  effectDelayMs: 1500,
});
gateway.enqueue(`/groups/${gatewayGroupId}/messages/by-client-id/${clientMsgId}`, {
  method: 'GET', status: 503, code: 'SERVICE_UNAVAILABLE',
});
```

| Plan field | Meaning |
| --- | --- |
| `method` | Optional GET/POST matching restriction |
| `status`, `code`, `body`, `rawBody` | Response overrides; `rawBody` preserves invalid JSON verbatim; `code` merges into a supplied object body |
| `effect` | `normal`/omitted applies a valid operation only on a successful response; `none` prevents its effect; `apply` permits an actual effect despite an error response, as needed for 504 |
| `effectDelayMs` | Delay before the actual side effect; for send/join and timeout kick it is independent of HTTP response timing |
| `responseDelayMs` | Delay of the response; send can land and emit events before its 202 returns |
| `eventDelayMs` | Delay after the actual effect before its event; normal kick/leave events follow their HTTP response |
| `omitEvent` | For join, accepted but never joined; for other operations, deliberately suppresses the event (use only where the scenario permits missing or separately supplied events) |
| `failureCode` | Accepted send later emits `message_failed`: `GROUP_WRITE_FORBIDDEN` or `ACCOUNT_SUSPENDED`, with no landed message |
| `neverRespond` | Leave the HTTP request open until the client disconnects or the simulator is closed |
| `barrier` | `{ phase: 'request' / 'after-effect' / 'before-response', name }` |

Plans are fault-injection primitives, not permission to change the source contract. For example, a 504 late send must settle within the stated two-second bound, normal SSE reordering must stay within one second, and a successful join that never sends an event must not be invented. To simulate a permanently unfulfilled join, use `effect: 'none'`, `omitEvent: true`, or `joinNeverCompletes: true`; none adds membership.

`after-effect` blocks after the external state changed and before its event/HTTP response. It intentionally holds the response even for otherwise asynchronous operations, enabling the controller to kill the application at a known irreversible boundary. `before-response` on create has already created the group. `request` precedes any operation effect. Names are one-shot: use a new name for a new barrier.

```ts
gateway.enqueue(sendPath, { barrier: { phase: 'after-effect', name: 'send-landed' } });
await gateway.barriers.waitFor('send-landed');
// The authorized fault controller can stop the application here.
// Gateway snapshot already contains the actual message.
gateway.barriers.release('send-landed');
```

Never wait for the blocked application's HTTP request to complete before reaching/releasing a barrier. `close()` releases barriers, aborts timers, and closes active streams/connections.

## Gateway behavior and configuration

`seedAccounts(ids)` creates offline accounts; repeated seeds do not reset facts. Connect always returns `platform-${accountId}`. Offline send/join/promote/kick/leave return `409 ACCOUNT_OFFLINE`. Terminal errors persist, remove memberships, and prevent future connect; `emitTerminalStatusEvents` controls the optional account-status event for synchronous terminal send errors. Explicit `emitStatus` always publishes it.

Creating a group inserts its creator immediately without `member_joined`. Join receipt is distinct from membership. Promote requires the creator and a present target; it emits no event. `ALREADY_MEMBER` emits no new join event. Kick requires creator/admin and fails with `OWNER_LEFT` once the creator has left. Failed leave preserves membership. An injected RATE_LIMITED response starts the account cooldown; every forbidden early send resets its full duration, while disconnect/leave remain allowed.

`configure(partial)` supports:

| Option | Default |
| --- | --- |
| `unavailable`, `sseUnavailable` | `false`; availability affects new requests; call `disconnectStreams()` separately to break established SSE |
| `inviteReadyAfterMs` | `0` |
| `inviteExpiresAfterMs` | `null` (no automatic expiry); `expireInvite(link)` expires an individual invitation |
| `joinDelayMs`, `joinNeverCompletes` | `100`, `false` |
| `sendDelayMs`, `sendResponseDelayMs` | `50`, `0` |
| `sendEventOrder` | `sent-first`; may be `message-first` |
| `eventDuplicates` | `1` copies per delivery; `2` exercises at-least-once duplicate frames |
| `kickResponseDelayMs` | `1000` |
| `emitTerminalStatusEvents` | `false` for injected synchronous terminal errors |

Event controls:

- `emit(type, data, { repeat?, delayMs?, storeOnly? })` stores a new globally increasing event and returns it. Low-level `emit` changes only event history, not underlying facts.
- `deliver(eventId, { repeat?, delayMs? })` redelivers the same eventId. Combine stored-only events with controlled delivery order for reordering tests.
- `emitMessage({ groupId, msgId?, senderPlatformUserId, text, sentAt?, mediaUrl? }, options)` records a real message once per `(groupId,msgId)` and emits a fresh event. Reusing its msgId with an old sentAt models historical replay using a new eventId.
- `emitStatus(accountId, status)` applies terminal account and membership effects, then publishes the specified status and member-left events.
- `setMembership(groupId, platformUserId, present, options)` changes current membership before publishing the corresponding event. This supports external users and delay between actual membership change and event delivery.
- `disconnectStreams()` closes all active SSE clients. `GET /events?since=N` replays **all** retained events with IDs greater than N; without since it starts at the current point. SSE history is available before any account connects.
- `addMedia(id, bytes, { expiresAfterMs? })` returns a `/media/:id` URL with exact bytes; expiry produces 404.

To verify “no duplicate external action”, count `messages`/`effects`, not only application records. Event duplicates do not represent duplicate landed messages. Record actual delays alongside plans; if the fixture violates a contractual timing bound, classify the run as an environment/fixture problem rather than passing or failing the application against a different contract.

## Agent plans

`enqueueTurns(...plans)` and `enqueueAudits(...plans)` support `status`, `body`, `rawBody`, `responseDelayMs`, `neverRespond`, `barrier`, and optional `runId` filtering. A response plan is consumed once. Turn responses with the same runId are still separate calls. Audit has no runId in the external protocol, so use unfiltered audit plans.

```ts
agent.enqueueTurns(
  { rawBody: '```json\n{}\n```' },
  { body: { stop_reason: 'tool_use', content: [
    { type: 'tool_use', id: 'tu-1', name: 'send_message', input: { text: 'hello', idempotency_key: 'key-1' } },
  ] } },
  { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] } },
);
agent.enqueueAudits({ status: 500 }, { rawBody: 'not-json' }, { body: { verdict: 'pass', reason: 'ok' } });
```

Before consuming a turn plan, the simulator checks four distinct required tool names and their JSON Schemas, including required coverage of all declared parameters. Tool schemas with a declared draft-07, 2019-09, or 2020-12 dialect are checked against that dialect's bundled metaschema; schemas without `$schema` retain the existing draft-07 validation. The simulator never removes the dialect declaration, fetches an arbitrary metaschema URL, or treats a malformed standard keyword as valid. Unrecognized dialects remain unsupported and require QA adapter review; rejection alone is not evidence that such a dialect is invalid under the product protocol. Invalid tool declarations receive `400 TOOLS_INVALID`; a missing runId receives 400. Scripts can deliberately return invalid block counts, mismatched stop reasons, unknown tools, duplicate tool-use IDs, or invalid arguments; validating them is the application's responsibility.

If no matching plan is queued, `/agent/turn` returns one `end_turn` text block and `/agent/audit` returns pass. Tests requiring exact request counts must assert them explicitly so fallback completion cannot conceal an extra call. Agent barriers have no external send/kick effect: `after-effect` there means the request was recorded, and is equivalent to `request`.

## Control HTTP endpoints

The separate, local `controlUrl` supports `GET /snapshot` and POST commands below. This is a QA-only control interface, not part of either service's business contract.

| Simulator | Path and body |
| --- | --- |
| Both | `/configure` with the relevant configuration object; `/barriers/release { name }` |
| Gateway | `/seed-accounts { ids }`; `/plans { path, plans }`; `/events { type, data, options? }`; `/status { accountId, status }`; `/membership { groupId, platformUserId, present, options? }`; `/disconnect-streams {}` |
| Agent | `/turns { plans }`; `/audits { plans }` |

Self verification: `npx tsx --test tests/self/simulators.test.ts` from the dedicated QA directory. This command never imports application configuration and does not start, query, or restart the SUT or a database.
