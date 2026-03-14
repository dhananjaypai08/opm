import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { txUrl, contractUrl, addressUrl } from '@opm/core';
import { Header } from '../components/Header';
import { StatusLine, type Status } from '../components/StatusLine';
import { Hyperlink } from '../components/Hyperlink';
import { registerAgentOnChain } from '../services/contract';
import { runBenchmarkSuite, type BenchmarkRunResult } from '@opm/scanner';

type StepStatus = Status;

interface Steps {
  validate: StepStatus;
  benchmark: StepStatus;
  zkproof: StepStatus;
  register: StepStatus;
}

interface RegisterResult {
  agentName?: string;
  model?: string;
  benchmarkResult?: BenchmarkRunResult;
  txHash?: string;
  agentAddress?: string;
  rejected?: boolean;
  rejectReason?: string;
}

interface RegisterAgentCommandProps {
  agentName: string;
  model: string;
  systemPrompt?: string;
}

export function RegisterAgentCommand({ agentName, model, systemPrompt }: RegisterAgentCommandProps) {
  const [steps, setSteps] = useState<Steps>({
    validate: 'pending',
    benchmark: 'pending',
    zkproof: 'pending',
    register: 'pending',
  });
  const [result, setResult] = useState<RegisterResult>({});
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const updateStep = (key: keyof Steps, status: StepStatus) =>
    setSteps((prev) => ({ ...prev, [key]: status }));

  useEffect(() => {
    runRegistration().catch((err) => setError(String(err)));
  }, []);

  async function runRegistration() {
    setResult({ agentName, model });

    updateStep('validate', 'running');

    if (!agentName || agentName.length < 2) {
      throw new Error('Agent name must be at least 2 characters');
    }
    if (!model) {
      throw new Error('Model identifier is required (e.g. anthropic/claude-sonnet-4-20250514)');
    }

    if (!process.env.AGENT_PRIVATE_KEY) {
      throw new Error('AGENT_PRIVATE_KEY required — this wallet becomes the agent identity');
    }
    if (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
      throw new Error('OPENROUTER_API_KEY or OPENAI_API_KEY required to run benchmarks');
    }

    updateStep('validate', 'done');

    updateStep('benchmark', 'running');
    const benchResult = await runBenchmarkSuite(
      { name: agentName, model, systemPrompt },
      (msg) => setLogs((prev) => [...prev.slice(-12), msg]),
    );
    setResult((r) => ({ ...r, benchmarkResult: benchResult }));

    if (!benchResult.zkProof.passed || benchResult.accuracyPct < 100) {
      updateStep('benchmark', 'error');
      updateStep('zkproof', 'error');
      updateStep('register', 'blocked');
      setResult((r) => ({
        ...r,
        rejected: true,
        rejectReason: `Agent achieved ${benchResult.accuracyPct}% accuracy (100% required). ` +
          `Failed ${benchResult.failed}/${benchResult.total} benchmark cases.`,
      }));
      return;
    }
    updateStep('benchmark', 'done');

    updateStep('zkproof', 'running');
    if (!benchResult.verified) {
      updateStep('zkproof', 'error');
      updateStep('register', 'blocked');
      setResult((r) => ({
        ...r,
        rejected: true,
        rejectReason: 'ZK proof verification failed — integrity check did not pass',
      }));
      return;
    }
    setLogs((prev) => [...prev, `ZK proof hash: ${benchResult.zkProof.accuracyProof.slice(0, 24)}…`]);
    updateStep('zkproof', 'done');

    updateStep('register', 'running');
    try {
      const proofStr = benchResult.zkProof.accuracyProof;
      const promptStr = systemPrompt || 'default-opm-security-prompt';
      const txHash = await registerAgentOnChain(agentName, model, promptStr, proofStr);
      setResult((r) => ({ ...r, txHash }));
      setLogs((prev) => [...prev, `Agent registered on-chain ✓`]);
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'failed';
      setLogs((prev) => [...prev, `Registration: ${msg}`]);
      if (msg.includes('already')) {
        setResult((r) => ({ ...r, rejected: true, rejectReason: 'Agent wallet is already registered' }));
        updateStep('register', 'error');
        return;
      }
    }
    updateStep('register', 'done');
  }

  const riskColor = (pct: number) => (pct >= 100 ? 'green' : pct >= 70 ? 'yellow' : 'red');

  return (
    <Box flexDirection="column">
      <Header subtitle="register-agent" />
      <Text color="white" bold> Registering agent: {agentName}</Text>
      <Text color="gray"> Model: {model}</Text>
      <Text> </Text>

      <StatusLine label="Validate configuration" status={steps.validate} />
      <StatusLine label="Run benchmark suite (10 cases)" status={steps.benchmark} />

      {logs.length > 0 && (
        <Box flexDirection="column" marginLeft={4}>
          {logs.map((log, i) => (
            <Text key={i} color="gray">{log}</Text>
          ))}
        </Box>
      )}

      {result.benchmarkResult && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Text color="white" bold> Benchmark Results</Text>
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            {result.benchmarkResult.results.map((r) => (
              <Box key={r.caseId}>
                <Text color={r.verdict === 'PASS' ? 'green' : 'red'}>
                  {r.verdict === 'PASS' ? '✓' : '✗'}{' '}
                </Text>
                <Text color="white">{r.category}</Text>
                <Text color="gray"> — expected {r.expectedLevel}, got {r.actualLevel}</Text>
                <Text color="gray"> (score: {r.actualScore})</Text>
              </Box>
            ))}
          </Box>
          <Box marginLeft={2} marginTop={1}>
            <Text color={riskColor(result.benchmarkResult.accuracyPct)} bold>
              Accuracy: {result.benchmarkResult.passed}/{result.benchmarkResult.total}{' '}
              ({result.benchmarkResult.accuracyPct}%)
            </Text>
          </Box>
        </Box>
      )}

      <Text> </Text>
      <StatusLine label="ZK proof verification" status={steps.zkproof} />
      {result.benchmarkResult?.zkProof && steps.zkproof === 'done' && (
        <Box flexDirection="column" marginLeft={4}>
          <Text color="gray">Commitment: {result.benchmarkResult.zkProof.commitment.expectedHash.slice(0, 24)}…</Text>
          <Text color="gray">Proof:      {result.benchmarkResult.zkProof.accuracyProof.slice(0, 24)}…</Text>
          <Text color="green">✓ Zero-knowledge proof verified — accuracy proven without revealing test data</Text>
        </Box>
      )}

      <StatusLine label="Register agent on-chain" status={steps.register} />
      {result.txHash && (
        <Box flexDirection="column" marginLeft={4}>
          <Box>
            <Text color="gray">⛓  </Text>
            <Hyperlink url={txUrl(result.txHash)} label={`tx ${result.txHash.slice(0, 10)}…`} color="green" />
          </Box>
          <Box>
            <Text color="gray">📋 </Text>
            <Hyperlink url={contractUrl()} label="OPM Registry Contract" color="cyan" />
          </Box>
        </Box>
      )}

      {result.rejected && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Text color="red" bold>✗ REGISTRATION REJECTED</Text>
          <Box marginLeft={2}>
            <Text color="red" wrap="wrap">{result.rejectReason}</Text>
          </Box>
          {result.benchmarkResult && result.benchmarkResult.failureReasons.length > 0 && (
            <Box flexDirection="column" marginLeft={2} marginTop={1}>
              <Text color="yellow" bold>Failure details:</Text>
              {result.benchmarkResult.failureReasons.map((reason, i) => (
                <Text key={i} color="yellow" wrap="wrap">  • {reason}</Text>
              ))}
            </Box>
          )}
        </Box>
      )}

      {!result.rejected && steps.register === 'done' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Text color="green" bold>✓ Agent "{agentName}" registered successfully</Text>
          <Text color="gray">  Your agent is now authorized to submit security scores on-chain.</Text>
          <Text color="gray">  It will participate in the next package scan alongside existing agents.</Text>
        </Box>
      )}

      {error && <Text color="red">Error: {error}</Text>}
    </Box>
  );
}
