import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Computes a stable, privacy-preserving `sha256:<hex>` machine identifier.
 * Raw host identifiers never leave the local machine.
 */
export function getMachineHash(storageRoot: string): string {
  const installIdPath = path.join(storageRoot, 'data', '.install-id');
  let installId: string;
  if (existsSync(installIdPath)) {
    installId = readFileSync(installIdPath, 'utf8').trim();
  } else {
    mkdirSync(path.dirname(installIdPath), { recursive: true });
    installId = randomUUID();
    writeFileSync(installIdPath, installId, { mode: 0o600 });
  }

  let osId = os.hostname();
  if (process.platform === 'linux' && existsSync('/etc/machine-id')) {
    osId = readFileSync('/etc/machine-id', 'utf8').trim();
  }

  const digest = createHash('sha256')
    .update(`${installId}:${process.platform}:${process.arch}:${osId}`)
    .digest('hex');

  return `sha256:${digest}`;
}
