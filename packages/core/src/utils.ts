import { HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD } from './constants';
import type { RiskLevel, AgentScanResult } from './types';

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

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
