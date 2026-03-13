import type { ScanReport } from '@opm/core';
import { getEnvOrThrow } from '@opm/core';

export async function uploadReportToFileverse(report: ScanReport): Promise<string> {
  try {
    const { Agent } = await import('@fileverse/agents');
    const { privateKeyToAccount } = await import('viem/accounts');

    const privateKey = getEnvOrThrow('AGENT_PRIVATE_KEY') as `0x${string}`;
    const pimlicoKey = getEnvOrThrow('PIMLICO_API_KEY');
    const pinataJwt = getEnvOrThrow('PINATA_JWT');
    const pinataGateway = getEnvOrThrow('PINATA_GATEWAY_URL');

    const account = privateKeyToAccount(privateKey);

    const agent = new Agent({
      chain: 'sepolia',
      viemAccount: account,
      pimlicoAPIKey: pimlicoKey,
      storageProvider: {
        pinataJWT: pinataJwt,
        pinataGatewayURL: pinataGateway,
      },
    });

    await agent.setupStorage(`opm-${report.package}`);

    const content = JSON.stringify(report, null, 2);
    const file = await agent.create(content);

    return file.url || file.id || 'fileverse://uploaded';
  } catch (err) {
    console.error('Fileverse upload failed, falling back to local:', err);
    return `local://report-${report.package}-${report.version}`;
  }
}
