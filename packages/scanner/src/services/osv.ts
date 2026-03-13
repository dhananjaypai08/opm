const OSV_API = 'https://api.osv.dev/v1/query';

export interface OSVVulnerability {
  id: string;
  summary: string;
  details: string;
  severity: Array<{ type: string; score: string }>;
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
