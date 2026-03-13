const NPM_BULK_DL = 'https://api.npmjs.org/downloads/point/last-week';
const NPM_SEARCH = 'https://registry.npmjs.org/-/v1/search';

export interface TyposquatResult {
  suspect: string;
  likelyTarget: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
  targetDownloads: number;
  suspectDownloads: number;
}

export async function detectTyposquatBatch(names: string[]): Promise<TyposquatResult[]> {
  if (names.length === 0) return [];

  const dlMap = await fetchBulkDownloads(names);

  const searchResults = await Promise.all(
    names.map((n) => searchSimilar(stripScope(n)).catch(() => [] as SearchHit[])),
  );

  const candidateNames = new Set<string>();
  for (const hits of searchResults) {
    for (const h of hits) candidateNames.add(h.name);
  }
  const extraNames = [...candidateNames].filter((n) => !dlMap.has(n));
  if (extraNames.length > 0) {
    const extra = await fetchBulkDownloads(extraNames);
    for (const [k, v] of extra) dlMap.set(k, v);
  }

  return names.map((name, idx) => {
    const bare = stripScope(name);
    const suspectDl = dlMap.get(name) || 0;
    const hits = searchResults[idx] || [];
    let best: TyposquatResult = {
      suspect: name, likelyTarget: null, confidence: 'none',
      reason: '', targetDownloads: 0, suspectDownloads: suspectDl,
    };

    for (const h of hits) {
      if (h.name === name || h.name === bare) continue;
      const cBare = stripScope(h.name);
      const d = levenshtein(bare, cBare);
      if (d === 0 || d > 2) continue;
      if (d === 2 && bare.length < 5) continue;

      const cDl = dlMap.get(h.name) || 0;
      const ratio = cDl / Math.max(suspectDl, 1);

      if (d === 1 && ratio >= 100) {
        return {
          suspect: name, likelyTarget: h.name, confidence: 'high' as const,
          reason: `${h.name} has ${fmt(cDl)} weekly downloads vs ${fmt(suspectDl)}`,
          targetDownloads: cDl, suspectDownloads: suspectDl,
        };
      }
      if (d <= 2 && ratio >= 500 && rankHigher(best, 'medium')) {
        best = {
          suspect: name, likelyTarget: h.name, confidence: 'medium',
          reason: `similar to ${h.name} (${fmt(cDl)} weekly downloads)`,
          targetDownloads: cDl, suspectDownloads: suspectDl,
        };
      }
      if (d === 1 && ratio >= 10 && rankHigher(best, 'low')) {
        best = {
          suspect: name, likelyTarget: h.name, confidence: 'low',
          reason: `name close to ${h.name}`,
          targetDownloads: cDl, suspectDownloads: suspectDl,
        };
      }
      if (detectSeparatorTrick(bare, cBare) && ratio >= 50 && rankHigher(best, 'medium')) {
        best = {
          suspect: name, likelyTarget: h.name, confidence: 'medium',
          reason: `separator variation of ${h.name} (${fmt(cDl)} downloads)`,
          targetDownloads: cDl, suspectDownloads: suspectDl,
        };
      }
    }
    return best;
  });
}

interface SearchHit { name: string }

async function searchSimilar(name: string): Promise<SearchHit[]> {
  const res = await fetch(`${NPM_SEARCH}?text=${encodeURIComponent(name)}&size=10`);
  if (!res.ok) return [];
  const data = await res.json() as {
    objects: Array<{ package: { name: string } }>;
  };
  return data.objects.map((o) => ({ name: o.package.name }));
}

async function fetchBulkDownloads(names: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const scoped: string[] = [];
  const unscoped: string[] = [];
  for (const n of names) (n.startsWith('@') ? scoped : unscoped).push(n);

  if (unscoped.length > 0) {
    const chunks = chunkArray(unscoped, 128);
    const fetches = await Promise.allSettled(
      chunks.map(async (chunk) => {
        const res = await fetch(`${NPM_BULK_DL}/${chunk.join(',')}`);
        if (!res.ok) return;
        const data = await res.json() as Record<string, { downloads: number } | null>;
        for (const [pkg, info] of Object.entries(data)) {
          if (info?.downloads) map.set(pkg, info.downloads);
        }
      }),
    );
  }

  const scopedFetches = await Promise.allSettled(
    scoped.map(async (n) => {
      const res = await fetch(`${NPM_BULK_DL}/${encodeURIComponent(n)}`);
      if (!res.ok) return;
      const data = await res.json() as { downloads: number };
      if (data.downloads) map.set(n, data.downloads);
    }),
  );

  return map;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

function stripScope(name: string): string {
  return name.startsWith('@') ? name.split('/').pop() || name : name;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function detectSeparatorTrick(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/[-_.]/g, '');
  return norm(a) === norm(b) && a !== b;
}

const RANK = { none: 0, low: 1, medium: 2, high: 3 } as const;
function rankHigher(current: TyposquatResult, level: TyposquatResult['confidence']): boolean {
  return RANK[level] > RANK[current.confidence];
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
