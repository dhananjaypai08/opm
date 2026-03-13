import { CHAINPATROL_API_URL, getEnvOrThrow } from '@opm/core';
import type { ChainPatrolResult } from '@opm/core';

export async function checkPackageWithChainPatrol(packageName: string): Promise<ChainPatrolResult> {
  const apiKey = getEnvOrThrow('CHAINPATROL_API_KEY');

  const res = await fetch(`${CHAINPATROL_API_URL}/asset/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ content: `npm:${packageName}` }),
  });

  if (!res.ok) {
    return { status: 'UNKNOWN', source: 'error' };
  }

  const data = await res.json() as { status: string; source: string };
  return {
    status: (data.status as ChainPatrolResult['status']) || 'UNKNOWN',
    source: data.source || 'chainpatrol',
  };
}
