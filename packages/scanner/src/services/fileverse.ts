import type { ScanReport, CheckReport } from '@opm/core';
import { getEnvOrDefault, FILEVERSE_DEFAULT_URL } from '@opm/core';
import { formatReportAsMarkdown, formatCheckReportAsMarkdown } from './report-formatter';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60_000;

function getApiConfig() {
  const apiUrl = getEnvOrDefault('FILEVERSE_API_URL', FILEVERSE_DEFAULT_URL);
  const apiKey = process.env.FILEVERSE_API_KEY;
  if (!apiKey) throw new Error('FILEVERSE_API_KEY is required (generate at ddocs.new → Settings → Developer Mode)');
  return { apiUrl, apiKey };
}

export async function uploadReportToFileverse(report: ScanReport): Promise<string> {
  const { apiUrl, apiKey } = getApiConfig();

  const title = `OPM Security Report: ${report.package}@${report.version}`;
  const content = formatReportAsMarkdown(report);

  const res = await fetch(`${apiUrl}/api/ddocs?apiKey=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fileverse create failed (${res.status}): ${body}`);
  }

  const { data } = await res.json() as { data: { ddocId: string; syncStatus: string; link?: string } };
  const ddocId = data.ddocId;

  if (data.syncStatus === 'synced' && data.link) return data.link;

  const link = await pollForSync(apiUrl, apiKey, ddocId);
  return link;
}

async function pollForSync(apiUrl: string, apiKey: string, ddocId: string): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${apiUrl}/api/ddocs/${ddocId}?apiKey=${encodeURIComponent(apiKey)}`);
    if (!res.ok) continue;

    const doc = await res.json() as { syncStatus: string; link?: string };
    if (doc.syncStatus === 'synced' && doc.link) return doc.link;
    if (doc.syncStatus === 'failed') throw new Error('Fileverse blockchain sync failed');
  }

  return `https://ddocs.new/pending/${ddocId}`;
}

export async function uploadCheckReportToFileverse(report: CheckReport): Promise<string> {
  const { apiUrl, apiKey } = getApiConfig();
  const title = `OPM Check Report: ${report.project} (${report.totalDeps} deps)`;
  const content = formatCheckReportAsMarkdown(report);

  const res = await fetch(`${apiUrl}/api/ddocs?apiKey=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fileverse create failed (${res.status}): ${body}`);
  }

  const { data } = await res.json() as { data: { ddocId: string; syncStatus: string; link?: string } };
  if (data.syncStatus === 'synced' && data.link) return data.link;
  return pollForSync(apiUrl, apiKey, data.ddocId);
}

export async function fetchReportFromFileverse(reportURI: string): Promise<ScanReport | null> {
  if (!reportURI || reportURI.startsWith('local://')) return null;

  const apiKey = process.env.FILEVERSE_API_KEY;
  const apiUrl = getEnvOrDefault('FILEVERSE_API_URL', FILEVERSE_DEFAULT_URL);

  const ddocId = extractDdocId(reportURI);
  if (ddocId && apiKey) {
    try {
      const res = await fetch(`${apiUrl}/api/ddocs/${ddocId}?apiKey=${encodeURIComponent(apiKey)}`);
      if (res.ok) {
        const doc = await res.json() as { content: string };
        return JSON.parse(doc.content) as ScanReport;
      }
    } catch { /* fall through */ }
  }

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
