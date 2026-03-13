const OSV_API = 'https://api.osv.dev/v1/query';

export interface OSVVulnerability {
  id: string;
  summary: string;
  details: string;
  severity: Array<{ type: string; score: string }>;
  affected: Array<{
    ranges: Array<{ events: Array<{ introduced?: string; fixed?: string }> }>;
  }>;
  references: Array<{ type: string; url: string }>;
  database_specific?: { severity?: string; [key: string]: unknown };
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
    return data.vulns || [];
  } catch {
    return [];
  }
}

export function getOSVSeverity(vuln: OSVVulnerability): string {
  const dbSev = vuln.database_specific?.severity;
  if (typeof dbSev === 'string' && dbSev.length > 0) {
    const norm = dbSev.toUpperCase();
    if (norm === 'CRITICAL') return 'CRITICAL';
    if (norm === 'HIGH') return 'HIGH';
    if (norm === 'MODERATE' || norm === 'MEDIUM') return 'MEDIUM';
    if (norm === 'LOW') return 'LOW';
  }

  if (vuln.severity?.length > 0) {
    const cvss = vuln.severity.find((s) => s.type === 'CVSS_V3' || s.type === 'CVSS_V4');
    if (cvss?.score) {
      const numericScore = computeCVSSv3BaseScore(cvss.score);
      if (numericScore !== null) {
        if (numericScore >= 9.0) return 'CRITICAL';
        if (numericScore >= 7.0) return 'HIGH';
        if (numericScore >= 4.0) return 'MEDIUM';
        return 'LOW';
      }
    }
  }

  return 'UNKNOWN';
}

const CVSS_V3_METRICS: Record<string, Record<string, number>> = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.20 },
  AC: { L: 0.77, H: 0.44 },
  PR_U: { N: 0.85, L: 0.62, H: 0.27 },
  PR_C: { N: 0.85, L: 0.68, H: 0.50 },
  UI: { N: 0.85, R: 0.62 },
  C: { H: 0.56, L: 0.22, N: 0 },
  I: { H: 0.56, L: 0.22, N: 0 },
  A: { H: 0.56, L: 0.22, N: 0 },
};

function computeCVSSv3BaseScore(vector: string): number | null {
  const parts = vector.split('/');
  const metrics: Record<string, string> = {};
  for (const part of parts) {
    const [key, val] = part.split(':');
    if (key && val) metrics[key] = val;
  }

  const scope = metrics['S'];
  if (!scope || !metrics['AV'] || !metrics['AC'] || !metrics['PR'] || !metrics['UI']) return null;
  if (!metrics['C'] || !metrics['I'] || !metrics['A']) return null;

  const av = CVSS_V3_METRICS.AV[metrics['AV']];
  const ac = CVSS_V3_METRICS.AC[metrics['AC']];
  const prTable = scope === 'C' ? CVSS_V3_METRICS.PR_C : CVSS_V3_METRICS.PR_U;
  const pr = prTable[metrics['PR']];
  const ui = CVSS_V3_METRICS.UI[metrics['UI']];
  const c = CVSS_V3_METRICS.C[metrics['C']];
  const i = CVSS_V3_METRICS.I[metrics['I']];
  const a = CVSS_V3_METRICS.A[metrics['A']];

  if ([av, ac, pr, ui, c, i, a].some((v) => v === undefined)) return null;

  const iscBase = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = scope === 'U'
    ? 6.42 * iscBase
    : 7.52 * (iscBase - 0.029) - 3.25 * Math.pow(Math.max(iscBase - 0.02, 0), 15);

  if (impact <= 0) return 0;

  const exploitability = 8.22 * av * ac * pr * ui;
  const raw = scope === 'U'
    ? Math.min(impact + exploitability, 10)
    : Math.min(1.08 * (impact + exploitability), 10);

  return Math.ceil(raw * 10) / 10;
}

export function getFixedVersion(vuln: OSVVulnerability, forVersion?: string): string | null {
  const majorMinor = forVersion ? getMajorMinor(forVersion) : null;
  let bestMatch: string | null = null;
  let anyFix: string | null = null;

  for (const aff of vuln.affected || []) {
    for (const range of aff.ranges || []) {
      let introduced: string | null = null;
      let fixed: string | null = null;
      for (const event of range.events || []) {
        if (event.introduced) introduced = event.introduced;
        if (event.fixed) fixed = event.fixed;
      }
      if (!fixed) continue;
      if (!anyFix) anyFix = fixed;

      if (majorMinor && introduced) {
        const introMM = getMajorMinor(introduced);
        if (introMM === majorMinor) {
          bestMatch = fixed;
        }
      }
    }
  }

  return bestMatch || anyFix;
}

function getMajorMinor(version: string): string {
  const parts = version.replace(/^v/, '').split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
}
