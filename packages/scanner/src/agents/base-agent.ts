import { SYSTEM_PROMPT, buildUserPrompt, getModelRankingFor } from '@opm/core';
import type { AgentEntry, KnownCVE } from '@opm/core';
import {
  fetchPackageData, buildLocalPackageData, extractMetadata,
  buildVersionHistory, fetchSourceFiles, extractLocalSourceFiles,
  type NpmPackageData,
} from '../services/npm-registry';
import { callLLM } from '../services/openrouter';
import { submitScoreOnChain } from '../services/contract-writer';
import { queryOSV } from '../services/osv';

export interface AgentConfig {
  agentId: string;
  model: string;
}

export interface LocalScanContext {
  tarballPath: string;
  pkgJsonPath: string;
}

export interface RunAgentOptions {
  local?: LocalScanContext;
  skipOnChainScore?: boolean;
}

export async function runAgent(
  config: AgentConfig,
  packageName: string,
  version: string,
  onStatus?: (msg: string) => void,
  localOrOptions?: LocalScanContext | RunAgentOptions,
): Promise<AgentEntry> {
  const opts: RunAgentOptions = localOrOptions && 'skipOnChainScore' in localOrOptions
    ? localOrOptions
    : { local: localOrOptions as LocalScanContext | undefined };
  const log = onStatus || console.log;

  log(`[${config.agentId}] Fetching package data...`);
  let data: NpmPackageData;
  let sourceFiles;

  try {
    data = await fetchPackageData(packageName);
    const tarballUrl = data.versions[version]?.dist?.tarball;
    if (!tarballUrl) throw new Error(`Version ${version} not on npm`);
    log(`[${config.agentId}] Downloading source from npm...`);
    sourceFiles = await fetchSourceFiles(packageName, version, tarballUrl);
  } catch {
    if (!opts.local) throw new Error(`${packageName}@${version} not found on npm and no local tarball provided`);
    log(`[${config.agentId}] Using local tarball...`);
    data = buildLocalPackageData(opts.local.pkgJsonPath);
    sourceFiles = await extractLocalSourceFiles(opts.local.tarballPath);
  }

  const meta = extractMetadata(data, version);
  const history = buildVersionHistory(data, version);

  log(`[${config.agentId}] Querying CVE database (OSV)...`);
  const osvVulns = await queryOSV(packageName, version);
  const knownCVEs: KnownCVE[] = osvVulns.map((v) => ({ id: v.id, summary: v.summary }));
  if (knownCVEs.length > 0) {
    log(`[${config.agentId}] Found ${knownCVEs.length} known CVE(s)`);
  }

  log(`[${config.agentId}] Analyzing with ${config.model} (${sourceFiles.length} files)...`);
  const userPrompt = buildUserPrompt(meta, history, sourceFiles, knownCVEs);
  const result = await callLLM(config.model, SYSTEM_PROMPT, userPrompt);

  log(`[${config.agentId}] Fetching model intelligence ranking...`);
  const { intelligence, coding, weight } = await getModelRankingFor(config.model);

  log(`[${config.agentId}] ${config.model} — intelligence: ${intelligence}, coding: ${coding}, weight: ${weight}`);

  let scoreTxHash: string | undefined;
  if (opts.skipOnChainScore) {
    log(`[${config.agentId}] Score: ${result.risk_score} (on-chain deferred until registration)`);
  } else {
    log(`[${config.agentId}] Submitting score (${result.risk_score}) to contract...`);
    try {
      scoreTxHash = await submitScoreOnChain(packageName, version, result.risk_score, result.reasoning);
      log(`[${config.agentId}] Score submitted on-chain ✓`);
    } catch (err: any) {
      log(`[${config.agentId}] On-chain: ${err?.shortMessage || err?.message || 'failed'}`);
    }
  }

  return {
    agent_id: config.agentId,
    model: config.model,
    model_intelligence: intelligence,
    model_coding: coding,
    model_weight: weight,
    score_tx_hash: scoreTxHash,
    result,
  };
}
