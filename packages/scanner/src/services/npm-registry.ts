import { NPM_REGISTRY_URL, SCANNABLE_EXTENSIONS, MAX_FILE_SIZE_BYTES, MAX_TOTAL_CODE_CHARS, VERSION_LOOKBACK } from '@opm/core';
import type { PackageMetadata, VersionHistoryEntry, SourceFile } from '@opm/core';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import * as os from 'os';

export interface NpmPackageData {
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
  const res = await fetch(`${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}`);
  if (!res.ok) throw new Error(`npm registry ${res.status} for ${packageName}`);
  return res.json() as Promise<NpmPackageData>;
}

export function buildLocalPackageData(pkgJsonPath: string): NpmPackageData {
  const raw = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  const version = raw.version || '0.0.0';
  return {
    name: raw.name || 'unknown',
    'dist-tags': { latest: version },
    time: { [version]: new Date().toISOString() },
    versions: {
      [version]: {
        version,
        description: raw.description || '',
        author: raw.author || '',
        license: raw.license || '',
        dependencies: raw.dependencies || {},
        scripts: raw.scripts || {},
        dist: { tarball: '', fileCount: 0, unpackedSize: 0 },
      },
    },
  };
}

export function extractMetadata(data: NpmPackageData, version: string): PackageMetadata {
  const v = data.versions[version];
  if (!v) throw new Error(`Version ${version} not found for ${data.name}`);
  const authorStr = typeof v.author === 'string' ? v.author : v.author?.name || '';
  return {
    name: data.name,
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

function extractFilesFromTarball(tarballPath: string): SourceFile[] {
  const tmpDir = path.join(os.tmpdir(), `opm-extract-${randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`tar -xzf "${tarballPath}" -C "${tmpDir}"`, { stdio: 'pipe' });
    return walkAndCollect(tmpDir, tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function walkAndCollect(dir: string, root: string): SourceFile[] {
  const files: SourceFile[] = [];
  let totalChars = 0;

  function walk(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (totalChars >= MAX_TOTAL_CODE_CHARS) return;
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(fullPath);
      } else if (SCANNABLE_EXTENSIONS.includes(path.extname(entry.name))) {
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE_BYTES) continue;

        const content = fs.readFileSync(fullPath, 'utf-8');
        if (totalChars + content.length > MAX_TOTAL_CODE_CHARS) continue;
        totalChars += content.length;

        const relPath = path.relative(root, fullPath).replace(/^package\//, '');
        files.push({ path: relPath, size: content.length, content });
      }
    }
  }

  walk(dir);
  return files;
}

export async function fetchSourceFiles(_packageName: string, _version: string, tarballUrl: string): Promise<SourceFile[]> {
  const res = await fetch(tarballUrl);
  if (!res.ok) throw new Error(`Failed to fetch tarball: ${res.status}`);

  const tmpFile = path.join(os.tmpdir(), `opm-dl-${randomUUID()}.tgz`);
  try {
    fs.writeFileSync(tmpFile, Buffer.from(await res.arrayBuffer()));
    return extractFilesFromTarball(tmpFile);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

export async function extractLocalSourceFiles(tarballPath: string): Promise<SourceFile[]> {
  return extractFilesFromTarball(tarballPath);
}
