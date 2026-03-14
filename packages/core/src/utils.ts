import { HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD } from './constants';
import type { RiskLevel, AgentScanResult, SupplyChainIndicators, VersionAnalysis } from './types';

export function classifyRisk(score: number): RiskLevel {
  if (score >= HIGH_RISK_THRESHOLD) return 'HIGH';
  if (score >= MEDIUM_RISK_THRESHOLD) return 'MEDIUM';
  return 'LOW';
}

export function averageScores(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function getEnvOrThrow(key: string, ...fallbackKeys: string[]): string {
  const val = process.env[key];
  if (val) return val;
  for (const fk of fallbackKeys) {
    const fv = process.env[fk];
    if (fv) return fv;
  }
  throw new Error(`Missing required env var: ${key}`);
}

export function getEnvOrDefault(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export function validateScanResult(obj: unknown): obj is AgentScanResult {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.risk_score === 'number' &&
    typeof o.risk_level === 'string' &&
    typeof o.reasoning === 'string' &&
    Array.isArray(o.vulnerabilities) &&
    typeof o.supply_chain_indicators === 'object' &&
    typeof o.version_analysis === 'object' &&
    typeof o.recommendation === 'string'
  );
}

const VALID_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const VALID_RECOMMENDATIONS = ['SAFE', 'CAUTION', 'WARN', 'BLOCK'] as const;
const SCORE_KEYS = ['risk_score', 'score', 'riskScore', 'risk_rating'];
const LEVEL_KEYS = ['risk_level', 'riskLevel', 'level', 'severity', 'verdict', 'rating'];
const TEXT_KEYS = ['reasoning', 'summary', 'explanation', 'description', 'analysis', 'one_line_summary', 'one_liner'];

function deepFind(obj: Record<string, any>, keys: string[], type: 'number' | 'string', depth = 0): any {
  if (depth > 4 || !obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined && val !== null) {
      if (type === 'number') {
        if (typeof val === 'number') return val;
        if (typeof val === 'string' && !isNaN(parseFloat(val))) return parseFloat(val);
      } else if (type === 'string' && typeof val === 'string' && val.length > 0) {
        return val;
      }
    }
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = deepFind(val, keys, type, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function deepFindArray(obj: Record<string, any>, keys: string[], depth = 0): any[] | undefined {
  if (depth > 4 || !obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = deepFindArray(val, keys, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function deepFindObj(obj: Record<string, any>, keys: string[], depth = 0): Record<string, any> | undefined {
  if (depth > 3 || !obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) return val;
  }
  return undefined;
}

function normalizeRiskLevel(val: unknown): RiskLevel {
  if (typeof val !== 'string') return 'MEDIUM';
  const upper = val.toUpperCase().trim();
  if (VALID_RISK_LEVELS.includes(upper as RiskLevel)) return upper as RiskLevel;
  if (upper === 'SAFE' || upper === 'NONE' || upper === 'INFO') return 'LOW';
  if (upper === 'MODERATE' || upper === 'SUSPICIOUS') return 'MEDIUM';
  if (upper === 'DANGEROUS' || upper === 'SEVERE') return 'CRITICAL';
  return 'MEDIUM';
}

function normalizeRecommendation(val: unknown, riskLevel: RiskLevel): string {
  if (typeof val === 'string') {
    const upper = val.toUpperCase().trim();
    if (VALID_RECOMMENDATIONS.includes(upper as any)) return upper;
  }
  const map: Record<RiskLevel, string> = { LOW: 'SAFE', MEDIUM: 'CAUTION', HIGH: 'WARN', CRITICAL: 'BLOCK' };
  return map[riskLevel] || 'CAUTION';
}

/**
 * Recursively searches an arbitrarily-shaped LLM response for risk_score,
 * risk_level, reasoning, etc. and assembles a valid AgentScanResult.
 */
export function normalizeScanResult(raw: unknown): AgentScanResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;

  const riskScore = deepFind(o, SCORE_KEYS, 'number');
  if (riskScore === undefined || isNaN(riskScore)) return null;

  const rawLevel = deepFind(o, LEVEL_KEYS, 'string');
  const riskLevel = normalizeRiskLevel(rawLevel);

  const reasoning = deepFind(o, TEXT_KEYS, 'string') ?? `Risk score: ${riskScore}`;

  const rawVulns = deepFindArray(o, ['vulnerabilities', 'findings', 'issues', 'alerts', 'concerns']);
  const vulnerabilities = rawVulns
    ? rawVulns.map((f: any) => ({
        severity: normalizeRiskLevel(f.severity ?? f.level ?? f.risk_level),
        category: f.category || f.type || f.issue || 'unknown',
        description: f.description || f.message || f.detail || f.title || '',
        file: f.file || f.location || f.path || '',
        evidence: f.evidence || f.code || f.snippet || '',
      }))
    : [];

  const sci = deepFindObj(o, ['supply_chain_indicators', 'supplyChainIndicators', 'indicators']);
  const supply_chain_indicators: SupplyChainIndicators = (sci as SupplyChainIndicators) ?? {
    has_install_scripts: false,
    has_native_bindings: false,
    has_obfuscated_code: false,
    has_network_calls: false,
    has_filesystem_access: false,
    has_process_spawn: false,
    has_eval_usage: false,
    accesses_env_variables: false,
  };

  const va = deepFindObj(o, ['version_analysis', 'versionAnalysis']);
  const version_analysis: VersionAnalysis = (va as VersionAnalysis) ?? {
    version_reviewed: deepFind(o, ['version', 'version_reviewed'], 'string') ?? '',
    previous_versions_reviewed: [],
    changelog_risk: 'NONE',
    changelog_reasoning: '',
  };

  const recommendation = normalizeRecommendation(
    deepFind(o, ['recommendation', 'action', 'verdict'], 'string'),
    riskLevel,
  );

  return {
    risk_score: Math.max(0, Math.min(100, Math.round(riskScore))),
    risk_level: riskLevel,
    reasoning,
    vulnerabilities,
    supply_chain_indicators,
    version_analysis,
    recommendation: recommendation as any,
  };
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
