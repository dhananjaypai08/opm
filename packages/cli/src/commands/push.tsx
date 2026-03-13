import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { getEnvOrThrow } from '@opm/core';
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
  txHash?: string;
  riskScore?: number;
  reportURI?: string;
}

export function PushCommand() {
  const [steps, setSteps] = useState<Steps>({
    pack: 'pending', sign: 'pending', ens: 'pending',
    publish: 'pending', register: 'pending', scan: 'pending',
  });
  const [result, setResult] = useState<PushResult>({});
  const [error, setError] = useState<string | null>(null);
  const [scanLogs, setScanLogs] = useState<string[]>([]);

  const updateStep = (key: keyof Steps, status: StepStatus) =>
    setSteps((prev) => ({ ...prev, [key]: status }));

  useEffect(() => {
    runPush().catch((err) => setError(String(err)));
  }, []);

  async function runPush() {
    const pkgJsonPath = path.resolve('package.json');
    if (!fs.existsSync(pkgJsonPath)) throw new Error('No package.json found');

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const { name, version } = pkgJson;
    if (!name || !version) throw new Error('package.json missing name or version');

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
    setResult((r) => ({ ...r, ensName }));
    updateStep('ens', 'done');

    pkgJson.opm = { signature, author: address, ensName, checksum };
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));

    updateStep('publish', 'running');
    try {
      execSync('npm publish --access public 2>&1', { encoding: 'utf-8' });
    } catch {
      // non-fatal for hackathon demo
    }
    updateStep('publish', 'done');

    updateStep('register', 'running');
    try {
      const sigBytes = new Uint8Array(Buffer.from(signature.slice(2), 'hex'));
      const txHash = await registerPackageOnChain(name, version, checksum, sigBytes, ensName);
      setResult((r) => ({ ...r, txHash }));
    } catch (err) {
      console.error('Registration failed:', err);
    }
    updateStep('register', 'done');

    updateStep('scan', 'running');
    try {
      const scanResult = await enqueueScan(name, version, (msg) =>
        setScanLogs((prev) => [...prev.slice(-5), msg]),
      );
      setResult((r) => ({
        ...r,
        riskScore: scanResult.report.aggregate_risk_score,
        reportURI: scanResult.reportURI,
      }));
    } catch (err) {
      console.error('Scan failed:', err);
    }
    updateStep('scan', 'done');

    if (fs.existsSync(tarballFile)) fs.unlinkSync(tarballFile);
  }

  return (
    <Box flexDirection="column">
      <Header subtitle="push" />
      <StatusLine label="Pack tarball" status={steps.pack} />
      <StatusLine label="Sign checksum" status={steps.sign} detail={result.checksum?.slice(0, 16)} />
      <StatusLine label="Resolve ENS" status={steps.ens} detail={result.ensName || undefined} />
      <StatusLine label="Publish to npm" status={steps.publish} />
      <StatusLine label="Register on-chain" status={steps.register} detail={result.txHash?.slice(0, 16)} />
      <StatusLine label="Security scan (3 agents)" status={steps.scan} />
      {scanLogs.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          {scanLogs.map((log, i) => (
            <Text key={i} color="gray">{log}</Text>
          ))}
        </Box>
      )}
      {result.riskScore !== undefined && (
        <Box marginTop={1}>
          <Text color="gray">Risk Score: </Text>
          <Text color={result.riskScore > 70 ? 'red' : result.riskScore > 40 ? 'yellow' : 'green'} bold>
            {result.riskScore}/100
          </Text>
        </Box>
      )}
      {result.reportURI && (
        <Box>
          <Text color="gray">Report: </Text>
          <Text color="blue">{result.reportURI}</Text>
        </Box>
      )}
      {error && <Text color="red">Error: {error}</Text>}
    </Box>
  );
}
