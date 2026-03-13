import { NPM_REGISTRY_URL, SCANNABLE_EXTENSIONS, MAX_FILE_SIZE_BYTES, MAX_TOTAL_CODE_CHARS, VERSION_LOOKBACK } from '@opm/core';
import type { PackageMetadata, VersionHistoryEntry, SourceFile } from '@opm/core';
import * as tar from 'tar';
import { Readable } from 'stream';
import { createGunzip } from 'zlib';
import * as path from 'path';

interface NpmPackageData {
  name: string;
  versions: Record<string, {
    version: string;
    description?: string;
    author?: string | { name?: string };
    license?: string;
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    dist: { tarball: string; fileCount?: number; unpackedSize?: number };
    _npmUser?: { name: string };
  }>;
  time: Record<string, string>;
  'dist-tags': Record<string, string>;
}

export async function fetchPackageData(packageName: string): Promise<NpmPackageData> {
  const res = await fetch(`${NPM_REGISTRY_URL}/${packageName}`);
  if (!res.ok) throw new Error(`npm registry ${res.status} for ${packageName}`);
  return res.json() as Promise<NpmPackageData>;
}

export function extractMetadata(data: NpmPackageData, version: string): PackageMetadata {
  const v = data.versions[version];
  if (!v) throw new Error(`Version ${version} not found for ${data.name}`);
  const authorStr = typeof v.author === 'string' ? v.author : v.author?.name || '';
  return {
    name: v.version ? data.name : data.name,
    version: v.version,
    description: v.description || '',
    author: authorStr,
    license: v.license || '',
    dependencies: v.dependencies || {},
    scripts: v.scripts || {},
  };
}

export function buildVersionHistory(data: NpmPackageData, currentVersion: string): VersionHistoryEntry[] {
  const allVersions = Object.keys(data.versions);
  const currentIdx = allVersions.indexOf(currentVersion);
  if (currentIdx === -1) return [];

  const start = Math.max(0, currentIdx - VERSION_LOOKBACK);
  const slice = allVersions.slice(start, currentIdx + 1);

  return slice.map((ver, i) => {
    const v = data.versions[ver];
    const prev = i > 0 ? data.versions[slice[i - 1]] : null;
    const prevDeps = prev?.dependencies || {};
    const curDeps = v.dependencies || {};
    const depsChanged = Object.keys(curDeps)
      .filter((d) => prevDeps[d] !== curDeps[d])
      .join(', ') || 'none';

    const prevSize = prev?.dist?.unpackedSize || 0;
    const curSize = v.dist?.unpackedSize || 0;
    const sizeDelta = prev ? `${curSize - prevSize} bytes` : 'N/A';

    const prevMaintainer = prev?._npmUser?.name || '';
    const curMaintainer = v._npmUser?.name || '';

    return {
      version: ver,
      published: data.time[ver] || 'unknown',
      depsChanged,
      filesChanged: prev ? `~${Math.abs((v.dist?.fileCount || 0) - (prev.dist?.fileCount || 0))} files` : 'N/A',
      sizeDelta,
      newMaintainer: prev ? curMaintainer !== prevMaintainer : false,
    };
  });
}

export async function fetchSourceFiles(packageName: string, version: string, tarballUrl: string): Promise<SourceFile[]> {
  const res = await fetch(tarballUrl);
  if (!res.ok) throw new Error(`Failed to fetch tarball: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const files: SourceFile[] = [];
  let totalChars = 0;

  return new Promise((resolve, reject) => {
    const extract = new tar.Parse({
      filter: (p: string) => {
        const ext = path.extname(p);
        return SCANNABLE_EXTENSIONS.includes(ext);
      },
      onentry: (entry: tar.ReadEntry) => {
        const chunks: Buffer[] = [];
        entry.on('data', (chunk: Buffer) => chunks.push(chunk));
        entry.on('end', () => {
          const content = Buffer.concat(chunks).toString('utf-8');
          if (content.length > MAX_FILE_SIZE_BYTES) return;
          if (totalChars + content.length > MAX_TOTAL_CODE_CHARS) return;
          totalChars += content.length;

          const filePath = entry.path.replace(/^package\//, '');
          files.push({ path: filePath, size: content.length, content });
        });
      },
    });

    const stream = Readable.from(buffer);
    stream.pipe(createGunzip()).pipe(extract);
    extract.on('end', () => resolve(files));
    extract.on('error', reject);
  });
}
