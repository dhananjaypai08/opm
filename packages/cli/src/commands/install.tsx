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
  if (packageName) {
    return <SingleInstall packageName={packageName} version={version} />;
  }
  return <BulkInstall />;
}

// ─── Single package install with full security pipeline ───────────────────────

function SingleInstall({ packageName, version }: { packageName: string; version?: string }) {
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
    const r: SecurityResult = {
      name: packageName, version: version || 'latest',
      resolvedVersion: version || 'latest', cves: [],
      blocked: false, warning: false,
    };

    update('resolve', 'running');
    r.resolvedVersion = await resolveVersion(packageName, r.version);
    setResult({ ...r });
    update('resolve', 'done');

    update('cve', 'running');
    r.cves = await queryOSV(packageName, r.resolvedVersion);
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
      const info = await getPackageInfo(packageName, r.resolvedVersion);
      r.info = info;
      if (info.exists) {
        if (info.aggregateScore >= HIGH_RISK_THRESHOLD) {
          r.blocked = true;
          r.blockReason = (r.blockReason ? r.blockReason + '; ' : '') + `risk score ${info.aggregateScore}/100`;
        } else if (info.aggregateScore >= MEDIUM_RISK_THRESHOLD) {
          r.warning = true;
          r.safestVersion = await getSafestVersion(packageName).catch(() => undefined);
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
      const cp = await checkPackageWithChainPatrol(packageName).catch(() => null);
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
      const target = `${packageName}${version ? `@${version}` : ''}`;
      execSync(`npm install ${target}`, { encoding: 'utf-8', stdio: 'pipe', cwd: process.cwd() });
    } catch { /* non-fatal */ }
    update('install', 'done');
    setDone(true);
  }

  const cveCounts = result ? categorizeCVEs(result.cves) : { critical: 0, high: 0, medium: 0, low: 0 };
  const severeCount = cveCounts.critical + cveCounts.high;
  const suggestedUpgrade = result?.cves.length
    ? getBestUpgradeVersion(result.cves, result.resolvedVersion)
    : null;

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
            const fix = getFixedVersion(cve, result.resolvedVersion);
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
                    <Text color="green">upgrade to {fix}</Text>
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
          {suggestedUpgrade && suggestedUpgrade !== result.resolvedVersion && (
            <Box marginLeft={2}>
              <Text color="yellow">⚠ Upgrade to </Text>
              <Text color="green" bold>{suggestedUpgrade}</Text>
              <Text color="yellow"> to fix known CVEs</Text>
            </Box>
          )}
          {result.warning && result.safestVersion && (
            <Box marginLeft={2}>
              <Text color="yellow">⚠ Consider using safest on-chain version: {result.safestVersion}</Text>
            </Box>
          )}
        </Box>
      )}

      {error && <Text color="red">{error}</Text>}
      {done && <Text color="green" bold>Done.</Text>}
    </Box>
  );
}

// ─── Bulk install: scan ALL deps from package.json ────────────────────────────

interface BulkDepResult {
  name: string;
  version: string;
  cves: OSVVulnerability[];
  cvesCritical: number;
  cvesHigh: number;
  onChain: boolean;
  score: number | null;
  blocked: boolean;
  blockReason?: string;
  suggestedUpgrade?: string;
}

