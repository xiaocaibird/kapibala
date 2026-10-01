import { realpath } from 'node:fs/promises';
import type { PlatformClient, Group } from '../../harness/platform-client.js';
import type { AgentSimulator } from '../../harness/agent.js';
import type { GatewaySimulator } from '../../harness/gateway.js';
import { C1_CAPABILITIES as M, PreparationBlocked, type Evidence, type Json, type MediaDriver, type MediaMessage, type MessageRef, type Ownership } from '../contracts/media-provider.js';
import type { MediaSourceProxy } from './media-source.js';

const proof = (reference: string, raw: unknown): Evidence => ({ reference, raw: JSON.parse(JSON.stringify(raw)) as Json });
export interface MediaHost {
  ownership: Ownership;
  api: PlatformClient;
  gateway: GatewaySimulator;
  agent?: AgentSimulator;
  source: MediaSourceProxy;
  mediaDirectory: string;
  retentionDays: number;
}
export interface MediaLifecycle {
  contractReference: string;
  capabilities?: string[];
  retentionContract?: MediaDriver['retentionContract'];
  open(options?: Record<string, Json>): Promise<MediaHost>;
  cleanup(): ReturnType<MediaDriver['cleanup']>;
  evidence(name: string, value: unknown): Promise<void>;
  /** Optional genuine operations only. Their required capability must be
   * explicitly listed; absence is BLOCKED, never a fabricated observation. */
  operations?: Partial<MediaDriver>;
}
export function createMediaHttpDriver(binding: MediaLifecycle): MediaDriver {
  let host: MediaHost | undefined;
  let openOptions: Record<string, Json> = {};
  const groups = new Map<string, Group>();
  const active = () => { if (!host) throw new PreparationBlocked('Media host not opened'); return host; };
  const timeline = async (groupId: string, cursor?: string) => {
    const result = await active().api.messages(groupId, cursor, 50);
    const raw = result as unknown as { items: Record<string, unknown>[]; nextCursor: string | null; snapshotCursor?: string };
    if (!Array.isArray(raw.items)) throw new PreparationBlocked('Unexpected public timeline envelope');
    return { messages: raw.items.map((item) => ({ ...item, groupId, msgId: String(item.msgId), text: String(item.text), raw: item as Json }) as MediaMessage),
      nextCursor: raw.nextCursor, snapshotCursor: raw.snapshotCursor ?? raw.nextCursor ?? '', evidence: proof(`media:timeline:${groupId}`, result) };
  };
  const read = async (ref: MessageRef, budgetMs = 10_000): Promise<MediaMessage> => {
    const deadline = performance.now() + budgetMs;
    do {
      let cursor: string | undefined;
      for (let pages = 0; pages < 100; pages++) {
        const page = await timeline(ref.groupId, cursor); const found = page.messages.find((m) => m.msgId === ref.msgId);
        if (found) return found; if (!page.nextCursor) break; cursor = page.nextCursor;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    } while (performance.now() < deadline);
    throw new PreparationBlocked(`Message not observable within diagnostic budget: ${ref.msgId}`);
  };
  const core: Partial<MediaDriver> = {
    contractReference: binding.contractReference,
    capabilities: [M.basic, M.sourceFaults, ...(binding.capabilities ?? [])],
    retentionContract: binding.retentionContract ?? null,
    finalSchemaContract: null,
    async open(options) { groups.clear(); openOptions = options ?? {}; host = await binding.open(options); return host.ownership; },
    async cleanup() { try { return await binding.cleanup(); } finally { host = undefined; } },
    evidence: binding.evidence,
    async mediaDirectory() { const h = active(); const path = await realpath(h.mediaDirectory); return { path, effectiveRetentionDays: h.retentionDays, evidence: proof('media:owned-directory', { path, configured: h.mediaDirectory, retentionDays: h.retentionDays }) }; },
    async source(input) { return active().source.source(input); },
    async setSourceFault(url, fault) { active().source.setFault(url, fault); },
    async sourceRequests() { return active().source.requests(); },
    async createGroup() {
      const h = active(), created = await h.api.createGroup(); groups.set(created.group.id, created.group);
      if (openOptions.referenceMode === 'trigger' || openOptions.referenceMode === 'pending-download') {
        if (!h.agent) throw new PreparationBlocked('Reference trigger requires actual owned Agent source');
        h.agent.enqueueTurns({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'reference finished' }] }, barrier: { phase: 'request', name: `media-reference-${created.group.id}` } });
        await h.api.require(h.api.patch(`/api/groups/${created.group.id}`, { agentEnabled: true }));
      }
      return created.group.id;
    },
    async emit(input) {
      const h = active(), group = groups.get(input.groupId); if (!group) throw new PreparationBlocked('Media emit group not created by this driver');
      const account = h.gateway.snapshot().accounts.find((a) => a.id === group.creatorAccountId);
      const event = h.gateway.emitMessage({ groupId: group.gatewayGroupId, msgId: input.msgId, text: input.text,
        senderPlatformUserId: input.isOwn ? (account?.platformUserId ?? '') : 'qa-external-media', ...(input.mediaUrl ? { mediaUrl: input.mediaUrl } : {}) });
      return proof(`media:gateway-event:${event.eventId}`, event);
    },
    read, timeline,
    async awaitMessage(ref, state, diagnosticBudgetMs) {
      const deadline = performance.now() + diagnosticBudgetMs; let last: MediaMessage | undefined;
      do {
        last = await read(ref, Math.max(1, deadline - performance.now()));
        if (state === 'path-published' ? !!last.localFilePath : last.localFilePath === null) return last;
        await new Promise((resolve) => setTimeout(resolve, 50));
      } while (performance.now() < deadline);
      await binding.evidence('media-await-exhausted', { ref, state, diagnosticBudgetMs, last });
      throw new PreparationBlocked(`Media state ${state} not established within finite diagnostic budget`);
    },
  };
  const implementation = { ...binding.operations, ...core };
  return new Proxy(implementation, { get(target, property, receiver) {
    if (property === 'then') return undefined;
    if (property in target) return Reflect.get(target, property, receiver);
    return async () => { throw new PreparationBlocked(`Media operation ${String(property)} lacks reviewed real fixture`); };
  } }) as MediaDriver;
}
