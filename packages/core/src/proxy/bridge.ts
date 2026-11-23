import net from 'node:net';
import tls from 'node:tls';
import type { ProxyStats } from '@zita/shared';

export type ProxyUpstream =
  | {
      type: 'http' | 'https';
      host: string;
      port: number;
      username?: string;
      password?: string;
    }
  | {
      type: 'socks5';
      host: string;
      port: number;
      username?: string;
      password?: string;
    }
  | {
      type: 'direct';
    };

export interface ConnectTarget {
  host: string;
  port: number;
  addressType: 'ipv4' | 'domain' | 'ipv6';
  rawAddrBytes: Buffer;
  atyp: number;
}

export interface ProxyBridgeConfig {
  upstream: ProxyUpstream;
  connectTimeoutMs?: number;
  onConnect?: (target: { host: string; port: number; addressType: 'ipv4' | 'domain' | 'ipv6' }) => void;
}

function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function formatIpv4(buf: Buffer): string {
  return `${buf[0]}.${buf[1]}.${buf[2]}.${buf[3]}`;
}

function formatIpv6(buf: Buffer): string {
  const parts: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    parts.push(buf.readUInt16BE(i).toString(16));
  }
  return parts.join(':');
}

function sendSocks5Reply(socket: net.Socket, replyCode: number): void {
  if (socket.destroyed || !socket.writable) return;
  const reply = Buffer.from([0x05, replyCode, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
  socket.write(reply);
}

class SocketReader {
  private buffer: Buffer = Buffer.alloc(0);
  private closed = false;
  private error: Error | null = null;
  private waiter: (() => void) | null = null;

  constructor(private readonly socket: net.Socket) {
    socket.on('data', this.onData);
    socket.on('close', this.onClose);
    socket.on('error', this.onError);
  }

  private onData = (chunk: Buffer): void => {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    this.wake();
  };

  private onClose = (): void => {
    this.closed = true;
    this.wake();
  };

  private onError = (err: Error): void => {
    this.error = err;
    this.closed = true;
    this.wake();
  };

  private wake(): void {
    const w = this.waiter;
    this.waiter = null;
    if (w) w();
  }

  private async waitForMore(timeoutMs: number): Promise<void> {
    if (this.error) throw this.error;
    if (this.closed) throw new Error('Socket closed unexpectedly during handshake');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiter === onWake) this.waiter = null;
        reject(new Error(`Handshake read timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const onWake = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiter = onWake;
    });
  }

  async readExact(n: number, timeoutMs = 10_000): Promise<Buffer> {
    while (this.buffer.length < n) {
      await this.waitForMore(timeoutMs);
    }
    const slice = this.buffer.subarray(0, n);
    this.buffer = this.buffer.subarray(n);
    return slice;
  }

  async readUntil(delimiter: Buffer, maxBytes = 16_384, timeoutMs = 10_000): Promise<{ head: Buffer; rest: Buffer }> {
    while (true) {
      const idx = this.buffer.indexOf(delimiter);
      if (idx !== -1) {
        const end = idx + delimiter.length;
        const head = this.buffer.subarray(0, end);
        const rest = this.buffer.subarray(end);
        this.buffer = Buffer.alloc(0);
        return { head, rest };
      }
      if (this.buffer.length > maxBytes) {
        throw new Error(`Header exceeded ${maxBytes} bytes`);
      }
      await this.waitForMore(timeoutMs);
    }
  }

  detach(): Buffer {
    this.socket.off('data', this.onData);
    this.socket.off('close', this.onClose);
    this.socket.off('error', this.onError);
    const leftover = this.buffer;
    this.buffer = Buffer.alloc(0);
    return leftover;
  }
}

/**
 * Loopback-only SOCKS5 proxy bridge that handles upstream HTTP/HTTPS CONNECT or SOCKS5
 * authentication without exposing proxy credentials to Chromium and without resolving
 * target domain names locally.
 */
export class ProxyBridge {
  private server: net.Server | null = null;
  private host: '127.0.0.1' = '127.0.0.1';
  private port = 0;
  private activeSockets = new Set<net.Socket>();
  private bytesUp = 0;
  private bytesDown = 0;
  private activeConnections = 0;
  private totalConnections = 0;
  private readonly connectTimeoutMs: number;

  constructor(private readonly config: ProxyBridgeConfig) {
    this.connectTimeoutMs = config.connectTimeoutMs ?? 15_000;
  }

  async start(): Promise<{ host: '127.0.0.1'; port: number }> {
    if (this.server) {
      return { host: this.host, port: this.port };
    }

    const server = net.createServer((clientSocket) => {
      clientSocket.on('error', () => {
        if (!clientSocket.destroyed) clientSocket.destroy();
      });
      if (!isLoopbackAddress(clientSocket.remoteAddress)) {
        clientSocket.destroy();
        return;
      }
      this.handleClient(clientSocket).catch(() => {
        if (!clientSocket.destroyed) clientSocket.destroy();
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        server.on('error', () => {
          // Keep server resilient after bind
        });
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Failed to obtain loopback port for ProxyBridge');
    }

    this.server = server;
    this.port = address.port;
    return { host: this.host, port: this.port };
  }

  getAddress(): { host: '127.0.0.1'; port: number } | null {
    return this.server ? { host: this.host, port: this.port } : null;
  }

  getStats(): ProxyStats {
    return {
      bytesUp: this.bytesUp,
      bytesDown: this.bytesDown,
      activeConnections: this.activeConnections,
      totalConnections: this.totalConnections,
    };
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.port = 0;

    for (const sock of this.activeSockets) {
      sock.destroy();
    }
    this.activeSockets.clear();
    this.activeConnections = 0;

    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  private trackSocket(socket: net.Socket): void {
    this.activeSockets.add(socket);
    socket.on('error', () => {
      if (!socket.destroyed) socket.destroy();
    });
    socket.once('close', () => {
      this.activeSockets.delete(socket);
    });
  }

  private async handleClient(clientSocket: net.Socket): Promise<void> {
    this.trackSocket(clientSocket);
    this.totalConnections += 1;
    this.activeConnections += 1;

    let connectionCountClosed = false;
    const markClosed = () => {
      if (!connectionCountClosed) {
        connectionCountClosed = true;
        this.activeConnections = Math.max(0, this.activeConnections - 1);
      }
    };
    clientSocket.once('close', markClosed);

    const reader = new SocketReader(clientSocket);

    let target: ConnectTarget;
    try {
      const greetingHeader = await reader.readExact(2, this.connectTimeoutMs);
      if (greetingHeader[0] !== 0x05) {
        clientSocket.destroy();
        return;
      }
      const nMethods = greetingHeader[1];
      const methods = await reader.readExact(nMethods, this.connectTimeoutMs);
      if (!methods.includes(0x00)) {
        clientSocket.write(Buffer.from([0x05, 0xff]));
        clientSocket.end();
        return;
      }
      clientSocket.write(Buffer.from([0x05, 0x00]));

      const reqHead = await reader.readExact(4, this.connectTimeoutMs);
      const [ver, cmd, , atyp] = reqHead;
      if (ver !== 0x05) {
        sendSocks5Reply(clientSocket, 0x01);
        clientSocket.end();
        return;
      }
      if (cmd !== 0x01) {
        sendSocks5Reply(clientSocket, 0x07); // Command not supported
        clientSocket.end();
        return;
      }

      if (atyp === 0x01) {
        const rawIp = await reader.readExact(4, this.connectTimeoutMs);
        const portBuf = await reader.readExact(2, this.connectTimeoutMs);
        target = {
          host: formatIpv4(rawIp),
          port: portBuf.readUInt16BE(0),
          addressType: 'ipv4',
          rawAddrBytes: rawIp,
          atyp,
        };
      } else if (atyp === 0x03) {
        const lenBuf = await reader.readExact(1, this.connectTimeoutMs);
        const domainLen = lenBuf[0];
        const domainBuf = await reader.readExact(domainLen, this.connectTimeoutMs);
        const portBuf = await reader.readExact(2, this.connectTimeoutMs);
        target = {
          host: domainBuf.toString('utf8'),
          port: portBuf.readUInt16BE(0),
          addressType: 'domain',
          rawAddrBytes: Buffer.concat([lenBuf, domainBuf]),
          atyp,
        };
      } else if (atyp === 0x04) {
        const rawIp6 = await reader.readExact(16, this.connectTimeoutMs);
        const portBuf = await reader.readExact(2, this.connectTimeoutMs);
        target = {
          host: formatIpv6(rawIp6),
          port: portBuf.readUInt16BE(0),
          addressType: 'ipv6',
          rawAddrBytes: rawIp6,
          atyp,
        };
      } else {
        sendSocks5Reply(clientSocket, 0x08); // Address type not supported
        clientSocket.end();
        return;
      }
    } catch {
      clientSocket.destroy();
      return;
    }

    this.config.onConnect?.({
      host: target.host,
      port: target.port,
      addressType: target.addressType,
    });

    const clientLeftover = reader.detach();

    let upstreamResult: { socket: net.Socket; initialUpstreamData: Buffer };
    try {
      upstreamResult = await this.dialUpstream(target);
    } catch (err) {
      const code = (err as { socksReplyCode?: number }).socksReplyCode ?? 0x01;
      sendSocks5Reply(clientSocket, code);
      clientSocket.end();
      return;
    }

    const { socket: upstreamSocket, initialUpstreamData } = upstreamResult;
    this.trackSocket(upstreamSocket);

    const destroyBoth = () => {
      if (!clientSocket.destroyed) clientSocket.destroy();
      if (!upstreamSocket.destroyed) upstreamSocket.destroy();
    };

    clientSocket.on('error', destroyBoth);
    upstreamSocket.on('error', destroyBoth);

    if (clientSocket.destroyed) {
      destroyBoth();
      return;
    }

    sendSocks5Reply(clientSocket, 0x00);

    if (clientLeftover.length > 0 && !upstreamSocket.destroyed && upstreamSocket.writable) {
      this.bytesUp += clientLeftover.length;
      upstreamSocket.write(clientLeftover);
    }
    if (initialUpstreamData.length > 0 && !clientSocket.destroyed && clientSocket.writable) {
      this.bytesDown += initialUpstreamData.length;
      clientSocket.write(initialUpstreamData);
    }

    clientSocket.on('data', (chunk: Buffer) => {
      this.bytesUp += chunk.length;
    });
    upstreamSocket.on('data', (chunk: Buffer) => {
      this.bytesDown += chunk.length;
    });

    clientSocket.pipe(upstreamSocket);
    upstreamSocket.pipe(clientSocket);

    clientSocket.on('close', () => {
      if (!upstreamSocket.destroyed) upstreamSocket.end();
    });
    upstreamSocket.on('close', () => {
      if (!clientSocket.destroyed) clientSocket.end();
    });
  }

  private async dialUpstream(
    target: ConnectTarget,
  ): Promise<{ socket: net.Socket; initialUpstreamData: Buffer }> {
    const upstream = this.config.upstream;

    if (upstream.type === 'direct') {
      const socket = await this.connectTcp(target.host, target.port);
      return { socket, initialUpstreamData: Buffer.alloc(0) };
    }

    if (upstream.type === 'http' || upstream.type === 'https') {
      const socket =
        upstream.type === 'https'
          ? await this.connectTls(upstream.host, upstream.port)
          : await this.connectTcp(upstream.host, upstream.port);

      const reader = new SocketReader(socket);
      try {
        const hostHeader = target.addressType === 'ipv6' ? `[${target.host}]` : target.host;
        const lines = [
          `CONNECT ${hostHeader}:${target.port} HTTP/1.1`,
          `Host: ${hostHeader}:${target.port}`,
        ];
        if (upstream.username !== undefined || upstream.password !== undefined) {
          const token = Buffer.from(`${upstream.username ?? ''}:${upstream.password ?? ''}`, 'utf8').toString(
            'base64',
          );
          lines.push(`Proxy-Authorization: Basic ${token}`);
        }
        lines.push('Proxy-Connection: Keep-Alive', '', '');
        socket.write(lines.join('\r\n'));

        const { head, rest } = await reader.readUntil(Buffer.from('\r\n\r\n'), 16_384, this.connectTimeoutMs);
        const statusLine = head.toString('utf8').split('\r\n')[0] ?? '';
        const match = /^HTTP\/\d\.\d\s+(\d{3})/.exec(statusLine);
        const statusCode = match ? Number.parseInt(match[1], 10) : 0;
        if (statusCode !== 200) {
          const err = new Error(`Upstream HTTP proxy returned ${statusLine || 'invalid response'}`) as Error & {
            socksReplyCode?: number;
          };
          err.socksReplyCode = statusCode === 407 || statusCode === 403 ? 0x02 : 0x05;
          throw err;
        }

        const leftover = reader.detach();
        const initialUpstreamData =
          rest.length > 0 && leftover.length > 0
            ? Buffer.concat([rest, leftover])
            : rest.length > 0
              ? rest
              : leftover;
        return { socket, initialUpstreamData };
      } catch (err) {
        socket.destroy();
        throw err;
      }
    }

    // Upstream SOCKS5
    const socket = await this.connectTcp(upstream.host, upstream.port);
    const reader = new SocketReader(socket);
    try {
      const hasCreds = upstream.username !== undefined || upstream.password !== undefined;
      const methods = hasCreds ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00];
      socket.write(Buffer.from(methods));

      const choice = await reader.readExact(2, this.connectTimeoutMs);
      if (choice[0] !== 0x05 || choice[1] === 0xff) {
        const err = new Error('Upstream SOCKS5 rejected authentication methods') as Error & {
          socksReplyCode?: number;
        };
        err.socksReplyCode = 0x02;
        throw err;
      }

      if (choice[1] === 0x02) {
        if (!hasCreds) {
          const err = new Error('Upstream SOCKS5 requires username/password') as Error & {
            socksReplyCode?: number;
          };
          err.socksReplyCode = 0x02;
          throw err;
        }
        const userBuf = Buffer.from(upstream.username ?? '', 'utf8');
        const passBuf = Buffer.from(upstream.password ?? '', 'utf8');
        const authPacket = Buffer.concat([
          Buffer.from([0x01, userBuf.length]),
          userBuf,
          Buffer.from([passBuf.length]),
          passBuf,
        ]);
        socket.write(authPacket);
        const authResp = await reader.readExact(2, this.connectTimeoutMs);
        if (authResp[1] !== 0x00) {
          const err = new Error('Upstream SOCKS5 authentication failed') as Error & {
            socksReplyCode?: number;
          };
          err.socksReplyCode = 0x02;
          throw err;
        }
      } else if (choice[1] !== 0x00) {
        throw new Error(`Unsupported upstream SOCKS5 auth method: ${choice[1]}`);
      }

      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(target.port, 0);
      const connectReq = Buffer.concat([
        Buffer.from([0x05, 0x01, 0x00, target.atyp]),
        target.rawAddrBytes,
        portBuf,
      ]);
      socket.write(connectReq);

      const repHead = await reader.readExact(4, this.connectTimeoutMs);
      if (repHead[0] !== 0x05 || repHead[1] !== 0x00) {
        const err = new Error(`Upstream SOCKS5 CONNECT failed with code ${repHead[1]}`) as Error & {
          socksReplyCode?: number;
        };
        err.socksReplyCode = repHead[1] || 0x01;
        throw err;
      }

      const repAtyp = repHead[3];
      if (repAtyp === 0x01) {
        await reader.readExact(6, this.connectTimeoutMs);
      } else if (repAtyp === 0x03) {
        const lenBuf = await reader.readExact(1, this.connectTimeoutMs);
        await reader.readExact(lenBuf[0] + 2, this.connectTimeoutMs);
      } else if (repAtyp === 0x04) {
        await reader.readExact(18, this.connectTimeoutMs);
      } else {
        throw new Error(`Invalid upstream SOCKS5 reply ATYP: ${repAtyp}`);
      }

      const initialUpstreamData = reader.detach();
      return { socket, initialUpstreamData };
    } catch (err) {
      socket.destroy();
      throw err;
    }
  }

  private connectTcp(host: string, port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        const err = new Error(`TCP connect timed out (${host}:${port})`) as Error & {
          socksReplyCode?: number;
        };
        err.socksReplyCode = 0x04;
        reject(err);
      }, this.connectTimeoutMs);

      socket.once('connect', () => {
        clearTimeout(timer);
        socket.on('error', () => {
          if (!socket.destroyed) socket.destroy();
        });
        resolve(socket);
      });

      socket.once('error', (rawErr) => {
        clearTimeout(timer);
        const err = rawErr as Error & { socksReplyCode?: number };
        err.socksReplyCode = 0x05;
        reject(err);
      });
    });
  }

  private connectTls(host: string, port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host, port, rejectUnauthorized: true });
      const timer = setTimeout(() => {
        socket.destroy();
        const err = new Error(`TLS connect timed out (${host}:${port})`) as Error & {
          socksReplyCode?: number;
        };
        err.socksReplyCode = 0x04;
        reject(err);
      }, this.connectTimeoutMs);

      socket.once('secureConnect', () => {
        clearTimeout(timer);
        socket.on('error', () => {
          if (!socket.destroyed) socket.destroy();
        });
        resolve(socket);
      });

      socket.once('error', (rawErr) => {
        clearTimeout(timer);
        const err = rawErr as Error & { socksReplyCode?: number };
        err.socksReplyCode = 0x05;
        reject(err);
      });
    });
  }
}
