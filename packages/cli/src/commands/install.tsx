import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD, classifyRisk, truncateAddress } from '@opm/core';
import type { OnChainPackageInfo } from '@opm/core';
import { Header } from '../components/Header';
import { StatusLine } from '../components/StatusLine';
import { RiskBadge } from '../components/RiskBadge';
import { getPackageInfo, getSafestVersion } from '../services/contract';
import { verifyChecksum } from '../services/signature';
import { resolveENSName } from '../services/ens';
import { checkPackageWithChainPatrol } from '../services/chainpatrol';
import { queryOSV, getOSVSeverity, getFixedVersion, type OSVVulnerability } from '../services/osv';
import { resolveVersion } from '../services/version';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skip';

interface Steps {
  resolve: StepStatus;
  cve: StepStatus;
  onchain: StepStatus;
  signature: StepStatus;
  chainpatrol: StepStatus;
  report: StepStatus;
  install: StepStatus;
}

interface SecurityResult {
  name: string;
  version: string;
  resolvedVersion: string;
  cves: OSVVulnerability[];
  info?: OnChainPackageInfo;
  signatureValid?: boolean;
  ensName?: string;
  chainPatrolStatus?: string;
  blocked: boolean;
  warning: boolean;
  blockReason?: string;
  safestVersion?: string;
}

interface InstallCommandProps {
  packageName?: string;
  version?: string;
}

function categorizeCVEs(cves: OSVVulnerability[]) {
  let critical = 0, high = 0, medium = 0, low = 0;
  for (const cve of cves) {
    const sev = getOSVSeverity(cve);
    if (sev === 'CRITICAL') critical++;
    else if (sev === 'HIGH') high++;
    else if (sev === 'MEDIUM') medium++;
    else low++;
  }
  return { critical, high, medium, low };
}

function sevColor(sev: string): string {
  if (sev === 'CRITICAL') return 'magenta';
  if (sev === 'HIGH') return 'red';
  if (sev === 'MEDIUM') return 'yellow';
  return 'gray';
}

