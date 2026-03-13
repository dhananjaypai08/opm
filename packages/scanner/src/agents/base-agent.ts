import { SYSTEM_PROMPT, buildUserPrompt } from '@opm/core';
import type { AgentScanResult, AgentEntry } from '@opm/core';
import { fetchPackageData, extractMetadata, buildVersionHistory, fetchSourceFiles } from '../services/npm-registry';
import { callOpenRouter } from '../services/openrouter';
import { submitScoreOnChain } from '../services/contract-writer';

export interface AgentConfig {
  agentId: string;
  model: string;
}

export async function runAgent(
  config: AgentConfig,
  packageName: string,
  version: string,
  onStatus?: (msg: string) => void,
): Promise<AgentEntry> {
  const log = onStatus || console.log;

  log(`[${config.agentId}] Fetching package data...`);
  const data = await fetchPackageData(packageName);
  const meta = extractMetadata(data, version);
  const history = buildVersionHistory(data, version);

  log(`[${config.agentId}] Downloading source files...`);
  const tarballUrl = data.versions[version]?.dist?.tarball;
  if (!tarballUrl) throw new Error(`No tarball URL for ${packageName}@${version}`);
  const sourceFiles = await fetchSourceFiles(packageName, version, tarballUrl);

  log(`[${config.agentId}] Analyzing with ${config.model} (${sourceFiles.length} files)...`);
  const userPrompt = buildUserPrompt(meta, history, sourceFiles);
  const result = await callOpenRouter(config.model, SYSTEM_PROMPT, userPrompt);

  log(`[${config.agentId}] Submitting score (${result.risk_score}) to contract...`);
  try {
    await submitScoreOnChain(packageName, version, result.risk_score, result.reasoning);
    log(`[${config.agentId}] Score submitted on-chain`);
  } catch (err) {
    log(`[${config.agentId}] On-chain submission failed: ${err}`);
  }

  return {
    agent_id: config.agentId,
    model: config.model,
    result,
  };
}
