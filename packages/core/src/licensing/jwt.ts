import { generateKeyPairSync, sign, verify } from 'node:crypto';

export interface LicenseJwtClaims {
  iss: string;
  sub: string;
  aud: string;
  key: string;
  plan: string;
  profiles: number;
  devices: number;
  features: string[];
  machine: string;
  iat: number;
  exp: number;
  ver: number;
}

function b64urlEncode(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function generateEs256KeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

export function signLicenseToken(claims: LicenseJwtClaims, privateKeyPem: string): string {
  const header = b64urlEncode(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
  const payload = b64urlEncode(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const sig = sign('sha256', Buffer.from(signingInput), {
    key: privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${b64urlEncode(sig)}`;
}

export function verifyLicenseToken(token: string, publicKeyPem: string): LicenseJwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed license JWT');
  }
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  const header = JSON.parse(b64urlDecode(headerB64).toString('utf8')) as { alg?: string };
  if (header.alg !== 'ES256') {
    throw new Error(`Unsupported JWT algorithm "${header.alg}"`);
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = b64urlDecode(sigB64);
  const ok = verify(
    'sha256',
    Buffer.from(signingInput),
    { key: publicKeyPem, dsaEncoding: 'ieee-p1363' },
    signature,
  );
  if (!ok) {
    throw new Error('Invalid license token signature');
  }

  return JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as LicenseJwtClaims;
}
