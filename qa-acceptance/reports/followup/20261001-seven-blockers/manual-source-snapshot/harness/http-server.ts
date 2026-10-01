import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type JsonRecord = Record<string, unknown>;

export function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 2 * 1024 * 1024) throw new Error('QA request body exceeds 2MiB');
    chunks.push(bytes);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length ? (JSON.parse(raw) as unknown) : null;
}

export function respond(
  response: ServerResponse,
  status: number,
  body: unknown,
  rawBody?: string,
): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(rawBody ?? JSON.stringify(body));
}

export async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  host = '127.0.0.1',
  port = 0,
): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    void handler(request, response).catch((error: unknown) => {
      respond(response, 500, {
        code: 'QA_SIMULATOR_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return { server, url: `http://${host.includes(':') ? `[${host}]` : host}:${address.port}` };
}

export async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

/** Every scheduled task is tracked so closing a simulator leaves no timers behind. */
export class Tasks {
  private readonly sleepers = new Map<ReturnType<typeof setTimeout>, () => void>();
  private readonly pending = new Set<Promise<void>>();
  readonly errors: string[] = [];
  closed = false;

  async delay(ms: number): Promise<void> {
    if (this.closed || ms <= 0) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.sleepers.delete(timer);
        resolve();
      }, ms);
      this.sleepers.set(timer, resolve);
    });
  }

  run(work: () => Promise<void>): void {
    const task = work().catch((error: unknown) => {
      this.errors.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
    });
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const [timer, resolve] of this.sleepers) {
      clearTimeout(timer);
      resolve();
    }
    this.sleepers.clear();
    await Promise.all(this.pending);
  }
}

export async function waitForValue<T>(
  read: () => T | undefined,
  timeoutMs: number,
  description: string,
): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  while (true) {
    const value = read();
    if (value !== undefined) return value;
    if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}
