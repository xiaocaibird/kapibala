import { Ajv } from 'ajv';
import assert from 'node:assert/strict';

/** 独立依据原始§2.3维护；允许额外字段，不导入产品类型或验证器。 */
const text = { type: 'string' };
const nullableText = { type: ['string', 'null'] };
const time = { anyOf: [{ type: 'null' }, { type: 'string', format: 'utc-time' }] };
const enumeration = (values: string[]) => ({ type: 'string', enum: values });
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: true,
});
const array = (items: unknown) => ({ type: 'array', items });
const account = object({
  id: text,
  status: enumeration([
    'idle',
    'online',
    'rate_limited',
    'disconnected',
    'suspended',
    'session_expired',
  ]),
  platformUserId: nullableText,
  rateLimitedUntil: time,
});
const group = object({
  id: text,
  gatewayGroupId: text,
  status: enumeration(['active', 'unreachable', 'left']),
  creatorAccountId: text,
  agentEnabled: { type: 'boolean' },
  autoKickEnabled: { type: 'boolean' },
  members: array(
    object({
      accountId: text,
      platformUserId: text,
      role: enumeration(['creator', 'admin', 'member']),
    }),
  ),
  activeSequenceRunId: nullableText,
  activeAgentRunId: nullableText,
});
const message = object({
  msgId: nullableText,
  clientMsgId: nullableText,
  senderPlatformUserId: text,
  isOwn: { type: 'boolean' },
  text,
  sentAt: time,
  deliveryStatus: {
    anyOf: [
      { type: 'null' },
      enumeration(['queued', 'accepted', 'sent', 'failed', 'unknown', 'cancelled']),
    ],
  },
  failCode: nullableText,
});
const run = object({
  id: text,
  groupId: text,
  status: enumeration(['running', 'finished', 'failed', 'blocked', 'cancelled']),
  endReason: nullableText,
  summary: nullableText,
});
const step = object({
  kind: enumeration(['tool_use', 'final', 'protocol_error']),
  toolUseId: nullableText,
  name: nullableText,
  input: {},
  resultSummary: text,
  isError: { type: 'boolean' },
  errorCode: nullableText,
  auditVerdict: nullableText,
  rawResponse: nullableText,
});
export const schemas = {
  health: object({ ok: { type: 'boolean' }, schemaVersion: {} }),
  login: object({ accessToken: text }),
  accounts: array(account),
  group,
  groups: array(group),
  job: object({
    status: enumeration(['running', 'finished', 'failed']),
    errors: array(
      object({
        step: { type: 'string', pattern: '^(create|invite|promote|join:.+|leave:.+)$' },
        code: text,
      }),
    ),
  }),
  messages: object({ items: array(message), nextCursor: nullableText }),
  agentRun: {
    ...run,
    properties: { ...run.properties, steps: array(step) },
    required: [...run.required, 'steps'],
  },
  agentRuns: array(run),
  sequenceRun: object({
    status: enumeration(['running', 'finished', 'failed', 'stopped']),
    currentStepIndex: { type: 'integer' },
    steps: array(
      object({
        index: { type: 'integer' },
        status: enumeration(['pending', 'accepted', 'sent', 'skipped', 'failed']),
        scheduledAt: time,
        sentAt: time,
        clientMsgId: nullableText,
        resolvedVars: { type: 'object' },
        varSources: {
          type: 'object',
          additionalProperties: { type: 'string', pattern: '^(default|step:[0-9]+)$' },
        },
      }),
    ),
  }),
  error: object({ error: object({ code: text, message: text, requestId: text }) }),
};
const ajv = new Ajv({ strict: false, allErrors: true });
ajv.addFormat('utc-time', (value: string) => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value);
  if (!parts) return false;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  return (
    parsed.getUTCFullYear() === Number(parts[1]) &&
    parsed.getUTCMonth() + 1 === Number(parts[2]) &&
    parsed.getUTCDate() === Number(parts[3]) &&
    parsed.getUTCHours() === Number(parts[4]) &&
    parsed.getUTCMinutes() === Number(parts[5]) &&
    parsed.getUTCSeconds() === Number(parts[6])
  );
});
const validators = Object.fromEntries(
  Object.entries(schemas).map(([key, schema]) => [key, ajv.compile(schema)]),
);
export function assertContract(name: keyof typeof schemas, value: unknown): void {
  const validate = validators[name]!;
  assert.ok(validate(value), `${name} 不符合原始公开契约: ${ajv.errorsText(validate.errors)}`);
}
