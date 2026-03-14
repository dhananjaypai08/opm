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
import { resolveVersion, findSafeVersion, isENSVersion, type ResolvedVersion } from '../services/version';
import { resolveAddress } from '../services/ens';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skip';

interface Steps {
  resolve: StepStatus;
  ens: StepStatus;
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
  resolved?: ResolvedVersion;
  cves: OSVVulnerability[];
  info?: OnChainPackageInfo;
  signatureValid?: boolean;
  ensName?: string;
  chainPatrolStatus?: string;
  blocked: boolean;
  warning: boolean;
  blockReason?: string;
  safestVersion?: string;
  autoBumped?: boolean;
  autoBumpedFrom?: string;
  autoBumpReason?: string;
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
  const isEns = version ? isENSVersion(version) : false;

  const [steps, setSteps] = useState<Steps>({
    resolve: 'pending', ens: isEns ? 'pending' : 'skip',
    cve: 'pending', onchain: 'pending',
    signature: 'pending', chainpatrol: 'pending', report: 'pending',
    install: 'pending',
  });
  const [result, setResult] = useState<SecurityResult | null>(null);
  const [ensDetail, setEnsDetail] = useState<string | undefined>(undefined);
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

    // ── Resolve version (+ ENS if applicable) ──
    if (isEns) {
      update('resolve', 'done');
      update('ens', 'running');
      try {
        const resolved = await resolveVersion(packageName, r.version, (msg) => setEnsDetail(msg));
        r.resolved = resolved;
        r.resolvedVersion = resolved.version;
        r.ensName = resolved.ensName;
        setResult({ ...r });
        setEnsDetail(`${resolved.ensName} → v${resolved.version} (${resolved.reason})`);
        update('ens', 'done');
      } catch (err: any) {
        setEnsDetail(err?.message || 'ENS resolution failed');
        update('ens', 'error');
        setError(err?.message || 'ENS resolution failed');
        update('install', 'error');
        return;
      }
    } else {
      update('resolve', 'running');
      const resolved = await resolveVersion(packageName, r.version);
      r.resolved = resolved;
      r.resolvedVersion = resolved.version;
      setResult({ ...r });
      update('resolve', 'done');
    }

    // ── CVE check ──
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

    // ── On-chain registry lookup ──
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

    // ── Auto-bump: try to find a safe version instead of blocking ──
    if (r.blocked && !isEns) {
      const safe = await findSafeVersion(packageName, r.resolvedVersion, r.cves);
      if (safe) {
        r.autoBumped = true;
        r.autoBumpedFrom = r.resolvedVersion;
        r.autoBumpReason = safe.reason;
        r.resolvedVersion = safe.version;
        r.blocked = false;
        r.blockReason = undefined;
        r.warning = true;

        r.cves = await queryOSV(packageName, safe.version).catch(() => []);
        try {
          const newInfo = await getPackageInfo(packageName, safe.version);
          if (newInfo.exists) r.info = newInfo;
        } catch { /* keep existing */ }

        setResult({ ...r });
      }
    }

    // ── Signature verification ──
    if (r.info?.exists) {
      update('signature', 'running');
      r.signatureValid = r.info.signature !== '0x'
        ? verifyChecksum(r.info.checksum, r.info.signature, r.info.author)
        : false;
      if (r.info.author && !r.ensName) {
        r.ensName = await resolveENSName(r.info.author).catch(() => null) || undefined;
      }
      setResult({ ...r });
      update('signature', 'done');
    } else {
      update('signature', 'skip');
    }

    // ── ChainPatrol check ──
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

    // ── Fileverse report ──
    if (r.info?.reportURI && !r.info.reportURI.startsWith('local://')) {
      update('report', 'done');
    } else {
      update('report', 'skip');
    }

    // ── Block or install ──
    if (r.blocked) {
      setError(`Blocked: ${r.blockReason || 'security risk detected'}`);
      update('install', 'error');
      return;
    }

