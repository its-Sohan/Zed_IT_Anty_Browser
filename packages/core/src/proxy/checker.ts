import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import type { ProxyCheckResult, ProxyConfig } from '@zita/shared';
import { ProxyBridge } from './bridge.js';

export interface CheckProxyOptions {
  echoUrl?: string;
  timeoutMs?: number;
}

function connectViaSocks5(
  bridgePort: number,
  targetHost: string,
  targetPort: number,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(bridgePort, '127.0.0.1');
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Proxy check timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let stage: 'greeting' | 'connect' = 'greeting';
    let buf = Buffer.alloc(0);

    const fail = (err: Error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };

    socket.once('error', fail);
    socket.once('connect', () => {
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'greeting') {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05 || buf[1] !== 0x00) {
          fail(new Error('Local SOCKS5 greeting rejected'));
          return;
        }
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
        const replyCode = buf[1];
        if (replyCode !== 0x00) {
          fail(new Error(`Upstream proxy failed with SOCKS5 status code ${replyCode}`));
          return;
        }
        clearTimeout(timer);
        socket.off('data', onData);
        socket.off('error', fail);
        socket.on('error', () => {
          if (!socket.destroyed) socket.destroy();
        });
        resolve(socket);
      }
    };

    socket.on('data', onData);
  });
}

async function fetchJsonThroughBridge(
  bridgePort: number,
  urlStr: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const url = new URL(urlStr);
  const isHttps = url.protocol === 'https:';
  const port = url.port ? Number.parseInt(url.port, 10) : isHttps ? 443 : 80;
  const rawSocket = await connectViaSocks5(bridgePort, url.hostname, port, timeoutMs);

  const transportSocket = isHttps
    ? tls.connect({ socket: rawSocket, servername: url.hostname, rejectUnauthorized: true })
    : rawSocket;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      if (!transportSocket.destroyed) transportSocket.destroy();
      if (!rawSocket.destroyed) rawSocket.destroy();
      reject(err);
    };

    rawSocket.on('error', settleReject);
    transportSocket.on('error', settleReject);

    const reqModule = isHttps ? https : http;
    const req = reqModule.request(
      {
        hostname: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        createConnection: () => transportSocket,
        headers: {
          Host: url.host,
          Accept: 'application/json',
          'User-Agent': 'ZedITAntiBrowser/1.0',
          Connection: 'close',
        },
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (settled) return;
          if ((res.statusCode ?? 500) >= 400) {
            settleReject(new Error(`Geo lookup returned HTTP ${res.statusCode}`));
            return;
          }
          try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            settled = true;
            resolve(parsed);
          } catch {
            settleReject(new Error('Geo lookup returned non-JSON response'));
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Proxy check request timed out after ${timeoutMs}ms`));
    });
    req.on('error', settleReject);
    req.end();
  });
}

/**
 * Tests a proxy through a temporary loopback ProxyBridge and extracts exit IP and geo metadata.
 */
export async function checkProxy(
  config: ProxyConfig,
  opts: CheckProxyOptions = {},
): Promise<ProxyCheckResult> {
  const echoUrl = opts.echoUrl ?? 'https://ipwho.is/';
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  const bridge = new ProxyBridge({
    upstream: {
      type: config.protocol,
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
    },
    connectTimeoutMs: timeoutMs,
  });

  try {
    const addr = await bridge.start();
    const data = await fetchJsonThroughBridge(addr.port, echoUrl, timeoutMs);
    const latencyMs = Date.now() - startedAt;

    const exitIp = typeof data.ip === 'string' ? data.ip : null;
    const country =
      typeof data.country_code === 'string'
        ? data.country_code
        : typeof data.country === 'string'
          ? data.country
          : null;
    const city = typeof data.city === 'string' ? data.city : null;

    let timezone: string | null = null;
    if (typeof data.timezone === 'string') {
      timezone = data.timezone;
    } else if (
      typeof data.timezone === 'object' &&
      data.timezone !== null &&
      typeof (data.timezone as { id?: unknown }).id === 'string'
    ) {
      timezone = (data.timezone as { id: string }).id;
    }

    return {
      ok: true,
      exitIp,
      country,
      city,
      timezone,
      latencyMs,
      error: null,
      checkedAt,
    };
  } catch (err) {
    return {
      ok: false,
      exitIp: null,
      country: null,
      city: null,
      timezone: null,
      latencyMs: null,
      error: err instanceof Error ? err.message : 'Proxy check failed',
      checkedAt,
    };
  } finally {
    await bridge.stop();
  }
}
