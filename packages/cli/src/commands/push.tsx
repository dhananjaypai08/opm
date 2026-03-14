import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { getEnvOrThrow, truncateAddress, classifyRisk, txUrl, contractUrl, addressUrl } from '@opm/core';
import type { AgentEntry } from '@opm/core';
import { Header } from '../components/Header';
import { StatusLine, type Status } from '../components/StatusLine';
import { RiskBadge } from '../components/RiskBadge';
import { Hyperlink } from '../components/Hyperlink';
import { computeChecksum, signChecksumAsync } from '../services/signature';
import { resolveENSName } from '../services/ens';
import { registerPackageOnChain } from '../services/contract';
import { writeENSRecords, buildOPMRecords, readOPMRecords, createPackageSubname, setENSContenthash, parseFileverseLink, readFileverseContentHash } from '../services/ens-records';
import { enqueueScan, submitScoreOnChain, setReportURIOnChain } from '@opm/scanner';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

type StepStatus = Status;

interface Steps {
  pack: StepStatus;
  sign: StepStatus;
  ens: StepStatus;
  scan: StepStatus;
  publish: StepStatus;
  register: StepStatus;
  ensRecords: StepStatus;
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
  riskLevel?: string;
  reportURI?: string;
  agents?: AgentEntry[];
  blocked?: boolean;
  blockReason?: string;
  ensRecordsTx?: string;
  ensRecordsChain?: string;
  ensRecordsCount?: number;
  ensSubname?: string;
  ipfsContenthash?: string;
}

interface PushCommandProps {
  npmToken?: string;
  otp?: string;
}

