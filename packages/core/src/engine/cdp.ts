import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface DevToolsActivePortInfo {
  port: number;
  wsPath: string;
}

interface CdpTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls `<userDataDir>/DevToolsActivePort` until Chromium writes its ephemeral CDP port and path.
 */
export async function waitForDevToolsActivePort(
  userDataDir: string,
  timeoutMs = 15_000,
): Promise<DevToolsActivePortInfo> {
  const filePath = path.join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const content = await readFile(filePath, 'utf8');
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length >= 2) {
        const port = Number.parseInt(lines[0], 10);
        if (Number.isInteger(port) && port > 0 && port <= 65535) {
          return { port, wsPath: lines[1] };
        }
      }
    } catch {
      // File does not exist yet or is still being flushed.
    }
    await sleep(50);
  }

  throw new Error(`Timed out waiting for DevToolsActivePort in ${userDataDir} after ${timeoutMs}ms`);
}

/**
 * Lightweight Chrome DevTools Protocol WebSocket client using built-in WHATWG WebSocket.
 */
export class CdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private eventListeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();

  async connect(wsUrl: string, timeoutMs = 10_000): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            ws.close();
          } catch {
            // ignore
          }
          reject(new Error(`Timed out connecting to CDP WebSocket: ${wsUrl}`));
        }
      }, timeoutMs);

      ws.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.ws = ws;
        resolve();
      });

      ws.addEventListener('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to connect to CDP WebSocket: ${wsUrl}`));
      });

      ws.addEventListener('message', (event) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        this.handleMessage(raw);
      });

      ws.addEventListener('close', () => {
        for (const req of this.pending.values()) {
          clearTimeout(req.timer);
          req.reject(new Error('CDP WebSocket closed before response'));
        }
        this.pending.clear();
      });
    });
  }

  /**
   * Connects to the first available `page` target on the given loopback CDP port.
   */
  async connectToFirstPage(port: number, timeoutMs = 10_000): Promise<CdpTarget> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown = null;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (res.ok) {
          const targets = (await res.json()) as CdpTarget[];
          const pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
          if (pageTarget?.webSocketDebuggerUrl) {
            await this.connect(pageTarget.webSocketDebuggerUrl, timeoutMs);
            return pageTarget;
          }
        }
      } catch (err) {
        lastError = err;
      }
      await sleep(75);
    }

    throw new Error(
      `Failed to find a CDP page target on 127.0.0.1:${port}: ${
        lastError instanceof Error ? lastError.message : 'no page target ready'
      }`,
    );
  }

  private handleMessage(raw: string): void {
    let parsed: {
      id?: number;
      result?: unknown;
      error?: { code?: number; message?: string };
      method?: string;
      params?: Record<string, unknown>;
    };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return;
    }

    if (typeof parsed.id === 'number') {
      const pending = this.pending.get(parsed.id);
      if (!pending) return;
      this.pending.delete(parsed.id);
      clearTimeout(pending.timer);
      if (parsed.error) {
        pending.reject(
          new Error(`CDP error (${parsed.error.code ?? 'unknown'}): ${parsed.error.message ?? 'unknown'}`),
        );
      } else {
        pending.resolve(parsed.result);
      }
      return;
    }

    if (parsed.method) {
      const listeners = this.eventListeners.get(parsed.method);
      if (listeners) {
        for (const cb of listeners) {
          cb(parsed.params ?? {});
        }
      }
    }
  }

  on(event: string, listener: (params: Record<string, unknown>) => void): () => void {
    let set = this.eventListeners.get(event);
    if (!set) {
      set = new Set();
      this.eventListeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 15_000,
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP socket is not open (method=${method})`));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
      });

      try {
        this.ws!.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async navigateAndWait(url: string, timeoutMs = 15_000): Promise<void> {
    await this.send('Page.enable', {}, timeoutMs);

    let loadFired = false;
    const off = this.on('Page.loadEventFired', () => {
      loadFired = true;
    });

    try {
      const navResult = await this.send<{ frameId: string; errorText?: string }>(
        'Page.navigate',
        { url },
        timeoutMs,
      );
      if (navResult.errorText) {
        throw new Error(`Navigation to ${url} failed: ${navResult.errorText}`);
      }

      const deadline = Date.now() + timeoutMs;
      while (!loadFired && Date.now() < deadline) {
        try {
          const state = await this.evaluate<string>('document.readyState', 3_000);
          if (state === 'complete') {
            break;
          }
        } catch {
          // Context may be resetting during navigation.
        }
        await sleep(50);
      }
    } finally {
      off();
    }
  }

  async evaluate<T = unknown>(expression: string, timeoutMs = 15_000): Promise<T> {
    const res = await this.send<{
      result?: { type: string; value?: T; description?: string };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      timeoutMs,
    );

    if (res.exceptionDetails) {
      const msg =
        res.exceptionDetails.exception?.description ??
        res.exceptionDetails.text ??
        'Runtime.evaluate exception';
      throw new Error(msg);
    }

    return res.result?.value as T;
  }

  async closeBrowser(): Promise<void> {
    try {
      await this.send('Browser.close', {}, 3_000);
    } catch {
      // Browser may close the socket immediately upon Browser.close.
    }
  }

  disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.eventListeners.clear();
  }
}