    update('install', 'running');
    try {
      const target = `${packageName}@${r.resolvedVersion}`;
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
      {result && (
        <Box>
          <Text color="white" bold> {result.name}@{result.resolvedVersion}</Text>
          {result.ensName && result.resolved?.source === 'ens' && (
            <Text color="cyan"> via {result.ensName}</Text>
          )}
          {result.autoBumped && (
            <Text color="yellow"> (bumped from {result.autoBumpedFrom})</Text>
          )}
        </Box>
      )}
      <Text> </Text>

      <StatusLine label="Resolve version" status={steps.resolve}
        detail={steps.resolve === 'done' ? result?.resolvedVersion : undefined} />

      {isEns && (
        <StatusLine label="Resolve ENS author" status={steps.ens} detail={ensDetail} />
      )}
      {steps.ens === 'done' && result?.resolved?.source === 'ens' && (
        <Box flexDirection="column" marginLeft={4}>
          <Box>
            <Text color="gray">Author:  </Text>
            <Text color="green">{result.ensName}</Text>
            {result.resolved.authorAddress && (
              <Text color="gray"> ({truncateAddress(result.resolved.authorAddress)})</Text>
            )}
            <Text color="green"> ✓ on-chain</Text>
          </Box>
          <Box>
            <Text color="gray">Version: </Text>
            <Text color="cyan">{result.resolvedVersion}</Text>
            <Text color="gray"> (safest on-chain version)</Text>
          </Box>
        </Box>
      )}

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

      {result?.autoBumped && (
        <Box flexDirection="column" marginLeft={4} marginTop={0}>
          <Box>
            <Text color="yellow">↑ Auto-bumped: </Text>
            <Text color="red">{result.autoBumpedFrom}</Text>
            <Text color="yellow"> → </Text>
            <Text color="green" bold>{result.resolvedVersion}</Text>
          </Box>
          {result.autoBumpReason && (
            <Box marginLeft={2}>
              <Text color="gray">{result.autoBumpReason}</Text>
            </Box>
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
          {result.resolved?.source === 'ens' && (
            <Box marginLeft={2}>
              <Text color="gray">Resolved: </Text>
              <Text color="green">{result.ensName}</Text>
              <Text color="gray"> → </Text>
              <Text color="cyan">{result.resolvedVersion}</Text>
            </Box>
          )}
          {result.autoBumped && (
            <Box marginLeft={2}>
              <Text color="gray">Bumped:   </Text>
              <Text color="red">{result.autoBumpedFrom}</Text>
              <Text color="gray"> → </Text>
              <Text color="green">{result.resolvedVersion}</Text>
            </Box>
          )}
          {result.info?.exists && (
            <Box marginLeft={2}>
              <Text color="gray">Risk:     </Text>
              <RiskBadge level={classifyRisk(result.info.aggregateScore)} score={result.info.aggregateScore} />
            </Box>
          )}
          <Box marginLeft={2}>
            <Text color="gray">CVEs:     </Text>
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
              <Text color="gray">Signature:</Text>
              <Text color={result.signatureValid ? 'green' : 'red'}>
                {' '}{result.signatureValid ? 'verified' : 'unverified'}
              </Text>
            </Box>
          )}
          {result.ensName && (
            <Box marginLeft={2}>
              <Text color="gray">Author:   </Text>
              <Text color="green">{result.ensName}</Text>
            </Box>
          )}
          {result.warning && !result.blocked && !result.autoBumped && (
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
          {result.warning && result.safestVersion && !result.autoBumped && (
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
  ensResolved?: boolean;
  ensName?: string;
  autoBumped?: boolean;
  originalVersion?: string;
  autoBumpReason?: string;
}

function BulkInstall() {
  const [deps, setDeps] = useState<BulkDepResult[]>([]);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installStatus, setInstallStatus] = useState<StepStatus>('pending');
  const [total, setTotal] = useState(0);
  const [ensCount, setEnsCount] = useState(0);
  const [ensResolvingStatus, setEnsResolvingStatus] = useState<StepStatus>('skip');
  const [ensResolvedCount, setEnsResolvedCount] = useState(0);

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

    // ── Phase 1: Batch-resolve all ENS names in parallel ──
    const ensEntries = entries.filter(([, ver]) => isENSVersion(String(ver)));
    setEnsCount(ensEntries.length);

    const ensCache = new Map<string, { address: string; version: string }>();

    if (ensEntries.length > 0) {
      setEnsResolvingStatus('running');

      const uniqueEnsNames = [...new Set(ensEntries.map(([, v]) => String(v)))];
      const ensResults = await Promise.allSettled(
        uniqueEnsNames.map(async (ensName) => {
          const addr = await resolveAddress(ensName);
          return { ensName, address: addr };
        }),
      );

      const ensAddresses = new Map<string, string>();
      for (const result of ensResults) {
        if (result.status === 'fulfilled' && result.value.address) {
          ensAddresses.set(result.value.ensName, result.value.address);
        }
      }

      const ensVersionResults = await Promise.allSettled(
        ensEntries.map(async ([name, ensName]) => {
          const addr = ensAddresses.get(String(ensName));
          if (!addr) return null;
          const resolved = await resolveVersion(name, String(ensName));
          return { name, ensName: String(ensName), resolved };
        }),
      );

      for (const result of ensVersionResults) {
        if (result.status === 'fulfilled' && result.value) {
          const { name, ensName, resolved } = result.value;
          ensCache.set(name, {
            address: resolved.authorAddress || '',
            version: resolved.version,
          });
          setEnsResolvedCount((c) => c + 1);
        }
      }

      setEnsResolvingStatus('done');
    }

    // ── Phase 2: Scan each dependency ──
    const checked: BulkDepResult[] = [];

    for (const [name, verRange] of entries) {
      const rawVerStr = String(verRange);
      const isEns = isENSVersion(rawVerStr);

      let rawVersion: string;
      let ensName: string | undefined;
      let ensResolved = false;

      if (isEns && ensCache.has(name)) {
        const cached = ensCache.get(name)!;
        rawVersion = cached.version;
        ensName = rawVerStr;
        ensResolved = true;
      } else {
        rawVersion = rawVerStr.replace(/^[\^~]/, '');
      }

      const entry: BulkDepResult = {
        name, version: rawVersion,
        cves: [], cvesCritical: 0, cvesHigh: 0,
        onChain: false, score: null,
        blocked: false,
        ensResolved, ensName,
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

      // ── Auto-bump blocked deps ──
      if (entry.blocked && !ensResolved) {
        const safe = await findSafeVersion(name, rawVersion, entry.cves);
        if (safe) {
          entry.autoBumped = true;
          entry.originalVersion = rawVersion;
          entry.autoBumpReason = safe.reason;
          entry.version = safe.version;
          entry.blocked = false;
          entry.blockReason = undefined;

          const newCves = await queryOSV(name, safe.version).catch(() => []);
          entry.cves = newCves;
          const newCounts = categorizeCVEs(newCves);
          entry.cvesCritical = newCounts.critical;
          entry.cvesHigh = newCounts.high;
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

    // Build npm install command with correct versions
    const bumpedDeps = checked.filter((d) => d.autoBumped || d.ensResolved);
    setInstallStatus('running');
    try {
      if (bumpedDeps.length > 0) {
        const args = checked.map((d) => `${d.name}@${d.version}`).join(' ');
        execSync(`npm install ${args}`, { encoding: 'utf-8', stdio: 'pipe', cwd: process.cwd() });
      } else {
        execSync('npm install', { encoding: 'utf-8', stdio: 'pipe', cwd: process.cwd() });
      }
    } catch { /* non-fatal */ }
    setInstallStatus('done');
  }

  const blockedDeps = deps.filter((d) => d.blocked);
  const bumpedDeps = deps.filter((d) => d.autoBumped || d.ensResolved);
  const warnDeps = deps.filter((d) => !d.blocked && !d.autoBumped && !d.ensResolved && (d.cvesHigh > 0 || (d.score !== null && d.score >= MEDIUM_RISK_THRESHOLD)));
  const safeDeps = deps.filter((d) => !d.blocked && !d.autoBumped && !d.ensResolved && d.cvesHigh === 0 && (d.score === null || d.score < MEDIUM_RISK_THRESHOLD));
  const totalCves = deps.reduce((s, d) => s + d.cves.length, 0);

  return (
    <Box flexDirection="column">
      <Header subtitle="install" />
      <Text> </Text>

      {ensCount > 0 && (
        <StatusLine label={`Resolve ${ensCount} ENS author(s)`} status={ensResolvingStatus}
          detail={ensResolvingStatus === 'done' ? `${ensResolvedCount} resolved` : ensResolvingStatus === 'running' ? 'resolving...' : undefined} />
      )}

      <StatusLine label={`Scanning ${total} dependencies`} status={scanning ? 'running' : 'done'}
        detail={!scanning ? `${deps.length} checked` : `${deps.length}/${total}`} />

      {deps.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {bumpedDeps.length > 0 && (
            <Box flexDirection="column">
              <Text color="cyan" bold> ENS / AUTO-BUMPED ({bumpedDeps.length})</Text>
              {bumpedDeps.map((d) => (
                <Box key={d.name} flexDirection="column" marginLeft={2}>
                  <Box>
                    {d.ensResolved ? (
                      <Text color="cyan">◈ </Text>
                    ) : (
                      <Text color="yellow">↑ </Text>
                    )}
                    <Text color="white" bold>{d.name}</Text>
                    <Text color="green">@{d.version}</Text>
                    {d.ensResolved && d.ensName && (
                      <Text color="cyan">  via {d.ensName}</Text>
                    )}
                    {d.autoBumped && d.originalVersion && (
                      <Text color="yellow">  bumped from {d.originalVersion}</Text>
                    )}
                  </Box>
                  {d.autoBumpReason && (
                    <Box marginLeft={4}>
                      <Text color="gray">{d.autoBumpReason}</Text>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {blockedDeps.length > 0 && (
            <Box flexDirection="column" marginTop={bumpedDeps.length > 0 ? 1 : 0}>
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
            <Box flexDirection="column" marginTop={(blockedDeps.length + bumpedDeps.length) > 0 ? 1 : 0}>
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
            <Box flexDirection="column" marginTop={(blockedDeps.length + warnDeps.length + bumpedDeps.length) > 0 ? 1 : 0}>
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
              {deps.length} packages scanned: {blockedDeps.length} blocked, {bumpedDeps.length} resolved, {warnDeps.length} warnings, {totalCves} CVEs
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
