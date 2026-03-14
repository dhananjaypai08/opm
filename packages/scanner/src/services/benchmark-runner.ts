import {
  generateBenchmarkDataset,
  buildBenchmarkPrompt,
  evaluateBenchmark,
  SYSTEM_PROMPT,
  type BenchmarkCase,
  type BenchmarkResult,
} from '@opm/core';
import { callLLM } from './openrouter';
import {
  generateCommitment,
  generateProof,
  verifyProof,
  type ZKProof,
} from './zk-verifier';

export interface AgentCandidate {
  name: string;
  model: string;
  systemPrompt?: string;
}

export interface BenchmarkRunResult {
  candidate: AgentCandidate;
  results: BenchmarkResult[];
  passed: number;
  failed: number;
  total: number;
  accuracyPct: number;
  zkProof: ZKProof;
  verified: boolean;
  failureReasons: string[];
}

export async function runBenchmarkSuite(
  candidate: AgentCandidate,
  onStatus?: (msg: string) => void,
): Promise<BenchmarkRunResult> {
  const log = onStatus || console.log;
  const benchmarks = generateBenchmarkDataset();
  const systemPrompt = candidate.systemPrompt || SYSTEM_PROMPT;

  log(`Generating benchmark commitment for ${benchmarks.length} test cases...`);

  const expectedVerdicts = benchmarks.map((b) => {
    const levelMap: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    return levelMap[b.expected.risk_level] ?? 0;
  });

  const commitment = generateCommitment(expectedVerdicts);
  log(`Commitment generated: ${commitment.expectedHash.slice(0, 16)}...`);

  const results: BenchmarkResult[] = [];
  const actualVerdicts: number[] = [];

  for (let i = 0; i < benchmarks.length; i++) {
    const bench = benchmarks[i];
    log(`[${i + 1}/${benchmarks.length}] ${bench.description}...`);

    try {
      const userPrompt = buildBenchmarkPrompt(bench);
      const agentResult = await callLLM(candidate.model, systemPrompt, userPrompt);

      const evaluation = evaluateBenchmark(bench, agentResult.risk_level, agentResult.risk_score);
      results.push(evaluation);

      const levelMap: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
      actualVerdicts.push(evaluation.verdict === 'PASS'
        ? (levelMap[bench.expected.risk_level] ?? 0)
        : (levelMap[agentResult.risk_level] ?? 0));

      const icon = evaluation.verdict === 'PASS' ? '✓' : '✗';
      log(`[${i + 1}/${benchmarks.length}] ${icon} ${bench.category}: score=${agentResult.risk_score} level=${agentResult.risk_level} (expected ${bench.expected.risk_level})`);
    } catch (err: any) {
      log(`[${i + 1}/${benchmarks.length}] ✗ Error: ${err?.message || 'failed'}`);
      results.push({
        caseId: bench.id,
        category: bench.category,
        expectedLevel: bench.expected.risk_level,
        actualLevel: 'ERROR',
        expectedScoreRange: [bench.expected.min_risk_score, bench.expected.max_risk_score],
        actualScore: -1,
        verdict: 'FAIL',
        reason: `Agent error: ${err?.message || 'unknown'}`,
      });
      actualVerdicts.push(-1);
    }
  }

  log('Generating ZK proof of accuracy...');
  const zkProof = generateProof(commitment, expectedVerdicts, actualVerdicts);
  const verified = verifyProof(zkProof);

  const passed = results.filter((r) => r.verdict === 'PASS').length;
  const failed = results.filter((r) => r.verdict === 'FAIL').length;
  const failureReasons = results
    .filter((r) => r.verdict === 'FAIL')
    .map((r) => `${r.caseId} (${r.category}): ${r.reason}`);

  log(`ZK proof ${verified ? 'verified ✓' : 'INVALID ✗'}`);
  log(`Accuracy: ${passed}/${results.length} (${Math.round((passed / results.length) * 100)}%)`);

  return {
    candidate,
    results,
    passed,
    failed,
    total: results.length,
    accuracyPct: Math.round((passed / results.length) * 100),
    zkProof,
    verified,
    failureReasons,
  };
}
