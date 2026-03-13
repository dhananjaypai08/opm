import type { ScanReport } from '@opm/core';
import { getEnvOrDefault, safeJsonParse, FILEVERSE_DEFAULT_URL } from '@opm/core';

export async function fetchReportFromFileverse(reportURI: string): Promise<ScanReport | null> {
  if (!reportURI || reportURI.startsWith('local://')) return null;

  const apiKey = process.env.FILEVERSE_API_KEY;
  if (!apiKey) return null;

  const apiUrl = getEnvOrDefault('FILEVERSE_API_URL', FILEVERSE_DEFAULT_URL);
  const ddocId = extractDdocId(reportURI);
  if (!ddocId) return null;

  try {
    const res = await fetch(`${apiUrl}/api/ddocs/${ddocId}?apiKey=${encodeURIComponent(apiKey)}`);
    if (res.ok) {
      const doc = await res.json() as { content: string };
      return safeJsonParse<ScanReport>(doc.content);
    }
  } catch { /* local API not running */ }

  return null;
}

function extractDdocId(link: string): string | null {
  try {
    const url = new URL(link);
    const parts = url.pathname.split('/');
    const dIdx = parts.indexOf('d');
    if (dIdx >= 0 && parts[dIdx + 1]) return parts[dIdx + 1];
    const pendingIdx = parts.indexOf('pending');
    if (pendingIdx >= 0 && parts[pendingIdx + 1]) return parts[pendingIdx + 1];
  } catch { /* not a URL */ }
  return null;
}
