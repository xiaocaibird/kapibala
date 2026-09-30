import { z } from 'zod';

export type ToolName = 'get_recent_messages' | 'send_message' | 'kick_user' | 'finish';
export interface TextBlock { type: 'text'; text: string; }
export interface ToolUse { type: 'tool_use'; id: string; name: string; input: unknown; }
export interface ToolResult { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean; }
export interface ConversationMessage { role: 'user' | 'assistant'; content: (TextBlock | ToolUse | ToolResult)[]; }
export interface ToolOutcome { value: Record<string, unknown>; errorCode?: string; }

const toolInputs = {
  get_recent_messages: z.object({ limit: z.number().int().positive() }).strict(),
  send_message: z.object({ text: z.string().min(1).max(20000), idempotency_key: z.string().min(1).max(512) }).strict(),
  kick_user: z.object({ platform_user_id: z.string().min(1).max(512), reason: z.string().min(1).max(2000) }).strict(),
  finish: z.object({ summary: z.string().max(20000) }).strict(),
};
export const tools = Object.entries(toolInputs).map(([name, schema]) => ({
  name,
  description: ({ get_recent_messages: 'Read recent group messages.', send_message: 'Send an audited group message.', kick_user: 'Remove a group member if policy permits.', finish: 'Finish this run without sending a group message.' } as Record<string, string>)[name]!,
  input_schema: z.toJSONSchema(schema),
}));
const responseSchema = z.discriminatedUnion('stop_reason', [
  z.object({ stop_reason: z.literal('tool_use'), content: z.tuple([z.object({ type: z.literal('tool_use'), id: z.string().min(1).max(512), name: z.string().min(1).max(256), input: z.unknown() })]) }),
  z.object({ stop_reason: z.literal('end_turn'), content: z.tuple([z.object({ type: z.literal('text'), text: z.string() })]) }),
]);
export function parseTurn(raw: string): z.infer<typeof responseSchema> | null {
  try { const parsed = responseSchema.safeParse(JSON.parse(raw) as unknown); return parsed.success ? parsed.data : null; } catch { return null; }
}
export function validateTool(tool: ToolUse): 'UNKNOWN_TOOL' | 'INVALID_INPUT' | null {
  if (!Object.hasOwn(toolInputs, tool.name)) return 'UNKNOWN_TOOL';
  return toolInputs[tool.name as ToolName].safeParse(tool.input).success ? null : 'INVALID_INPUT';
}
export const auditSchema = z.object({ verdict: z.enum(['pass', 'fail']), reason: z.string() });
export function truncateUtf8(value: string, bytes: number): string {
  if (Buffer.byteLength(value) <= bytes) return value;
  let out = ''; let size = 0;
  for (const character of value) { const n = Buffer.byteLength(character); if (size + n > bytes) break; out += character; size += n; }
  return out;
}
export function summary(value: unknown): string { return [...JSON.stringify(value)].slice(0, 200).join(''); }
export function toolError(code: string, message: string, hint?: string): ToolOutcome {
  return { errorCode: code, value: { code, message, ...(hint ? { hint } : {}) } };
}
export function resultContent(value: Record<string, unknown>): string {
  let content = JSON.stringify(value);
  if (Buffer.byteLength(content) <= 8192) return content;
  // Keep the result valid JSON even when arbitrary tool data exceeds the byte budget.
  const compact = { truncated: true, summary: truncateUtf8(content, 7000) };
  while (Buffer.byteLength(JSON.stringify(compact)) > 8192) compact.summary = compact.summary.slice(0, -100);
  return JSON.stringify(compact);
}
