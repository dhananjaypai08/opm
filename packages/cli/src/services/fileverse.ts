import type { ScanReport } from '@opm/core';
import { safeJsonParse } from '@opm/core';

export async function fetchReportFromFileverse(reportURI: string): Promise<ScanReport | null> {
  if (!reportURI || reportURI.startsWith('local://')) return null;

  try {
    const res = await fetch(reportURI);
    if (!res.ok) return null;
    const text = await res.text();
    return safeJsonParse<ScanReport>(text);
  } catch {
    return null;
  }
}
