import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { SecretBox } from '../crypto/secrets.js';
import { openDatabase } from '../db/index.js';
import { parseBulkProxies } from './parser.js';
import { ProxyService } from './service.js';

describe('ProxyService & bulk parser', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length) {
      await cleanups.pop()!();
    }
  });

  it('parses mixed proxy formats, detects duplicates, and reports malformed lines', () => {
    const raw = [
      'socks5://alice:pass1@10.0.0.1:1080',
      '10.0.0.2:8080:bob:pass2',
      '10.0.0.2:8080:bob:pass2',
      'not-a-proxy',
    ].join('\n');

    const res = parseBulkProxies(raw, 'http');
    expect(res.valid).toHaveLength(2);
    expect(res.duplicates).toHaveLength(1);
    expect(res.errors).toHaveLength(1);
  });

  it('stores encrypted credentials and checks proxy through ProxyBridge against local echo server', async () => {
    const db = openDatabase(':memory:');
    cleanups.push(() => db.close());

    const echoServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ip: '203.0.113.55',
          country_code: 'US',
          city: 'New York',
          timezone: { id: 'America/New_York' },
        }),
      );
    });
    await new Promise<void>((r) => echoServer.listen(0, '127.0.0.1', r));
    cleanups.push(() => new Promise<void>((r) => echoServer.close(() => r())));
    const echoPort = (echoServer.address() as net.AddressInfo).port;

    const proxyServer = http.createServer((_req, res) => res.writeHead(405).end());
    proxyServer.on('connect', (req, clientSocket, head) => {
      const expected = `Basic ${Buffer.from('u1:p1').toString('base64')}`;
      if (req.headers['proxy-authorization'] !== expected) {
        clientSocket.write('HTTP/1.1 407 Proxy Auth Required\r\n\r\n');
        clientSocket.destroy();
        return;
      }
      const [h, p] = (req.url ?? '').split(':');
      const up = net.connect(Number(p), h!, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) up.write(head);
        up.pipe(clientSocket);
        clientSocket.pipe(up);
      });
      up.on('error', () => clientSocket.destroy());
    });
    await new Promise<void>((r) => proxyServer.listen(0, '127.0.0.1', r));
    cleanups.push(() => new Promise<void>((r) => proxyServer.close(() => r())));
    const proxyPort = (proxyServer.address() as net.AddressInfo).port;

    const svc = new ProxyService(db, new SecretBox(Buffer.alloc(32, 7)));
    const created = svc.create({
      label: 'Local Mock HTTP',
      protocol: 'http',
      host: '127.0.0.1',
      port: proxyPort,
      username: 'u1',
      password: 'p1',
    });
    expect(created.hasAuth).toBe(true);
    expect(svc.revealPassword(created.id)).toBe('p1');

    const check = await svc.test(created.id, { echoUrl: `http://127.0.0.1:${echoPort}/` });
    expect(check.ok).toBe(true);
    expect(check.exitIp).toBe('203.0.113.55');
    expect(check.country).toBe('US');
    expect(check.timezone).toBe('America/New_York');

    const refreshed = svc.getById(created.id)!;
    expect(refreshed.country).toBe('US');
    expect(refreshed.timezone).toBe('America/New_York');
  });
});