export function PushCommand({ npmToken, otp }: PushCommandProps) {
  const [steps, setSteps] = useState<Steps>({
    pack: 'pending', sign: 'pending', ens: 'pending',
    scan: 'pending', publish: 'pending', register: 'pending',
    ensRecords: 'pending',
  });
  const [result, setResult] = useState<PushResult>({});
  const [error, setError] = useState<string | null>(null);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [ensRecordLogs, setEnsRecordLogs] = useState<string[]>([]);
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

    const privateKey = getEnvOrThrow('OPM_SIGNING_KEY', 'OPM_PRIVATE_KEY');

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

    updateStep('scan', 'running');
    let scanPassed = false;
    let finalReportURI: string | undefined;
    let finalRiskScore: number | undefined;
    let finalIpfsHash: string | undefined;
    let scanAgents: AgentEntry[] = [];
    try {
      const scanResult = await enqueueScan(name, version, (msg) =>
        setScanLogs((prev) => [...prev.slice(-8), msg]),
        { local: { tarballPath: tarballFile, pkgJsonPath }, skipOnChainScore: true },
      );

      const riskScore = scanResult.report.aggregate_risk_score;
      const riskLevel = classifyRisk(riskScore);
      finalReportURI = scanResult.reportURI;
      finalRiskScore = riskScore;
      finalIpfsHash = scanResult.ipfsHash;
      scanAgents = scanResult.report.agents || [];

      setResult((r) => ({
        ...r,
        riskScore,
        riskLevel,
        reportURI: scanResult.reportURI,
        agents: scanResult.report.agents,
      }));

      if (riskLevel === 'CRITICAL' || riskScore >= 80) {
        setResult((r) => ({
          ...r,
          blocked: true,
          blockReason: `Risk score ${riskScore}/100 (${riskLevel}) — too dangerous to publish`,
        }));
        updateStep('scan', 'error');
        updateStep('publish', 'blocked');
        updateStep('register', 'blocked');
        if (fs.existsSync(tarballFile)) fs.unlinkSync(tarballFile);
        return;
      }

      scanPassed = true;
      updateStep('scan', 'done');
    } catch (err: any) {
      setScanLogs((prev) => [...prev, `Scan: ${err?.message || 'failed'}`]);
      scanPassed = true;
      updateStep('scan', 'error');
    }

    if (!scanPassed) return;

    const originalPkgJsonContent = fs.readFileSync(pkgJsonPath, 'utf-8');
    pkgJson.opm = { signature, author: address, ensName, checksum };
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));

    updateStep('publish', 'running');
    const token = npmToken || process.env.NPM_TOKEN;
    const npmrcPath = path.resolve('.npmrc');
    const existingNpmrc = fs.existsSync(npmrcPath) ? fs.readFileSync(npmrcPath, 'utf-8') : null;

    let canPublish = false;
    if (token) {
      fs.writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${token}\n`);
      canPublish = true;
    } else {
      canPublish = (() => {
        try { execSync('npm whoami', { encoding: 'utf-8', stdio: 'pipe' }); return true; } catch { return false; }
      })();
    }

    if (canPublish) {
      try {
        let publishCmd = 'npm publish --access public';
        if (otp) publishCmd += ` --otp=${otp}`;
        execSync(publishCmd, { encoding: 'utf-8', stdio: 'pipe' });
        setResult((r) => ({
          ...r,
          npmUrl: `https://www.npmjs.com/package/${name}/v/${version}`,
        }));
      } catch (err: any) {
        const msg = err?.stderr || err?.stdout || err?.message || '';
        let reason = 'version may already exist';
        if (msg.includes('Two-factor') || msg.includes('2fa') || msg.includes('EOTP')) {
          reason = token
            ? '2FA enforced — your token needs "bypass 2FA" enabled, or use --otp <code>'
            : '2FA required — use: opm push --otp <code> or --token <automation-token>';
        } else if (msg.includes('E403')) {
          reason = 'forbidden — check npm token permissions';
        } else if (msg.includes('E402')) {
          reason = 'payment required — scoped packages need npm Pro';
        } else {
          const lines = msg.split('\n').filter((l: string) => l.trim().length > 0);
          const errorLine = lines.find((l: string) =>
            (l.includes('npm error') || l.includes('ERR!')) && !l.includes('npm notice'),
          );
          if (errorLine) reason = errorLine.replace(/^npm\s+(error|ERR!)\s*/i, '').trim();
        }
        setResult((r) => ({ ...r, npmError: reason.slice(0, 150) }));
      }
    } else {
      setResult((r) => ({ ...r, npmError: 'not authenticated — use: opm push --token <npm-token>' }));
    }

    if (token) {
      if (existingNpmrc !== null) {
        fs.writeFileSync(npmrcPath, existingNpmrc);
      } else if (fs.existsSync(npmrcPath)) {
        fs.unlinkSync(npmrcPath);
      }
    }
    updateStep('publish', 'done');

    fs.writeFileSync(pkgJsonPath, originalPkgJsonContent);

    updateStep('register', 'running');
    try {
      const sigBytes = new Uint8Array(Buffer.from(signature.slice(2), 'hex'));
      const txHash = await registerPackageOnChain(name, version, checksum, sigBytes, ensName);
      setResult((r) => ({ ...r, txHash }));

      // Submit individual agent scores now that the version exists on-chain
      for (const agent of scanAgents) {
        try {
          setScanLogs((prev) => [...prev.slice(-8), `[${agent.agent_id}] Submitting score (${agent.result.risk_score}) to contract...`]);
          await submitScoreOnChain(name, version, agent.result.risk_score, agent.result.reasoning);
          setScanLogs((prev) => [...prev.slice(-8), `[${agent.agent_id}] Score submitted on-chain ✓`]);
        } catch (err: any) {
          setScanLogs((prev) => [...prev.slice(-8), `[${agent.agent_id}] Score submission: ${err?.shortMessage || err?.message || 'failed'}`]);
        }
      }

      // Set report URI on-chain
      if (finalReportURI) {
        try {
          await setReportURIOnChain(name, version, finalReportURI);
          setScanLogs((prev) => [...prev.slice(-8), 'Report URI stored on-chain ✓']);
        } catch (err: any) {
          setScanLogs((prev) => [...prev.slice(-8), `Report URI: ${err?.shortMessage || err?.message || 'failed'}`]);
        }
      }
    } catch (err: any) {
      setScanLogs((prev) => [...prev, `Registration: ${err?.shortMessage || err?.message || 'failed'}`]);
    }
    updateStep('register', 'done');

    // ── Write package metadata to ENS text records ──
    if (ensName) {
      updateStep('ensRecords', 'running');
      const ensLog = (msg: string) => setEnsRecordLogs((prev) => [...prev, msg]);
      try {
        ensLog(`Reading existing records from ${ensName}...`);
        const existingRecords = await readOPMRecords(ensName);
        const records = buildOPMRecords({
          packageName: name,
          version,
          checksum,
          signature,
          reportURI: finalReportURI,
          riskScore: finalRiskScore,
          existingPackages: existingRecords.packages,
        });

        const writeResult = await writeENSRecords(
          ensName,
          privateKey,
          records,
          ensLog,
        );

        if (writeResult) {
          setResult((r) => ({
            ...r,
            ensRecordsTx: writeResult.txHash,
            ensRecordsChain: writeResult.chain,
            ensRecordsCount: writeResult.recordCount,
          }));
        } else {
          ensLog(`Hint: signer needs ETH on Ethereum (Sepolia or Mainnet) for gas, and must be the manager of ${ensName}`);
        }

        let ipfsCid = finalIpfsHash;
        if (!ipfsCid && finalReportURI) {
          const fvLink = parseFileverseLink(finalReportURI);
          if (fvLink) {
            ensLog(`Reading IPFS hash from Fileverse contract ${fvLink.portalAddress.slice(0, 10)}... file #${fvLink.fileId}`);
            ipfsCid = (await readFileverseContentHash(fvLink.portalAddress, fvLink.fileId, ensLog)) ?? undefined;
          }
        }
        if (ipfsCid) {
          const chResult = await setENSContenthash(ensName, privateKey, ipfsCid, ensLog);
          if (chResult) {
            setResult((r) => ({ ...r, ipfsContenthash: ipfsCid }));
          }
        }

        const subResult = await createPackageSubname(
          ensName,
          name,
          privateKey,
          records,
          ensLog,
        );
        if (subResult) {
          setResult((r) => ({ ...r, ensSubname: subResult.subname }));
        }
      } catch (err: any) {
        ensLog(`Error: ${err?.message || 'unknown'}`);
      }
      updateStep('ensRecords', 'done');
    } else {
      updateStep('ensRecords', 'skip');
    }

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
      <StatusLine label="Security scan (3 agents)" status={steps.scan} />

      {scanLogs.length > 0 && (
        <Box flexDirection="column" marginLeft={4}>
          {scanLogs.map((log, i) => (
            <Text key={i} color="gray">{log}</Text>
          ))}
        </Box>
      )}

      {result.agents && result.agents.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Text color="white" bold> Agent Results</Text>
          {result.agents.map((agent) => {
            const intel = agent.model_intelligence || 0;
            const coding = agent.model_coding || 0;
            const weight = agent.model_weight || 0;
            return (
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
                  <Text color="magenta">AI Index: {intel}</Text>
                  <Text color="gray"> | </Text>
                  <Text color="blue">Coding: {coding}</Text>
                  <Text color="gray"> | </Text>
                  <Text color="cyan">Weight: {weight}</Text>
                </Box>
                <Box marginLeft={2}>
                  <Text color="gray" wrap="wrap">{agent.result.reasoning.slice(0, 200)}</Text>
                </Box>
                {agent.result.vulnerabilities.length > 0 && (
                  <Box marginLeft={2}>
                    <Text color="yellow">{agent.result.vulnerabilities.length} vulnerabilities found</Text>
                  </Box>
                )}
                {agent.score_tx_hash && (
                  <Box marginLeft={2}>
                    <Text color="gray">⛓  </Text>
                    <Hyperlink url={txUrl(agent.score_tx_hash)} label={`score tx ${agent.score_tx_hash.slice(0, 10)}…`} color="cyan" />
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {result.riskScore !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Box>
            <Text color="white" bold> Aggregate Risk (intelligence-weighted): </Text>
            <RiskBadge level={classifyRisk(result.riskScore)} score={result.riskScore} />
          </Box>
        </Box>
      )}

      {result.blocked && (
        <Box marginLeft={2} marginTop={1}>
          <Text color="red" bold>✗ BLOCKED: {result.blockReason}</Text>
        </Box>
      )}

      {!result.blocked && (
        <>
          <StatusLine label="Publish to npm" status={steps.publish} />
          {steps.publish === 'done' && (
            <Box marginLeft={4}>
              {result.npmUrl ? (
                <Text color="green">✓ <Text color="blue">{result.npmUrl}</Text></Text>
              ) : result.npmError ? (
                <Text color="yellow">⚠ {result.npmError}</Text>
              ) : null}
            </Box>
          )}
          <StatusLine label="Register on-chain" status={steps.register} detail={result.txHash?.slice(0, 16)} />
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
          <StatusLine label="Write ENS records" status={steps.ensRecords}
            detail={steps.ensRecords === 'skip' ? 'no ENS name' : steps.ensRecords === 'done' && result.ensRecordsCount ? `${result.ensRecordsCount} records` : undefined} />
          {steps.ensRecords === 'done' && result.ensRecordsTx && (
            <Box flexDirection="column" marginLeft={4}>
              <Box>
                <Text color="gray">Chain: </Text>
                <Text color="cyan">{result.ensRecordsChain}</Text>
                <Text color="gray"> | </Text>
                <Hyperlink url={`https://${result.ensRecordsChain === 'sepolia' ? 'sepolia.' : ''}etherscan.io/tx/${result.ensRecordsTx}`} label={`tx ${result.ensRecordsTx.slice(0, 10)}...`} color="green" />
              </Box>
              <Box>
                <Text color="gray">Records: </Text>
                <Text color="white">url, opm.version, opm.checksum, opm.fileverse, opm.risk_score{result.ipfsContenthash ? ', contenthash' : ''}</Text>
              </Box>
              {result.ensSubname && (
                <Box>
                  <Text color="gray">Subname: </Text>
                  <Text color="cyan" bold>{result.ensSubname}</Text>
                </Box>
              )}
            </Box>
          )}
          {ensRecordLogs.length > 0 && (
            <Box flexDirection="column" marginLeft={4}>
              {ensRecordLogs.map((log, i) => (
                <Text key={i} color={log.startsWith('Hint:') || log.startsWith('Error:') ? 'yellow' : 'gray'}>{log}</Text>
              ))}
            </Box>
          )}
        </>
      )}

      {result.reportURI && (
        <Box flexDirection="column" marginLeft={1} marginTop={1}>
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
              <Hyperlink url={result.reportURI} />
            </Box>
          )}
        </Box>
      )}

      {error && <Text color="red">Error: {error}</Text>}
    </Box>
  );
}
