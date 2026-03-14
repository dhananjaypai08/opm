import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ethers } from 'ethers';
import { txUrl, contractUrl, addressUrl } from '@opm/core';
import { Header } from '../components/Header';
import { StatusLine, type Status } from '../components/StatusLine';
import { Hyperlink } from '../components/Hyperlink';
import { registerAgentOnChain } from '../services/contract';
import { runBatchBenchmarkSuite, type BatchBenchmarkRunResult } from '@opm/scanner';

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
  agentAddress?: string;
  benchmarkResult?: BatchBenchmarkRunResult;
  txHash?: string;
  onChainProofHash?: string;
  onChainPromptHash?: string;
  alreadyRegistered?: boolean;
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

    // Derive agent wallet address from private key
    const agentWallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY);
    setResult((r) => ({ ...r, agentAddress: agentWallet.address }));

    updateStep('validate', 'done');

    // Single-call batch benchmark: sends all 10 cases at once,
    // gets back 10 flagged/safe answers, compares to ground truth.
    updateStep('benchmark', 'running');
    const benchResult = await runBatchBenchmarkSuite(
      { name: agentName, model, systemPrompt },
      (msg) => setLogs((prev) => [...prev.slice(-12), msg]),
    );
    setResult((r) => ({ ...r, benchmarkResult: benchResult }));

    if (!benchResult.zkProof.passed || benchResult.accuracyPct < 100) {
      updateStep('benchmark', 'error');
      updateStep('zkproof', 'error');
      updateStep('register', 'blocked');
      const failedCases = benchResult.results
        .filter((r) => !r.passed)
        .map((r) => `${r.caseId} (${r.category}): answered ${r.actualFlagged ? 'FLAGGED' : 'SAFE'}, expected ${r.expectedFlagged ? 'FLAGGED' : 'SAFE'}`);
      setResult((r) => ({
        ...r,
        rejected: true,
        rejectReason: `Agent achieved ${benchResult.accuracyPct}% accuracy (100% required). ` +
          `Failed ${benchResult.failed}/${benchResult.total} cases.\n` +
          failedCases.join('\n'),
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

    // Compute the on-chain hashes (same as registerAgentOnChain does)
    const proofStr = benchResult.zkProof.accuracyProof;
    const promptStr = systemPrompt || 'default-opm-security-prompt';
    const onChainProofHash = ethers.keccak256(ethers.toUtf8Bytes(proofStr));
    const onChainPromptHash = ethers.keccak256(ethers.toUtf8Bytes(promptStr));

    setResult((r) => ({ ...r, onChainProofHash, onChainPromptHash }));
    setLogs((prev) => [...prev, `ZK proof hash: ${benchResult.zkProof.accuracyProof.slice(0, 24)}…`]);
    updateStep('zkproof', 'done');

    updateStep('register', 'running');
    try {
      const txHash = await registerAgentOnChain(agentName, model, promptStr, proofStr);
      setResult((r) => ({ ...r, txHash }));
      setLogs((prev) => [...prev, `Agent registered on-chain ✓`]);
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || 'failed';
      setLogs((prev) => [...prev, `Registration: ${msg}`]);
      if (msg.includes('already')) {
        setResult((r) => ({ ...r, alreadyRegistered: true }));
        updateStep('register', 'done');
        return;
      }
    }
    updateStep('register', 'done');
  }

  return (
    <Box flexDirection="column">
      <Header subtitle="register-agent" />
      <Text color="white" bold> Registering agent: {agentName}</Text>
      <Text color="gray"> Model: {model}</Text>
      {result.agentAddress && (
        <Box>
          <Text color="gray"> Wallet: </Text>
          <Hyperlink url={addressUrl(result.agentAddress)} label={result.agentAddress} color="cyan" />
        </Box>
      )}
      <Text> </Text>

      <StatusLine label="Validate configuration" status={steps.validate} />
      <StatusLine label="Batch benchmark (10 cases, single call)" status={steps.benchmark} />

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
          <Text color="white" bold> Benchmark Results (flagged/safe)</Text>
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            {result.benchmarkResult.results.map((r, i) => (
              <Box key={r.caseId}>
                <Text color={r.passed ? 'green' : 'red'}>
                  {r.passed ? '✓' : '✗'}{' '}
                </Text>
                <Text color="white">Case {i + 1} ({r.category})</Text>
                <Text color="gray"> — {r.actualFlagged ? 'FLAGGED' : 'SAFE'}</Text>
                {!r.passed && (
                  <Text color="red"> (expected {r.expectedFlagged ? 'FLAGGED' : 'SAFE'})</Text>
                )}
              </Box>
            ))}
          </Box>
          <Box marginLeft={2} marginTop={1}>
            <Text color={result.benchmarkResult.accuracyPct >= 100 ? 'green' : 'red'} bold>
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
          <Text color="gray">Commitment:       {result.benchmarkResult.zkProof.commitment.expectedHash.slice(0, 24)}…</Text>
          <Text color="gray">Proof:            {result.benchmarkResult.zkProof.accuracyProof.slice(0, 24)}…</Text>
          {result.onChainProofHash && (
            <Text color="gray">On-chain proof:   {result.onChainProofHash.slice(0, 24)}…</Text>
          )}
          {result.onChainPromptHash && (
            <Text color="gray">Prompt hash:      {result.onChainPromptHash.slice(0, 24)}…</Text>
          )}
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
          {result.onChainProofHash && (
            <Text color="gray">    ZK proof stored: {result.onChainProofHash.slice(0, 18)}…</Text>
          )}
          <Box>
            <Text color="gray">📋 </Text>
            <Hyperlink url={contractUrl()} label="OPM Registry Contract" color="cyan" />
          </Box>
        </Box>
      )}

      {result.alreadyRegistered && !result.rejected && (
        <Box flexDirection="column" marginLeft={4}>
          <Text color="yellow">⚠ Agent wallet is already registered on-chain</Text>
          {result.agentAddress && (
            <Box>
              <Text color="gray">  Agent: </Text>
              <Hyperlink url={addressUrl(result.agentAddress)} label={result.agentAddress.slice(0, 10) + '…'} color="cyan" />
            </Box>
          )}
          <Text color="gray">  Benchmark passed ✓ — ZK proof valid ✓</Text>
          <Text color="gray">  Use a different AGENT_PRIVATE_KEY to register a new agent.</Text>
        </Box>
      )}

      {result.rejected && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Text color="red" bold>✗ REGISTRATION REJECTED</Text>
          <Box marginLeft={2}>
            <Text color="red" wrap="wrap">{result.rejectReason}</Text>
          </Box>
        </Box>
      )}

      {!result.rejected && !result.alreadyRegistered && steps.register === 'done' && (
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
