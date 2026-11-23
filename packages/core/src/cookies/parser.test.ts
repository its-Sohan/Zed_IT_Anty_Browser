import { describe, expect, it } from 'vitest';
import { parseCookies } from './parser.js';

describe('Cookie parser', () => {
  it('parses Netscape cookies including #HttpOnly_ and reports malformed lines', () => {
    const netscape = [
      '# Netscape HTTP Cookie File',
      '.example.com\tTRUE\t/\tTRUE\t1893456000\tsid\tabc123',
      '#HttpOnly_.example.com\tTRUE\t/app\tFALSE\t1893456000\tauth\txyz',
      'bad-line-only-two-cols\tfoo',
    ].join('\n');

    const res = parseCookies(netscape);
    expect(res.format).toBe('netscape');
    expect(res.valid).toHaveLength(2);
    expect(res.valid[0]).toMatchObject({ domain: '.example.com', name: 'sid', secure: true, httpOnly: false });
    expect(res.valid[1]).toMatchObject({ domain: '.example.com', name: 'auth', path: '/app', httpOnly: true });
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]?.index).toBe(4);
  });

  it('parses JSON cookie arrays and validates SameSite=None + Secure', () => {
    const json = JSON.stringify([
      { name: 'c1', value: 'v1', domain: '.zedit.app', path: '/', secure: true, sameSite: 'no_restriction', expirationDate: 1893456000000 },
      { name: 'c2', value: 'v2', domain: '.zedit.app', secure: false, sameSite: 'None' },
      { name: '', value: 'v3', domain: '.zedit.app' },
    ]);

    const res = parseCookies(json);
    expect(res.format).toBe('json');
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0]?.sameSite).toBe('None');
    expect(res.valid[0]?.expires).toBe(1893456000);
    expect(res.skipped).toHaveLength(2);
  });
});
