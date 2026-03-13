const OSV_API = 'https://api.osv.dev/v1/query';

export interface OSVAffectedRange {
  type: string;
  events: Array<{ introduced?: string; fixed?: string }>;
}

export interface OSVAffected {
  ranges?: OSVAffectedRange[];
}

export interface OSVVulnerability {
  id: string;
  summary: string;
  details: string;
  severity: Array<{ type: string; score: string }>;
  references: Array<{ type: string; url: string }>;
  database_specific?: { severity?: string; [key: string]: unknown };
  affected?: OSVAffected[];
}

function parseVersion(v: string): number[] {
  return v.replace(/^v/, '').split('.').map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });
}

function compareVersions(v1: string, v2: string): number {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const n1 = p1[i] ?? 0;
    const n2 = p2[i] ?? 0;
    if (n1 !== n2) return n1 - n2;
  }
  return 0;
}

function isFixedInVersionOrBefore(vuln: OSVVulnerability, currentVersion: string): boolean {
  const affected = vuln.affected;
  if (!affected || affected.length === 0) return false;

  for (const entry of affected) {
    const ranges = entry.ranges;
    if (!ranges || ranges.length === 0) continue;

    for (const range of ranges) {
      const events = range.events;
      if (!events) continue;

      for (const event of events) {
        if (event.fixed) {
          const fixedVersion = event.fixed;
          if (compareVersions(currentVersion, fixedVersion) >= 0) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export async function queryOSV(packageName: string, version: string): Promise<OSVVulnerability[]> {
  if (!version || version === 'latest') return [];

  try {
    const res = await fetch(OSV_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: packageName, ecosystem: 'npm' },
        version,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { vulns?: OSVVulnerability[] };
    const vulns = data.vulns || [];
    
    const unfixedVulns = vulns.filter((v) => !isFixedInVersionOrBefore(v, version));
    return unfixedVulns;
  } catch {
    return [];
  }
}
