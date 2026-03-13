import type { ScanReport, AgentEntry } from '@opm/core';
import { classifyRisk, getModelWeight, calculateWeightedScore } from '@opm/core';
import { runAgent, type LocalScanContext } from '../agents/base-agent';
import { getAgentConfigs } from '../agents/agent-configs';
import { setReportURIOnChain } from '../services/contract-writer';
import { uploadReportToFileverse } from '../services/fileverse';

export interface ScanJobResult {
  report: ScanReport;
  reportURI: string;
}

const activeJobs = new Map<string, Promise<ScanJobResult>>();

export async function enqueueScan(
  packageName: string,
  version: string,
  onStatus?: (msg: string) => void,
  local?: LocalScanContext,
): Promise<ScanJobResult> {
  const key = `${packageName}@${version}`;
  const existing = activeJobs.get(key);
  if (existing) return existing;

  const promise = executeScan(packageName, version, onStatus, local);
  activeJobs.set(key, promise);

  try {
    return await promise;
  } finally {
    activeJobs.delete(key);
  }
}

async function executeScan(
  packageName: string,
  version: string,
  onStatus?: (msg: string) => void,
  local?: LocalScanContext,
): Promise<ScanJobResult> {
  const log = onStatus || console.log;
  const configs = getAgentConfigs();

  log('Starting parallel agent scans...');
  const results = await Promise.allSettled(
    configs.map((cfg) => runAgent(cfg, packageName, version, onStatus, local)),
  );

  const agents: AgentEntry[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      agents.push(r.value);
    } else {
      log(`Agent failed: ${r.reason}`);
    }
  }

  if (agents.length === 0) throw new Error('All agents failed');

  const weights = await Promise.all(agents.map(a => getModelWeight(a.model)));
  const weightedScores = agents.map((a, i) => ({
    score: a.result.risk_score,
    weight: weights[i],
  }));
  
  const aggScore = calculateWeightedScore(weightedScores);

  const report: ScanReport = {
    package: packageName,
    version,
    scan_timestamp: new Date().toISOString(),
    agents,
    aggregate_risk_score: aggScore,
    consensus: classifyRisk(aggScore),
    versions_analyzed: [version],
  };

  log('Uploading report to Fileverse...');
  let reportURI: string;
  try {
    reportURI = await uploadReportToFileverse(report);
    log(`Report uploaded: ${reportURI}`);
  } catch (err) {
    log(`Fileverse upload failed: ${err}`);
    reportURI = `local://report-${packageName}-${version}`;
  }

  try {
    await setReportURIOnChain(packageName, version, reportURI);
    log('Report URI stored on-chain');
  } catch (err: any) {
    log(`On-chain report URI: ${err?.shortMessage || err?.message || 'failed'}`);
  }

  return { report, reportURI };
}
