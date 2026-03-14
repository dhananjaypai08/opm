import { getVersions, getSafestVersion, getAuthorByENS } from './contract';
import { resolveAddress } from './ens';
import { queryOSV, getFixedVersion, type OSVVulnerability } from './osv';

export interface ResolvedVersion {
  version: string;
  source: 'explicit' | 'latest' | 'ens' | 'auto-bumped';
  ensName?: string;
  authorAddress?: string;
  reason?: string;
  originalVersion?: string;
}

export function isENSVersion(version: string): boolean {
  return version.endsWith('.eth');
}

export async function resolveVersion(
  name: string,
  version: string,
  onStatus?: (msg: string) => void,
): Promise<ResolvedVersion> {
  const log = onStatus || (() => {});

  if (isENSVersion(version)) {
    return resolveENSVersion(name, version, log);
  }

  if (version && version !== 'latest') {
    return { version, source: 'explicit' };
  }

  try {
    const versions = await getVersions(name);
    if (versions.length > 0) {
      return { version: versions[versions.length - 1], source: 'latest' };
    }
  } catch { /* no versions on-chain */ }

  const npmVersion = await resolveNpmLatest(name);
  return { version: npmVersion, source: 'latest' };
}

async function resolveENSVersion(
  packageName: string,
  ensName: string,
  log: (msg: string) => void,
): Promise<ResolvedVersion> {
  log(`Resolving ENS: ${ensName}`);
  const authorAddr = await resolveAddress(ensName);
  if (!authorAddr) {
    throw new Error(`Cannot resolve ENS name: ${ensName}`);
  }
  log(`Address: ${authorAddr.slice(0, 6)}...${authorAddr.slice(-4)}`);

  let authorOnChain = false;
  try {
    const profile = await getAuthorByENS(ensName);
    authorOnChain = profile.addr !== '0x0000000000000000000000000000000000000000';
  } catch { /* not registered */ }

  if (!authorOnChain) {
    throw new Error(`Author ${ensName} (${authorAddr.slice(0, 10)}...) is not registered on-chain`);
  }
  log(`Author verified on-chain ✓`);

  let safestVersion: string | null = null;
  try {
    safestVersion = await getSafestVersion(packageName);
  } catch { /* no on-chain versions */ }

  if (safestVersion) {
    log(`Safest on-chain version: ${safestVersion}`);
    return {
      version: safestVersion,
      source: 'ens',
      ensName,
      authorAddress: authorAddr,
      reason: `Safest on-chain version, author ${ensName} verified`,
    };
  }

  log(`No on-chain scores, resolving latest from npm`);
  const npmVersion = await resolveNpmLatest(packageName);
  log(`Latest npm version: ${npmVersion}`);
  return {
    version: npmVersion,
    source: 'ens',
    ensName,
    authorAddress: authorAddr,
    reason: `Author ${ensName} verified, latest npm version (no on-chain scores)`,
  };
}

export async function findSafeVersion(
  name: string,
  unsafeVersion: string,
  cves: OSVVulnerability[],
): Promise<ResolvedVersion | null> {
  let safeVer: string | null = null;

  try {
    safeVer = await getSafestVersion(name);
  } catch { /* no on-chain data */ }

  if (safeVer && safeVer !== unsafeVersion) {
    const safeCves = await queryOSV(name, safeVer).catch(() => []);
    const hasCritical = safeCves.some((c) => {
      const sev = c.database_specific?.severity || '';
      return sev === 'CRITICAL' || sev === 'HIGH';
    });
    if (!hasCritical) {
      return {
        version: safeVer,
        source: 'auto-bumped',
        originalVersion: unsafeVersion,
        reason: `On-chain safest version (original ${unsafeVersion} has vulnerabilities)`,
      };
    }
  }

  let bestFix: string | null = null;
  for (const cve of cves) {
    const fix = getFixedVersion(cve, unsafeVersion);
    if (fix && (!bestFix || compareSemver(fix, bestFix) > 0)) {
      bestFix = fix;
    }
  }

  if (bestFix) {
    return {
      version: bestFix,
      source: 'auto-bumped',
      originalVersion: unsafeVersion,
      reason: `Upgraded from ${unsafeVersion} to fix ${cves.length} CVE(s)`,
    };
  }

  return null;
}

async function resolveNpmLatest(name: string): Promise<string> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
    if (res.ok) {
      const data = await res.json() as { version?: string };
      if (data.version) return data.version;
    }
  } catch { /* npm registry unreachable */ }
  return 'latest';
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
