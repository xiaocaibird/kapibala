import { BlockedError } from '../../harness/security.js';
import type { ContinuityPoint } from './page-continuity.js';

type ScopeFrame = { at: number; socketId: number; requestId?: string; startSeq?: number };
export interface DirectoryRefreshBoundary {
  before: ContinuityPoint;
  after: ContinuityPoint;
  sameDocument: boolean;
  baselineSocketId: number;
  baselineStartSeq: number;
  refreshStartedAt: number;
  reads: { at: number; responseAt?: number; status?: number }[];
  markers: ScopeFrame[];
  replies: ScopeFrame[];
  previousMarkerIds: string[];
  receivedSequences: number[];
  frames: { type: string; seq?: number }[];
  requireReady: boolean;
}

/** UI-032 only: validate the actual full-refresh boundary before capturing a
 * later confirmation baseline. Never send a marker or erase prior evidence.
 * A newer watermark is valid only if that exact event was actually received.
 */
export function assertDirectoryRefreshBoundary(input: DirectoryRefreshBoundary): void {
  const blocked = (reason: string): never => {
    throw new BlockedError(reason);
  };
  const { before, after, markers, replies } = input;
  if (
    !before.scopeEstablished ||
    !after.scopeEstablished ||
    !input.sameDocument ||
    (['url', 'navigations', 'socketChanges', 'staleScopeReady'] as const).some(
      (key) => before[key] !== after[key],
    )
  )
    blocked('整体刷新跨越document/URL/navigation/socket或旧连接scope事件，不能建立同页确认前提');
  if (
    input.frames.some(
      (frame) => frame.type === 'auth' || (frame.seq !== undefined && frame.type !== 'message'),
    )
  )
    blocked('整体刷新期间混入认证或后到目录业务事件，不能把该批次都归于本次成功呈现');
  if (
    after.scopeMarkers - before.scopeMarkers !== markers.length ||
    after.scopeReady - before.scopeReady !== replies.length ||
    markers.length > 1 ||
    replies.length > 1
  )
    blocked('scope同步不是完整观测的一对marker/ack，无法归属本次整体刷新');
  if (!markers.length && !replies.length) return;
  const marker = markers[0];
  if (
    !marker ||
    !marker.requestId ||
    input.previousMarkerIds.includes(marker.requestId) ||
    marker.socketId !== input.baselineSocketId ||
    !Number.isFinite(marker.at) ||
    !Number.isFinite(input.refreshStartedAt) ||
    !input.reads.some(
      (read) =>
        read.status === 200 &&
        Number.isFinite(read.at) &&
        read.at >= input.refreshStartedAt &&
        read.responseAt !== undefined &&
        Number.isFinite(read.responseAt) &&
        read.responseAt > read.at &&
        marker.at > read.responseAt,
    )
  )
    blocked('scope marker缺少同原连接且先于它的真实本次200响应');
  const reply = replies[0];
  if (!reply) {
    if (input.requireReady) blocked('整体刷新后marker尚无真实匹配scope_ready，不能capture确认基线');
    return;
  }
  if (
    !after.scopeEstablished ||
    reply.socketId !== marker.socketId ||
    reply.requestId !== marker.requestId ||
    !Number.isFinite(reply.at) ||
    reply.at < marker.at ||
    !Number.isSafeInteger(reply.startSeq) ||
    reply.startSeq! < input.baselineStartSeq ||
    (reply.startSeq !== 0 && !input.receivedSequences.includes(reply.startSeq!))
  )
    blocked('整体刷新scope_ready身份/时序/水位缺少真实同连接证据');
}