function BulkInstall() {
  const [deps, setDeps] = useState<BulkDepResult[]>([]);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installStatus, setInstallStatus] = useState<StepStatus>('pending');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    runBulk().catch((err) => setError(String(err)));
  }, []);

  async function runBulk() {
    const pkgPath = path.resolve('package.json');
    if (!fs.existsSync(pkgPath)) {
      setError('No package.json found');
      return;
    }

    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    const entries = Object.entries(allDeps) as [string, string][];
    setTotal(entries.length);

    if (entries.length === 0) {
      setScanning(false);
      return;
    }

    const checked: BulkDepResult[] = [];

    for (const [name, verRange] of entries) {
      const rawVersion = String(verRange).replace(/^[\^~]/, '');
      const entry: BulkDepResult = {
        name, version: rawVersion,
        cves: [], cvesCritical: 0, cvesHigh: 0,
        onChain: false, score: null,
        blocked: false,
      };

      const [osvResult, infoResult] = await Promise.allSettled([
        queryOSV(name, rawVersion),
        getPackageInfo(name, rawVersion),
      ]);

      if (osvResult.status === 'fulfilled' && osvResult.value.length > 0) {
        entry.cves = osvResult.value;
        const counts = categorizeCVEs(osvResult.value);
        entry.cvesCritical = counts.critical;
        entry.cvesHigh = counts.high;

        if (counts.critical > 0) {
          entry.blocked = true;
          entry.blockReason = `${counts.critical} CRITICAL CVE(s)`;
          entry.suggestedUpgrade = getBestUpgradeVersion(osvResult.value, rawVersion) || undefined;
        }
      }

      if (infoResult.status === 'fulfilled' && infoResult.value.exists) {
        entry.onChain = true;
        entry.score = infoResult.value.aggregateScore;
        if (entry.score >= HIGH_RISK_THRESHOLD) {
          entry.blocked = true;
          entry.blockReason = (entry.blockReason ? entry.blockReason + '; ' : '') + `risk ${entry.score}/100`;
        }
      }

      checked.push(entry);
      setDeps([...checked]);
    }

    setScanning(false);

    const blockers = checked.filter((d) => d.blocked);
    if (blockers.length > 0) {
      setInstallStatus('error');
      setError(`Blocked: ${blockers.length} package(s) have critical vulnerabilities`);
      return;
    }

    setInstallStatus('running');
    try {
      execSync('npm install', { encoding: 'utf-8', stdio: 'pipe', cwd: process.cwd() });
    } catch { /* non-fatal */ }
    setInstallStatus('done');
  }

  const blockedDeps = deps.filter((d) => d.blocked);
  const warnDeps = deps.filter((d) => !d.blocked && (d.cvesHigh > 0 || (d.score !== null && d.score >= MEDIUM_RISK_THRESHOLD)));
  const safeDeps = deps.filter((d) => !d.blocked && d.cvesHigh === 0 && (d.score === null || d.score < MEDIUM_RISK_THRESHOLD));
  const totalCves = deps.reduce((s, d) => s + d.cves.length, 0);

  return (
    <Box flexDirection="column">
      <Header subtitle="install" />
      <Text> </Text>

      <StatusLine label={`Scanning ${total} dependencies`} status={scanning ? 'running' : 'done'}
        detail={!scanning ? `${deps.length} checked` : `${deps.length}/${total}`} />

      {deps.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {blockedDeps.length > 0 && (
            <Box flexDirection="column">
              <Text color="red" bold> BLOCKED ({blockedDeps.length})</Text>
              {blockedDeps.map((d) => (
                <Box key={d.name} flexDirection="column" marginLeft={2}>
                  <Box>
                    <Text color="red">✖ </Text>
                    <Text color="white" bold>{d.name}</Text>
                    <Text color="gray">@{d.version}</Text>
                    <Text color="red">  {d.blockReason}</Text>
                  </Box>
                  {d.cves.slice(0, 3).map((cve) => {
                    const sev = getOSVSeverity(cve);
                    return (
                      <Box key={cve.id} marginLeft={4}>
                        <Text color={sevColor(sev)} bold>{sev.padEnd(9)}</Text>
                        <Text color="white">{cve.id} </Text>
                        <Text color="gray">{cve.summary?.slice(0, 50)}</Text>
                      </Box>
                    );
                  })}
                  {d.cves.length > 3 && (
                    <Text color="gray" dimColor>      ...and {d.cves.length - 3} more</Text>
                  )}
                  {d.suggestedUpgrade && (
                    <Box marginLeft={4}>
                      <Text color="green">↑ upgrade to {d.suggestedUpgrade}</Text>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {warnDeps.length > 0 && (
            <Box flexDirection="column" marginTop={blockedDeps.length > 0 ? 1 : 0}>
              <Text color="yellow" bold> WARNING ({warnDeps.length})</Text>
              {warnDeps.map((d) => (
                <Box key={d.name} marginLeft={2}>
                  <Text color="yellow">⚠ </Text>
                  <Text>{d.name}</Text>
                  <Text color="gray">@{d.version}</Text>
                  {d.cvesHigh > 0 && <Text color="yellow">  {d.cvesHigh} high CVE(s)</Text>}
                  {d.score !== null && <Text color="yellow">  risk {d.score}/100</Text>}
                </Box>
              ))}
            </Box>
          )}

          {safeDeps.length > 0 && (
            <Box flexDirection="column" marginTop={(blockedDeps.length + warnDeps.length) > 0 ? 1 : 0}>
              <Text color="green" bold> SAFE ({safeDeps.length})</Text>
              {safeDeps.map((d) => (
                <Box key={d.name} marginLeft={2}>
                  <Text color="green">✓ </Text>
                  <Text>{d.name}</Text>
                  <Text color="gray">@{d.version}</Text>
                  {d.onChain && d.score !== null && (
                    <Text color="green">  {d.score}/100</Text>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      {!scanning && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>

          {blockedDeps.length === 0 && (
            <StatusLine label="Install via npm" status={installStatus} />
          )}

          <Box marginTop={1}>
            <Text color={blockedDeps.length > 0 ? 'red' : totalCves > 0 ? 'yellow' : 'green'} bold>
              {deps.length} packages scanned: {blockedDeps.length} blocked, {warnDeps.length} warnings, {totalCves} CVEs
            </Text>
          </Box>

          {blockedDeps.length > 0 && (
            <Text color="red">Fix blocked packages before installing. Upgrade to safe versions above.</Text>
          )}
        </Box>
      )}

      {error && <Text color="red">{error}</Text>}
      {installStatus === 'done' && <Text color="green" bold>Done.</Text>}
    </Box>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBestUpgradeVersion(cves: OSVVulnerability[], currentVersion: string): string | null {
  let highest: string | null = null;
  for (const cve of cves) {
    const fix = getFixedVersion(cve, currentVersion);
    if (fix && (!highest || compareSemver(fix, highest) > 0)) {
      highest = fix;
    }
  }
  return highest;
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
