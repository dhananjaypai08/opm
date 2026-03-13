import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { getEnvOrThrow, truncateAddress, classifyRisk } from '@opm/core';
import type { AgentEntry } from '@opm/core';
import { Header } from '../components/Header';
import { StatusLine } from '../components/StatusLine';
import { computeChecksum, signChecksumAsync } from '../services/signature';
import { resolveENSName } from '../services/ens';
import { registerPackageOnChain } from '../services/contract';
import { enqueueScan } from '@opm/scanner';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface Steps {
  pack: StepStatus;
  sign: StepStatus;
  ens: StepStatus;
  publish: StepStatus;
  register: StepStatus;
  scan: StepStatus;
}

interface PushResult {
  checksum?: string;
  signature?: string;
  address?: string;
  ensName?: string;
  npmUrl?: string;
  npmError?: string;
  txHash?: string;
  riskScore?: number;
  reportURI?: string;
  agents?: AgentEntry[];
}

export function PushCommand() {
  const [steps, setSteps] = useState<Steps>({
    pack: 'pending', sign: 'pending', ens: 'pending',
    publish: 'pending', register: 'pending', scan: 'pending',
  });
  const [result, setResult] = useState<PushResult>({});
  const [error, setError] = useState<string | null>(null);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [pkgLabel, setPkgLabel] = useState('');

  const updateStep = (key: keyof Steps, status: StepStatus) =>
    setSteps((prev) => ({ ...prev, [key]: status }));

  useEffect(() => {
    runPush().catch((err) => setError(String(err)));
  }, []);

  async function runPush() {
    const pkgJsonPath = path.resolve('package.json');
    if (!fs.existsSync(pkgJsonPath)) throw new Error('No package.json found in current directory');

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const { name, version } = pkgJson;
    if (!name || !version) throw new Error('package.json missing name or version');
    setPkgLabel(`${name}@${version}`);

    const privateKey = getEnvOrThrow('OPM_PRIVATE_KEY');

    updateStep('pack', 'running');
    const tarball = execSync('npm pack --json 2>/dev/null', { encoding: 'utf-8' });
    const parsed = JSON.parse(tarball);
    const tarballFile = Array.isArray(parsed) ? parsed[0].filename : parsed.filename;
    updateStep('pack', 'done');

    updateStep('sign', 'running');
    const checksum = computeChecksum(tarballFile);
    const { signature, address } = await signChecksumAsync(checksum, privateKey);
    setResult((r) => ({ ...r, checksum, signature, address }));
    updateStep('sign', 'done');

    updateStep('ens', 'running');
    const ensName = await resolveENSName(address) || '';
    setResult((r) => ({ ...r, ensName, address }));
    updateStep('ens', 'done');

    const originalPkgJsonContent = fs.readFileSync(pkgJsonPath, 'utf-8');
    pkgJson.opm = { signature, author: address, ensName, checksum };
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));

    updateStep('publish', 'running');
    try {
      execSync('npm publish --access public', { encoding: 'utf-8', stdio: 'pipe' });
      setResult((r) => ({
        ...r,
        npmUrl: `https://www.npmjs.com/package/${name}/v/${version}`,
      }));
    } catch (err: any) {
      const msg = err?.stderr || err?.stdout || err?.message || '';
      const lines = msg.split('\n').filter((l: string) => l.trim().length > 0);
      const errorLine = lines.find((l: string) =>
        (l.includes('npm error') || l.includes('ERR!')) && !l.includes('npm notice'),
      );
      const reason = errorLine
        ? errorLine.replace(/^npm\s+(error|ERR!)\s*/i, '').trim()
        : 'publish failed (version may already exist)';
      setResult((r) => ({ ...r, npmError: reason.slice(0, 120) }));
    }
    updateStep('publish', 'done');

    fs.writeFileSync(pkgJsonPath, originalPkgJsonContent);

    updateStep('register', 'running');
    try {
      const sigBytes = new Uint8Array(Buffer.from(signature.slice(2), 'hex'));
      const txHash = await registerPackageOnChain(name, version, checksum, sigBytes, ensName);
      setResult((r) => ({ ...r, txHash }));
    } catch (err: any) {
      setScanLogs((prev) => [...prev, `Registration: ${err?.shortMessage || err?.message || 'failed'}`]);
    }
    updateStep('register', 'done');

    updateStep('scan', 'running');
    try {
      const scanResult = await enqueueScan(name, version, (msg) =>
        setScanLogs((prev) => [...prev.slice(-8), msg]),
        { tarballPath: tarballFile, pkgJsonPath },
      );
      setResult((r) => ({
        ...r,
        riskScore: scanResult.report.aggregate_risk_score,
        reportURI: scanResult.reportURI,
        agents: scanResult.report.agents,
      }));
    } catch (err: any) {
      setScanLogs((prev) => [...prev, `Scan: ${err?.message || 'failed'}`]);
    }
    updateStep('scan', 'done');

    if (fs.existsSync(tarballFile)) fs.unlinkSync(tarballFile);
  }

  const riskColor = (score: number) => score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green';

  return (
    <Box flexDirection="column">
      <Header subtitle="push" />
      {pkgLabel && <Text color="white" bold> {pkgLabel}</Text>}
      <Text> </Text>
      <StatusLine label="Pack tarball" status={steps.pack} detail={result.checksum?.slice(0, 16)} />
      <StatusLine label="Sign checksum" status={steps.sign} detail={result.signature?.slice(0, 16)} />
      <StatusLine label="Resolve ENS" status={steps.ens} />
      {steps.ens === 'done' && result.address && (
        <Box marginLeft={4}>
          <Text color="cyan">{truncateAddress(result.address)}</Text>
          {result.ensName ? (
            <Text> → <Text color="green" bold>{result.ensName}</Text></Text>
          ) : (
            <Text color="gray"> (no ENS name)</Text>
          )}
        </Box>
      )}
      <StatusLine label="Publish to npm" status={steps.publish} />
      {steps.publish === 'done' && (
        <Box marginLeft={4}>
          {result.npmUrl ? (
            <Text color="green">✓ Published → <Text color="blue">{result.npmUrl}</Text></Text>
          ) : result.npmError ? (
            <Text color="yellow">⚠ {result.npmError}</Text>
          ) : null}
        </Box>
      )}
      <StatusLine label="Register on-chain" status={steps.register} detail={result.txHash?.slice(0, 16)} />
      <StatusLine label="Security scan (3 agents)" status={steps.scan} />

      {scanLogs.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          {scanLogs.map((log, i) => (
            <Text key={i} color="gray">{log}</Text>
          ))}
        </Box>
      )}

      {result.agents && result.agents.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Text color="white" bold> Agent Results</Text>
          {result.agents.map((agent) => (
            <Box key={agent.agent_id} flexDirection="column" marginLeft={2} marginTop={1}>
              <Box>
                <Text color="white" bold>{agent.agent_id}</Text>
                <Text color="gray"> ({agent.model}) </Text>
                <Text color={riskColor(agent.result.risk_score)} bold>
                  {agent.result.risk_score}/100
                </Text>
                <Text color="gray"> {agent.result.risk_level}</Text>
              </Box>
              <Box marginLeft={2}>
                <Text color="gray" wrap="wrap">{agent.result.reasoning.slice(0, 120)}</Text>
              </Box>
              {agent.result.vulnerabilities.length > 0 && (
                <Box marginLeft={2}>
                  <Text color="yellow">{agent.result.vulnerabilities.length} vulnerabilities found</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {result.riskScore !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Box>
            <Text color="white" bold> Aggregate Risk: </Text>
            <Text color={riskColor(result.riskScore)} bold>
              {result.riskScore}/100 ({classifyRisk(result.riskScore)})
            </Text>
          </Box>
        </Box>
      )}

      {result.reportURI && (
        <Box flexDirection="column" marginLeft={1}>
          <Box>
            <Text color="white" bold> Report: </Text>
            {result.reportURI.startsWith('local://') ? (
              <Text color="gray">(stored locally)</Text>
            ) : (
              <Text color="green">✓ Uploaded to Fileverse</Text>
            )}
          </Box>
          {!result.reportURI.startsWith('local://') && (
            <Box marginLeft={2}>
              <Text color="blue">{result.reportURI}</Text>
            </Box>
          )}
        </Box>
      )}

      {error && <Text color="red">Error: {error}</Text>}
    </Box>
  );
}
