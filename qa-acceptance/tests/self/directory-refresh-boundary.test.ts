import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDirectoryRefreshBoundary,
  type DirectoryRefreshBoundary,
} from '../ui/directory-refresh-boundary.js';
import { BlockedError } from '../../harness/security.js';

function sample(): DirectoryRefreshBoundary {
  const before = {
    url: 'http://localhost/#/groups',
    navigations: 1,
    socketChanges: 1,
    scopeReady: 1,
    scopeMarkers: 1,
    staleScopeReady: 0,
    scopeEstablished: true,
  };
  return {
    before,
    after: { ...before, scopeReady: 2, scopeMarkers: 2 },
    sameDocument: true,
    baselineSocketId: 1,
    baselineStartSeq: 5,
    refreshStartedAt: 10,
    reads: [{ at: 11, responseAt: 12, status: 200 }],
    markers: [{ at: 13, socketId: 1, requestId: 'actual-marker' }],
    replies: [{ at: 14, socketId: 1, requestId: 'actual-marker', startSeq: 8 }],
    previousMarkerIds: ['old-marker'],
    receivedSequences: [5, 8],
    frames: [{ type: 'scope_ready' }],
    requireReady: true,
  };
}
test('same document/socket full refresh may acknowledge an actually received newer watermark', () => {
  assert.doesNotThrow(() => assertDirectoryRefreshBoundary(sample()));
  const noSync = sample();
  noSync.after = { ...noSync.before };
  noSync.markers = [];
  noSync.replies = [];
  assert.doesNotThrow(() => assertDirectoryRefreshBoundary(noSync));
});
test('marker before actual 200, failed/old responses and fabricated receipt time never qualify', () => {
  for (const change of [
    (s: DirectoryRefreshBoundary) => {
      s.markers[0]!.at = 11.5;
    },
    (s: DirectoryRefreshBoundary) => {
      s.reads[0]!.status = 503;
    },
    (s: DirectoryRefreshBoundary) => {
      s.reads[0]!.at = 9;
    },
    (s: DirectoryRefreshBoundary) => {
      s.reads[0]!.responseAt = NaN;
    },
  ]) {
    const s = sample();
    change(s);
    assert.throws(() => assertDirectoryRefreshBoundary(s), BlockedError);
  }
});
test('pending ack is observable during refresh but cannot establish the later confirmation baseline', () => {
  const s = sample();
  s.replies = [];
  s.after.scopeReady = 1;
  s.requireReady = false;
  assert.doesNotThrow(() => assertDirectoryRefreshBoundary(s));
  s.requireReady = true;
  assert.throws(() => assertDirectoryRefreshBoundary(s), BlockedError);
});
test('wrong request/socket, unsolicited ack and skipped actual watermark remain blocked', () => {
  for (const change of [
    (s: DirectoryRefreshBoundary) => {
      s.replies[0]!.requestId = 'other';
    },
    (s: DirectoryRefreshBoundary) => {
      s.previousMarkerIds.push('actual-marker');
    },
    (s: DirectoryRefreshBoundary) => {
      s.replies[0]!.socketId = 2;
    },
    (s: DirectoryRefreshBoundary) => {
      s.markers = [];
      s.after.scopeMarkers = 1;
    },
    (s: DirectoryRefreshBoundary) => {
      s.receivedSequences = [5, 9];
    },
    (s: DirectoryRefreshBoundary) => {
      s.replies[0]!.startSeq = 4;
      s.receivedSequences.push(4);
    },
  ]) {
    const s = sample();
    change(s);
    assert.throws(() => assertDirectoryRefreshBoundary(s), BlockedError);
  }
});
test('real document/navigation/socket/auth changes and later business events remain blocked', () => {
  for (const change of [
    (s: DirectoryRefreshBoundary) => {
      s.sameDocument = false;
    },
    (s: DirectoryRefreshBoundary) => {
      s.after.scopeEstablished = false;
    },
    (s: DirectoryRefreshBoundary) => {
      s.after.navigations++;
    },
    (s: DirectoryRefreshBoundary) => {
      s.after.url += '/other';
    },
    (s: DirectoryRefreshBoundary) => {
      s.after.socketChanges++;
    },
    (s: DirectoryRefreshBoundary) => {
      s.after.staleScopeReady++;
    },
    (s: DirectoryRefreshBoundary) => {
      s.frames.push({ type: 'auth' });
    },
    (s: DirectoryRefreshBoundary) => {
      s.frames.push({ type: 'group_changed', seq: 9 });
    },
  ]) {
    const s = sample();
    change(s);
    assert.throws(() => assertDirectoryRefreshBoundary(s), BlockedError);
  }
});
