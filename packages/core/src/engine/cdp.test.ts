import { afterEach, describe, expect, it, vi } from 'vitest';
import { CdpClient, listCdpTargets, normalizeLoopbackWsUrl } from './cdp.js';

describe('normalizeLoopbackWsUrl', () => {
  it('rewrites non-IPv4 loopback hosts to 127.0.0.1 while preserving port and path', () => {
    expect(normalizeLoopbackWsUrl('ws://localhost:9222/devtools/browser/abc')).toBe(
      'ws://127.0.0.1:9222/devtools/browser/abc',
    );
    expect(normalizeLoopbackWsUrl('ws://[::1]:9222/devtools/page/xyz')).toBe(
      'ws://127.0.0.1:9222/devtools/page/xyz',
    );
    expect(normalizeLoopbackWsUrl('ws://DESKTOP-ABC123:9222/devtools/browser/abc')).toBe(
      'ws://127.0.0.1:9222/devtools/browser/abc',
    );
  });

  it('leaves IPv4 loopback and non-ws URLs untouched', () => {
    expect(normalizeLoopbackWsUrl('ws://127.0.0.1:9222/devtools/browser/abc')).toBe(
      'ws://127.0.0.1:9222/devtools/browser/abc',
    );
    expect(normalizeLoopbackWsUrl('http://localhost:9222/json/version')).toBe(
      'http://localhost:9222/json/version',
    );
    expect(normalizeLoopbackWsUrl('not a url')).toBe('not a url');
  });
});

describe('listCdpTargets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to /json when /json/list returns a non-ok status', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('/json/list')) {
        return new Response('not found', { status: 404 });
      }
      return new Response(JSON.stringify([{ id: 't1', type: 'page', url: 'about:blank' }]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const targets = await listCdpTargets(9222);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.id).toBe('t1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails with a descriptive error when every endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    await expect(listCdpTargets(9222)).rejects.toThrow(/HTTP 500/);
  });
});

describe('CdpClient.connectToBrowser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers the DevToolsActivePort WS path over HTTP discovery', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new CdpClient();
    const connectSpy = vi.spyOn(client, 'connect').mockResolvedValue(undefined);

    await client.connectToBrowser(9222, 5_000, { wsPath: '/devtools/browser/uuid' });

    expect(connectSpy).toHaveBeenCalledWith('ws://127.0.0.1:9222/devtools/browser/uuid', 5_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to /json/version when the WS path connect fails', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/uuid' }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new CdpClient();
    const connectSpy = vi
      .spyOn(client, 'connect')
      .mockRejectedValueOnce(new Error('Timed out connecting to CDP WebSocket'))
      .mockResolvedValueOnce(undefined);

    await client.connectToBrowser(9222, 5_000, { wsPath: '/devtools/browser/uuid' });

    expect(connectSpy).toHaveBeenNthCalledWith(1, 'ws://127.0.0.1:9222/devtools/browser/uuid', 5_000);
    expect(connectSpy).toHaveBeenNthCalledWith(2, 'ws://localhost:9222/devtools/browser/uuid', 5_000);
    expect(fetchMock).toHaveBeenCalled();
  });
});
