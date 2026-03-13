import { getVersions } from './contract';

export async function resolveVersion(name: string, version: string): Promise<string> {
  if (version && version !== 'latest') return version;
  try {
    const versions = await getVersions(name);
    if (versions.length > 0) return versions[versions.length - 1];
  } catch { /* no versions on-chain */ }
  return version;
}
