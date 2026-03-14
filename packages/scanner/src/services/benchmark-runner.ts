import {
  generateBenchmarkDataset,
  buildBenchmarkPrompt,
  evaluateBenchmark,
  SYSTEM_PROMPT,
  buildBatchSystemPrompt,
  buildBatchBenchmarkPrompt,
  evaluateBatchBenchmark,
  expectedFlagForCase,
  type BenchmarkCase,
  type BenchmarkResult,
  type BatchBenchmarkResponse,
  type BatchBenchmarkResult,
} from '@opm/core';
import { callLLM, callLLMRaw } from './openrouter';
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

/** Result type for the fast single-call batch benchmark */
export interface BatchBenchmarkRunResult {
  candidate: AgentCandidate;
  results: BatchBenchmarkResult[];
  passed: number;
  failed: number;
  total: number;
  accuracyPct: number;
  zkProof: ZKProof;
  verified: boolean;
}

/**
 * Fast single-call benchmark: sends all 10 cases in one prompt,
 * gets back 10 flagged/safe answers, compares to ground truth,
 * generates ZK proof. ~10x faster than runBenchmarkSuite.
 */
export async function runBatchBenchmarkSuite(
  candidate: AgentCandidate,
  onStatus?: (msg: string) => void,
): Promise<BatchBenchmarkRunResult> {
  const log = onStatus || console.log;
  const benchmarks = generateBenchmarkDataset();

  // Expected verdicts: 1 = flagged, 0 = safe
  const expectedVerdicts = benchmarks.map((b) => expectedFlagForCase(b) ? 1 : 0);

  log(`Generating commitment for ${benchmarks.length} test cases...`);
  const commitment = generateCommitment(expectedVerdicts);
  log(`Commitment: ${commitment.expectedHash.slice(0, 16)}…`);

  log(`Sending ${benchmarks.length} cases to ${candidate.model} (single call)...`);
  const userPrompt = buildBatchBenchmarkPrompt(benchmarks);
  // Use the candidate's own system prompt so a bad prompt actually fails the benchmark
  const systemPrompt = buildBatchSystemPrompt(candidate.systemPrompt);

  const response = await callLLMRaw<BatchBenchmarkResponse>(
    candidate.model,
    systemPrompt,
    userPrompt,
  );

  if (!response?.answers || !Array.isArray(response.answers)) {
    throw new Error(`Agent returned invalid batch response — expected { answers: [...] }`);
  }

  log(`Received ${response.answers.length} answers, evaluating...`);

  const results = evaluateBatchBenchmark(benchmarks, response.answers);
  const actualVerdicts = results.map((r) => r.actualFlagged ? 1 : 0);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const accuracyPct = Math.round((passed / results.length) * 100);

  results.forEach((r, i) => {
    const icon = r.passed ? '✓' : '✗';
    log(`  ${icon} Case ${i + 1} (${r.category}): ${r.actualFlagged ? 'FLAGGED' : 'SAFE'} — expected ${r.expectedFlagged ? 'FLAGGED' : 'SAFE'}`);
  });

  log(`Accuracy: ${passed}/${results.length} (${accuracyPct}%)`);
  log('Generating ZK proof...');

  const zkProof = generateProof(commitment, expectedVerdicts, actualVerdicts);
  const verified = verifyProof(zkProof);
  log(`ZK proof ${verified ? 'verified ✓' : 'INVALID ✗'}`);

  return {
    candidate,
    results,
    passed,
    failed,
    total: results.length,
    accuracyPct,
    zkProof,
    verified,
  };
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