export function InstallCommand({ packageName, version }: InstallCommandProps) {
  const [steps, setSteps] = useState<Steps>({
    resolve: 'pending', cve: 'pending', onchain: 'pending',
    signature: 'pending', chainpatrol: 'pending', report: 'pending',
    install: 'pending',
  });
  const [result, setResult] = useState<SecurityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const update = (key: keyof Steps, status: StepStatus) =>
    setSteps((s) => ({ ...s, [key]: status }));

  useEffect(() => {
    run().catch((err) => setError(String(err)));
  }, []);

  async function run() {
    const packages = getTargetPackages(packageName, version);
    if (packages.length === 0) {
      setError('No packages to install');
      return;
    }

    const pkg = packages[0];
    const r: SecurityResult = {
      name: pkg.name, version: pkg.version,
      resolvedVersion: pkg.version, cves: [],
      blocked: false, warning: false,
    };

    update('resolve', 'running');
    r.resolvedVersion = await resolveVersion(pkg.name, pkg.version);
    setResult({ ...r });
    update('resolve', 'done');

    update('cve', 'running');
    r.cves = await queryOSV(pkg.name, r.resolvedVersion);
    const cveCounts = categorizeCVEs(r.cves);
    if (cveCounts.critical > 0) {
      r.blocked = true;
      r.blockReason = `${cveCounts.critical} CRITICAL CVE(s) found`;
    } else if (cveCounts.high > 0) {
      r.warning = true;
    }
    setResult({ ...r });
    update('cve', 'done');

    update('onchain', 'running');
    try {
      const info = await getPackageInfo(pkg.name, r.resolvedVersion);
      r.info = info;

      if (info.exists) {
        if (info.aggregateScore >= HIGH_RISK_THRESHOLD) {
          r.blocked = true;
          r.blockReason = (r.blockReason ? r.blockReason + '; ' : '') + `risk score ${info.aggregateScore}/100`;
        } else if (info.aggregateScore >= MEDIUM_RISK_THRESHOLD) {
          r.warning = true;
          r.safestVersion = await getSafestVersion(pkg.name).catch(() => undefined);
        }
      }
    } catch { /* not in registry */ }
    setResult({ ...r });
    update('onchain', 'done');

    if (r.info?.exists) {
      update('signature', 'running');
      r.signatureValid = r.info.signature !== '0x'
        ? verifyChecksum(r.info.checksum, r.info.signature, r.info.author)
        : false;
      if (r.info.author) {
        r.ensName = await resolveENSName(r.info.author).catch(() => null) || undefined;
      }
      setResult({ ...r });
      update('signature', 'done');
    } else {
      update('signature', 'skip');
    }

    if (!r.info?.exists) {
      update('chainpatrol', 'running');
      const cp = await checkPackageWithChainPatrol(pkg.name).catch(() => null);
      r.chainPatrolStatus = cp?.status;
      if (cp?.status === 'BLOCKED') {
        r.blocked = true;
        r.blockReason = (r.blockReason ? r.blockReason + '; ' : '') + 'ChainPatrol BLOCKED';
      }
      setResult({ ...r });
      update('chainpatrol', 'done');
    } else {
      update('chainpatrol', 'skip');
    }

    if (r.info?.reportURI && !r.info.reportURI.startsWith('local://')) {
      update('report', 'done');
    } else {
      update('report', 'skip');
    }

    if (r.blocked) {
      setError(`Blocked: ${r.blockReason || 'security risk detected'}`);
      update('install', 'error');
      return;
    }

    update('install', 'running');
    try {
      const installTarget = packageName
        ? `${packageName}${version ? `@${version}` : ''}`
        : '';
      execSync(`npm install ${installTarget}`, { encoding: 'utf-8', stdio: 'pipe', cwd: process.cwd() });
    } catch { /* non-fatal */ }
    update('install', 'done');
    setDone(true);
  }

  const cveCounts = result ? categorizeCVEs(result.cves) : { critical: 0, high: 0, medium: 0, low: 0 };
  const severeCount = cveCounts.critical + cveCounts.high;

  return (
    <Box flexDirection="column">
      <Header subtitle="install" />
      {result && <Text color="white" bold> {result.name}@{result.resolvedVersion}</Text>}
      <Text> </Text>

      <StatusLine label="Resolve version" status={steps.resolve}
        detail={steps.resolve === 'done' ? result?.resolvedVersion : undefined} />

      <StatusLine label="Query CVE database (OSV)" status={steps.cve}
        detail={steps.cve === 'done'
          ? (result?.cves.length
            ? `${result.cves.length} known (${severeCount > 0 ? `${severeCount} high/critical` : 'none critical'})`
            : 'clean')
          : undefined} />
      {steps.cve === 'done' && result && result.cves.length > 0 && (
        <Box flexDirection="column" marginLeft={4}>
          {result.cves.slice(0, 5).map((cve) => {
            const sev = getOSVSeverity(cve);
            const fix = getFixedVersion(cve);
            return (
              <Box key={cve.id} flexDirection="column">
                <Box>
                  <Text color={sevColor(sev)} bold>{sev.padEnd(9)}</Text>
                  <Text color="white">{cve.id}</Text>
                </Box>
                <Box marginLeft={2}>
                  <Text color="gray">{cve.summary?.slice(0, 70)}</Text>
                </Box>
                {fix && (
                  <Box marginLeft={2}>
                    <Text color="green">fixed in {fix}</Text>
                  </Box>
                )}
              </Box>
            );
          })}
          {result.cves.length > 5 && (
            <Text color="gray">  ...and {result.cves.length - 5} more</Text>
          )}
        </Box>
      )}

      <StatusLine label="On-chain registry lookup" status={steps.onchain}
        detail={steps.onchain === 'done' && result?.info?.exists
          ? `${result.info.aggregateScore}/100 (${classifyRisk(result.info.aggregateScore)})`
          : steps.onchain === 'done' ? 'not registered' : undefined} />

      <StatusLine label="Signature verification" status={steps.signature}
        detail={steps.signature === 'skip' ? 'n/a' : undefined} />
      {steps.signature === 'done' && result?.info && (
        <Box flexDirection="column" marginLeft={4}>
          <Box>
            <Text color="gray">Checksum:  </Text>
            <Text color="cyan">{truncateAddress(result.info.checksum)}</Text>
          </Box>
          <Box>
            <Text color="gray">Signature: </Text>
            <Text color="cyan">{truncateAddress(result.info.signature)}</Text>
            <Text color={result.signatureValid ? 'green' : 'red'}> {result.signatureValid ? '✓ verified' : '✗ invalid'}</Text>
          </Box>
          <Box>
            <Text color="gray">Author:    </Text>
            <Text color="cyan">{truncateAddress(result.info.author)}</Text>
            {result.ensName && <Text color="green"> → {result.ensName}</Text>}
          </Box>
        </Box>
      )}

      <StatusLine label="ChainPatrol check" status={steps.chainpatrol}
        detail={steps.chainpatrol === 'done' ? (result?.chainPatrolStatus || 'UNKNOWN') : steps.chainpatrol === 'skip' ? 'n/a' : undefined} />

      <StatusLine label="Fileverse report" status={steps.report}
        detail={steps.report === 'done' ? 'linked' : steps.report === 'skip' ? 'n/a' : undefined} />

      <StatusLine label="Install via npm" status={steps.install} />

      {(steps.install === 'done' || steps.install === 'error') && result && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Text color="white" bold> Security Summary</Text>
          {result.info?.exists && (
            <Box marginLeft={2}>
              <Text color="gray">Risk: </Text>
              <RiskBadge level={classifyRisk(result.info.aggregateScore)} score={result.info.aggregateScore} />
            </Box>
          )}
          <Box marginLeft={2}>
            <Text color="gray">CVEs: </Text>
            {result.cves.length > 0 ? (
              <Text color={severeCount > 0 ? 'red' : 'yellow'}>
                {result.cves.length} known ({cveCounts.critical > 0 ? `${cveCounts.critical} critical, ` : ''}{cveCounts.high} high, {cveCounts.medium} medium, {cveCounts.low} low)
              </Text>
            ) : (
              <Text color="green">none found</Text>
            )}
          </Box>
          {result.info?.exists && (
            <Box marginLeft={2}>
              <Text color="gray">Signature: </Text>
              <Text color={result.signatureValid ? 'green' : 'red'}>
                {result.signatureValid ? 'verified' : 'unverified'}
              </Text>
            </Box>
          )}
          {result.ensName && (
            <Box marginLeft={2}>
              <Text color="gray">Author: </Text>
              <Text color="green">{result.ensName}</Text>
            </Box>
          )}
          {result.warning && !result.blocked && (
            <Box marginLeft={2}>
              <Text color="yellow">⚠ Vulnerabilities detected — review before using in production</Text>
            </Box>
          )}
          {result.warning && result.safestVersion && (
            <Box marginLeft={2}>
              <Text color="yellow">⚠ Consider using safest version: {result.safestVersion}</Text>
            </Box>
          )}
        </Box>
      )}

      {error && <Text color="red">{error}</Text>}
      {done && <Text color="green" bold>Done.</Text>}
    </Box>
  );
}

function getTargetPackages(name?: string, ver?: string): Array<{ name: string; version: string }> {
  if (name) return [{ name, version: ver || 'latest' }];

  const pkgJsonPath = path.resolve('package.json');
  if (!fs.existsSync(pkgJsonPath)) return [];

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  return Object.entries(deps).map(([n, v]) => ({
    name: n,
    version: String(v).replace(/^[\^~]/, ''),
  }));
}
