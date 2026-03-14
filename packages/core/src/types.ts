export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Recommendation = 'SAFE' | 'CAUTION' | 'WARN' | 'BLOCK';
export type ChangelogRisk = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface Vulnerability {
  severity: RiskLevel;
  category: string;
  description: string;
  file: string;
  evidence: string;
  cve_id?: string;
}

export interface SupplyChainIndicators {
  has_install_scripts: boolean;
  has_native_bindings: boolean;
  has_obfuscated_code: boolean;
  has_network_calls: boolean;
  has_filesystem_access: boolean;
  has_process_spawn: boolean;
  has_eval_usage: boolean;
  accesses_env_variables: boolean;
}

export interface VersionAnalysis {
  version_reviewed: string;
  previous_versions_reviewed: string[];
  changelog_risk: ChangelogRisk;
  changelog_reasoning: string;
}

export interface AgentScanResult {
  risk_score: number;
  risk_level: RiskLevel;
  reasoning: string;
  vulnerabilities: Vulnerability[];
  supply_chain_indicators: SupplyChainIndicators;
  version_analysis: VersionAnalysis;
  recommendation: Recommendation;
}

export interface AgentEntry {
  agent_id: string;
  model: string;
  model_intelligence?: number;
  model_coding?: number;
  model_weight?: number;
  score_tx_hash?: string;
  result: AgentScanResult;
}

export interface ScanReport {
  package: string;
  version: string;
  scan_timestamp: string;
  agents: AgentEntry[];
  aggregate_risk_score: number;
  consensus: RiskLevel;
  versions_analyzed: string[];
}

export interface PackageMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
}

export interface VersionHistoryEntry {
  version: string;
  published: string;
  depsChanged: string;
  filesChanged: string;
  sizeDelta: string;
  newMaintainer: boolean;
}

export interface SourceFile {
  path: string;
  size: number;
  content: string;
}

export interface AuthorProfile {
  addr: string;
  ensName: string;
  reputationScore: number;
  packagesPublished: number;
}

export interface OnChainPackageInfo {
  author: string;
  checksum: string;
  signature: string;
  ensName: string;
  reportURI: string;
  scores: Array<{ agent: string; riskScore: number; reasoning: string }>;
  aggregateScore: number;
  exists: boolean;
}

export interface ChainPatrolResult {
  status: 'UNKNOWN' | 'ALLOWED' | 'BLOCKED';
  source: string;
}

export interface CheckDepResult {
  name: string;
  version: string;
  typosquat: { likelyTarget: string; confidence: string; reason: string } | null;
  cveCount: number;
  cveCritical: number;
  cveHigh: number;
  cveIds: string[];
  fixVersion: string | null;
  onChainScore: number | null;
}

export interface CheckAgentResult {
  agentId: string;
  model: string;
  intelligence: number;
  coding: number;
  findings: Array<{
    package: string;
    issue: string;
    severity: string;
    explanation: string;
    suggested_replacement: string | null;
    suggested_version: string | null;
  }>;
  overall: string;
  riskScore: number;
}

export interface CheckReport {
  project: string;
  timestamp: string;
  totalDeps: number;
  deps: CheckDepResult[];
  agents: CheckAgentResult[];
}
