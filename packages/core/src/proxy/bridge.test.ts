import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ProxyBridge } from './bridge.js';

interface TestServer {
  close: () => Promise<void>;
}

async function startHttpTarget(): Promise<{ port: number; server: http.Server }> {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, host: req.headers.host, url: req.url }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as net.AddressInfo;
  return { port: addr.port, server };
}

async function startMockHttpConnectProxy(opts: {
  username: string;
  password: string;
  domainRewriteHost: string;
}): Promise<{ port: number; requests: string[]; close: () => Promise<void> }> {
  const requests: string[] = [];
  const expectedAuth = `Basic ${Buffer.from(`${opts.username}:${opts.password}`).toString('base64')}`;

  const server = http.createServer((_req, res) => {
    res.writeHead(405).end();
  });

  server.on('connect', (req, clientSocket, head) => {
    requests.push(`${req.url} auth=${req.headers['proxy-authorization'] === expectedAuth}`);
    if (req.headers['proxy-authorization'] !== expectedAuth) {
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    const [rawHost, rawPort] = (req.url ?? '').split(':');
    const targetHost = rawHost === 'probe.zita.test' ? opts.domainRewriteHost : rawHost;
    const targetPort = Number.parseInt(rawPort ?? '80', 10);

    const upstream = net.connect(targetPort, targetHost, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as net.AddressInfo;
  return {
    port: addr.port,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function startMockSocks5Proxy(opts: {
  username: string;
  password: string;
  domainRewriteHost: string;
}): Promise<{ port: number; requests: string[]; close: () => Promise<void> }> {
  const requests: string[] = [];
  const sockets = new Set<net.Socket>();

  const server = net.createServer((client) => {
    sockets.add(client);
    client.once('close', () => sockets.delete(client));

    let stage: 'greeting' | 'auth' | 'connect' | 'tunnel' = 'greeting';
    let buf = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      if (stage === 'tunnel') return;
      buf = Buffer.concat([buf, chunk]);

      if (stage === 'greeting') {
        if (buf.length < 2) return;
        const nMethods = buf[1];
        if (buf.length < 2 + nMethods) return;
        const methods = buf.subarray(2, 2 + nMethods);
        buf = buf.subarray(2 + nMethods);
        if (!methods.includes(0x02)) {
          client.write(Buffer.from([0x05, 0xff]));
          client.destroy();
          return;
        }
        stage = 'auth';
        client.write(Buffer.from([0x05, 0x02]));
      }

      if (stage === 'auth') {
        if (buf.length < 2) return;
        const uLen = buf[1];
        if (buf.length < 3 + uLen) return;
        const pLen = buf[2 + uLen];
        if (buf.length < 3 + uLen + pLen) return;
        const user = buf.subarray(2, 2 + uLen).toString('utf8');
        const pass = buf.subarray(3 + uLen, 3 + uLen + pLen).toString('utf8');
        buf = buf.subarray(3 + uLen + pLen);
        if (user !== opts.username || pass !== opts.password) {
          client.write(Buffer.from([0x01, 0x01]));
          client.destroy();
          return;
        }
        stage = 'connect';
        client.write(Buffer.from([0x01, 0x00]));
      }

      if (stage === 'connect') {
        if (buf.length < 4) return;
        const atyp = buf[3];
        let host = '';
        let port = 0;
        let consumed = 0;
        if (atyp === 0x01) {
          if (buf.length < 10) return;
          host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
          port = buf.readUInt16BE(8);
          consumed = 10;
        } else if (atyp === 0x03) {
          if (buf.length < 5) return;
          const dLen = buf[4];
          if (buf.length < 5 + dLen + 2) return;
          host = buf.subarray(5, 5 + dLen).toString('utf8');
          port = buf.readUInt16BE(5 + dLen);
          consumed = 5 + dLen + 2;
        } else {
          client.destroy();
          return;
        }

        const leftover = buf.subarray(consumed);
        buf = Buffer.alloc(0);
        stage = 'tunnel';
        client.off('data', onData);
        requests.push(`${host}:${port} atyp=${atyp}`);

        const dialHost = host === 'probe.zita.test' ? opts.domainRewriteHost : host;
        const upstream = net.connect(port, dialHost, () => {
          sockets.add(upstream);
          upstream.once('close', () => sockets.delete(upstream));
          client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          if (leftover.length > 0) upstream.write(leftover);
          client.pipe(upstream);
          upstream.pipe(client);
        });
        upstream.on('error', () => client.destroy());
        client.on('error', () => upstream.destroy());
      }
    };

    client.on('data', onData);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as net.AddressInfo;
  return {
    port: addr.port,
    requests,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function socks5HttpGet(
  bridgePort: number,
  targetHost: string,
  targetPort: number,
): Promise<{ replyCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(bridgePort, '127.0.0.1');
    let stage: 'greeting' | 'connect' | 'http' = 'greeting';
    let buf = Buffer.alloc(0);
    let replyCode = -1;

    socket.once('connect', () => {
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'greeting') {
        if (buf.length < 2) return;
        buf = buf.subarray(2);
        stage = 'connect';
        const hostBuf = Buffer.from(targetHost, 'utf8');
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(targetPort, 0);
        socket.write(
          Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]), hostBuf, portBuf]),
        );
      } else if (stage === 'connect') {
        if (buf.length < 10) return;
        replyCode = buf[1];
        buf = buf.subarray(10);
        if (replyCode !== 0x00) {
          socket.destroy();
          resolve({ replyCode, body: '' });
          return;
        }
        stage = 'http';
        socket.write(`GET /ping HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nConnection: close\r\n\r\n`);
      }
    });

    socket.on('end', () => {
      resolve({ replyCode, body: buf.toString('utf8') });
    });

    socket.on('error', (err) => {
      if (replyCode > 0) {
        resolve({ replyCode, body: '' });
      } else {
        reject(err);
      }
    });
  });
}

describe('ProxyBridge', () => {
  const cleanups: Array<() => Promise<void> | TestServer> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop()!;
      await fn();
    }
  });

  it('forwards domain CONNECT over authenticated HTTP proxy without local DNS and tracks bytes', async () => {
    const target = await startHttpTarget();
    cleanups.push(() => new Promise<void>((r) => target.server.close(() => r())));

    const mockHttp = await startMockHttpConnectProxy({
      username: 'zita_user',
      password: 'secret_password',
      domainRewriteHost: '127.0.0.1',
    });
    cleanups.push(mockHttp.close);

    const bridge = new ProxyBridge({
      upstream: {
        type: 'http',
        host: '127.0.0.1',
        port: mockHttp.port,
        username: 'zita_user',
        password: 'secret_password',
      },
    });
    cleanups.push(() => bridge.stop());

    const addr = await bridge.start();
    const res = await socks5HttpGet(addr.port, 'probe.zita.test', target.port);

    expect(res.replyCode).toBe(0x00);
    expect(res.body).toContain('"ok":true');
    expect(res.body).toContain(`"host":"probe.zita.test:${target.port}"`);
    expect(mockHttp.requests).toEqual([`probe.zita.test:${target.port} auth=true`]);

    const stats = bridge.getStats();
    expect(stats.bytesUp).toBeGreaterThan(0);
    expect(stats.bytesDown).toBeGreaterThan(0);
    expect(stats.totalConnections).toBe(1);

    await bridge.stop();
    expect(bridge.getStats().activeConnections).toBe(0);
  });

  it('rejects cleanly when HTTP upstream rejects invalid credentials', async () => {
    const target = await startHttpTarget();
    cleanups.push(() => new Promise<void>((r) => target.server.close(() => r())));

    const mockHttp = await startMockHttpConnectProxy({
      username: 'zita_user',
      password: 'correct_password',
      domainRewriteHost: '127.0.0.1',
    });
    cleanups.push(mockHttp.close);

    const bridge = new ProxyBridge({
      upstream: {
        type: 'http',
        host: '127.0.0.1',
        port: mockHttp.port,
        username: 'zita_user',
        password: 'wrong_password',
      },
    });
    cleanups.push(() => bridge.stop());

    const addr = await bridge.start();
    const res = await socks5HttpGet(addr.port, 'probe.zita.test', target.port);

    expect(res.replyCode).not.toBe(0x00);
    expect(res.body).toBe('');
    expect(mockHttp.requests).toEqual([`probe.zita.test:${target.port} auth=false`]);
  });

  it('forwards domain CONNECT over authenticated SOCKS5 upstream without local DNS', async () => {
    const target = await startHttpTarget();
    cleanups.push(() => new Promise<void>((r) => target.server.close(() => r())));

    const mockSocks = await startMockSocks5Proxy({
      username: 's5_user',
      password: 's5_password',
      domainRewriteHost: '127.0.0.1',
    });
    cleanups.push(mockSocks.close);

    const bridge = new ProxyBridge({
      upstream: {
        type: 'socks5',
        host: '127.0.0.1',
        port: mockSocks.port,
        username: 's5_user',
        password: 's5_password',
      },
    });
    cleanups.push(() => bridge.stop());

    const addr = await bridge.start();
    const res = await socks5HttpGet(addr.port, 'probe.zita.test', target.port);

    expect(res.replyCode).toBe(0x00);
    expect(res.body).toContain('"ok":true');
    expect(mockSocks.requests).toEqual([`probe.zita.test:${target.port} atyp=3`]);

    const stats = bridge.getStats();
    expect(stats.bytesUp).toBeGreaterThan(0);
    expect(stats.bytesDown).toBeGreaterThan(0);
  });

  it('fails cleanly when SOCKS5 upstream rejects invalid credentials', async () => {
    const target = await startHttpTarget();
    cleanups.push(() => new Promise<void>((r) => target.server.close(() => r())));

    const mockSocks = await startMockSocks5Proxy({
      username: 's5_user',
      password: 's5_password',
      domainRewriteHost: '127.0.0.1',
    });
    cleanups.push(mockSocks.close);

    const bridge = new ProxyBridge({
      upstream: {
        type: 'socks5',
        host: '127.0.0.1',
        port: mockSocks.port,
        username: 's5_user',
        password: 'wrong_password',
      },
    });
    cleanups.push(() => bridge.stop());

    const addr = await bridge.start();
    const res = await socks5HttpGet(addr.port, 'probe.zita.test', target.port);

    expect(res.replyCode).not.toBe(0x00);
    expect(res.body).toBe('');
    expect(mockSocks.requests).toEqual([]);
  });

  it('survives abrupt client and upstream ECONNRESET without uncaught errors', async () => {
    const target = await startHttpTarget();
    cleanups.push(() => new Promise<void>((r) => target.server.close(() => r())));

    // Slow upstream proxy that delays replying to CONNECT so client resets mid-dial
    const slowSockets = new Set<net.Socket>();
    const slowUpstream = net.createServer((sock) => {
      slowSockets.add(sock);
      sock.on('error', () => sock.destroy());
      sock.once('close', () => slowSockets.delete(sock));
      sock.once('data', () => {
        setTimeout(() => {
          if (!sock.destroyed) sock.resetAndDestroy();
        }, 120);
      });
    });
    await new Promise<void>((resolve) => slowUpstream.listen(0, '127.0.0.1', resolve));
    const slowAddr = slowUpstream.address() as net.AddressInfo;
    cleanups.push(async () => {
      for (const s of slowSockets) s.destroy();
      await new Promise<void>((r) => slowUpstream.close(() => r()));
    });

    const bridge = new ProxyBridge({
      upstream: {
        type: 'http',
        host: '127.0.0.1',
        port: slowAddr.port,
      },
    });
    cleanups.push(() => bridge.stop());

    const addr = await bridge.start();

    await new Promise<void>((resolve) => {
      const client = net.connect(addr.port, '127.0.0.1', () => {
        client.write(Buffer.from([0x05, 0x01, 0x00]));
      });
      client.on('error', () => resolve());
      client.once('data', () => {
        const hostBuf = Buffer.from('probe.zita.test', 'utf8');
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(target.port, 0);
        client.write(
          Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]), hostBuf, portBuf]),
        );
        // Reset socket abruptly right after sending CONNECT while bridge is dialing upstream
        setTimeout(() => {
          client.resetAndDestroy();
          resolve();
        }, 25);
      });
    });

    await new Promise((r) => setTimeout(r, 200));

    // Also test direct upstream reset mid-stream and verify bridge stays healthy
    const directBridge = new ProxyBridge({ upstream: { type: 'direct' } });
    cleanups.push(() => directBridge.stop());
    const directAddr = await directBridge.start();

    const resetServer = net.createServer((sock) => {
      sock.on('error', () => sock.destroy());
      setTimeout(() => {
        if (!sock.destroyed) sock.resetAndDestroy();
      }, 20);
    });
    await new Promise<void>((resolve) => resetServer.listen(0, '127.0.0.1', resolve));
    const resetAddr = resetServer.address() as net.AddressInfo;
    cleanups.push(() => new Promise<void>((r) => resetServer.close(() => r())));

    const resetRes = await socks5HttpGet(directAddr.port, '127.0.0.1', resetAddr.port).catch(() => ({
      replyCode: -1,
      body: '',
    }));
    expect(resetRes.body).toBe('');

    const okRes = await socks5HttpGet(directAddr.port, '127.0.0.1', target.port);
    expect(okRes.replyCode).toBe(0x00);
    expect(okRes.body).toContain('"ok":true');
  });
});
