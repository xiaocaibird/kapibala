import net from 'node:net';
import http from 'node:http';
import type { Socket } from 'node:net';

export async function availablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((ok, bad) => {
    server.once('error', bad);
    server.listen(0, '127.0.0.1', ok);
  });
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((ok, bad) => server.close((e) => (e ? bad(e) : ok())));
  return port;
}
export class DatabaseProxy {
  private server?: net.Server;
  private sockets = new Set<Socket>();
  private blocked = false;
  port = 0;
  constructor(private readonly upstreamPort: number) {}
  async start(): Promise<void> {
    if (this.server) throw new Error('数据库代理已启动');
    this.server = net.createServer((client) => {
      if (this.blocked) {
        client.destroy();
        return;
      }
      const upstream = net.connect(this.upstreamPort, '127.0.0.1');
      for (const s of [client, upstream]) {
        this.sockets.add(s);
        s.on('error', () => {
          client.destroy();
          upstream.destroy();
        });
        s.on('close', () => {
          this.sockets.delete(s);
          client.destroy();
          upstream.destroy();
        });
      }
      client.pipe(upstream).pipe(client);
    });
    await new Promise<void>((ok, bad) => {
      this.server!.once('error', bad);
      this.server!.listen(0, '127.0.0.1', ok);
    });
    this.port = (this.server.address() as net.AddressInfo).port;
  }
  interrupt(): void {
    this.blocked = true;
    for (const s of this.sockets) s.destroy();
  }
  restore(): void {
    this.blocked = false;
  }
  async close(): Promise<void> {
    this.interrupt();
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise<void>((ok, bad) => server.close((e) => (e ? bad(e) : ok())));
  }
}
export function requestPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n\0]/.test(raw))
    throw new Error('拒绝非当前origin请求');
  const path = decodeURIComponent(raw.split('?')[0]!);
  if (path.startsWith('//') || /[\\\r\n\0]/.test(path)) throw new Error('拒绝编码的跨origin路径');
  return path;
}
/** Unknown paths fail closed rather than reaching an unreviewed Vite proxy target. */
export class BrowserProxy {
  private server?: http.Server;
  private sockets = new Set<Socket>();
  private requests = new Set<http.ClientRequest>();
  url = '';
  constructor(
    private readonly apiPort: number,
    private readonly webPort: number,
    private readonly routes: string[] = ['/', '/index.html'],
  ) {}
  private destination(raw: string | undefined, upgrade = false): number {
    const path = requestPath(raw);
    if (path === '/api' || path.startsWith('/api/') || path === '/ws') return this.apiPort;
    const page = this.routes.some((route) => {
      const pattern = route
        .split(/[?#]/)[0]!
        .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
        .replace(/\{[^}]+\}/g, '[^/]+');
      return new RegExp(`^${pattern}$`).test(path);
    });
    const asset =
      /^\/(?:@vite\/|@id\/|@fs\/|src\/|node_modules\/|assets\/)/.test(path) ||
      /^\/(?:favicon[^/]*|vite\.svg|index\.html)$/.test(path);
    if (page || asset || (upgrade && path === '/')) return this.webPort;
    throw new Error('未声明的前端路径不能通过开发代理访问其他服务');
  }
  async start(): Promise<void> {
    if (this.server) throw new Error('浏览器代理已启动');
    this.server = http.createServer((req, res) => {
      let port: number;
      try {
        port = this.destination(req.url);
      } catch {
        res.writeHead(403);
        res.end('QA isolation rejected request');
        return;
      }
      const upstream = http.request(
        {
          host: '127.0.0.1',
          port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: `127.0.0.1:${port}` },
        },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        },
      );
      this.requests.add(upstream);
      upstream.on('close', () => this.requests.delete(upstream));
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end('QA upstream unavailable');
      });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    });
    this.server.on('connection', (s) => {
      this.sockets.add(s);
      s.on('close', () => this.sockets.delete(s));
    });
    this.server.on('upgrade', (req, socket, head) => {
      let port: number;
      try {
        port = this.destination(req.url, true);
      } catch {
        socket.destroy();
        return;
      }
      const upstream = net.connect(port, '127.0.0.1', () => {
        const headers = { ...req.headers, host: `127.0.0.1:${port}` };
        upstream.write(
          `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries(headers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\r\n')}\r\n\r\n`,
        );
        if (head.length) upstream.write(head);
        socket.pipe(upstream).pipe(socket);
      });
      this.sockets.add(upstream);
      upstream.on('close', () => {
        this.sockets.delete(upstream);
        socket.destroy();
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      socket.on('close', () => upstream.destroy());
    });
    await new Promise<void>((ok, bad) => {
      this.server!.once('error', bad);
      this.server!.listen(0, '127.0.0.1', ok);
    });
    this.url = `http://127.0.0.1:${(this.server.address() as net.AddressInfo).port}`;
  }
  async close(): Promise<void> {
    for (const r of this.requests) r.destroy();
    for (const s of this.sockets) s.destroy();
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise<void>((ok, bad) => server.close((e) => (e ? bad(e) : ok())));
  }
}
