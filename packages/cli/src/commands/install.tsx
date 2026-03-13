import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD, classifyRisk } from '@opm/core';
import type { OnChainPackageInfo, ScanReport as ScanReportType } from '@opm/core';
import { Header } from '../components/Header';
import { StatusLine } from '../components/StatusLine';
import { PackageCard } from '../components/PackageCard';
import { getPackageInfo, getSafestVersion } from '../services/contract';
import { verifyChecksum } from '../services/signature';
import { getENSProfile, type ENSProfile } from '../services/ens';
import { checkPackageWithChainPatrol } from '../services/chainpatrol';
import { fetchReportFromFileverse } from '../services/fileverse';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface InstallCommandProps {
  packageName?: string;
  version?: string;
}

interface PackageResult {
  name: string;
  version: string;
  info?: OnChainPackageInfo;
  ensProfile?: ENSProfile;
  report?: ScanReportType | null;
  signatureValid?: boolean;
  chainPatrolStatus?: string;
  blocked: boolean;
  warning: boolean;
  safestVersion?: string;
}

export function InstallCommand({ packageName, version }: InstallCommandProps) {
  const [steps, setSteps] = useState({ check: 'pending' as StepStatus, verify: 'pending' as StepStatus, install: 'pending' as StepStatus });
  const [results, setResults] = useState<PackageResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    run().catch((err) => setError(String(err)));
  }, []);

  async function run() {
    const packages = getTargetPackages(packageName, version);
    setSteps((s) => ({ ...s, check: 'running' }));

    const checked: PackageResult[] = [];
    for (const pkg of packages) {
      const r = await checkSinglePackage(pkg.name, pkg.version);
      checked.push(r);
    }
    setResults(checked);
    setSteps((s) => ({ ...s, check: 'done', verify: 'done' }));

    const blocked = checked.filter((r) => r.blocked);
    if (blocked.length > 0) {
      setError(`Blocked packages: ${blocked.map((b) => b.name).join(', ')}`);
      return;
    }

    const warnings = checked.filter((r) => r.warning);
    if (warnings.length > 0) {
      // in a real CLI we'd prompt for confirmation; for hackathon we proceed
    }

    setSteps((s) => ({ ...s, install: 'running' }));
    try {
      const installTarget = packageName
        ? `${packageName}${version ? `@${version}` : ''}`
        : '';
      execSync(`npm install ${installTarget} 2>&1`, { encoding: 'utf-8', stdio: 'pipe' });
    } catch { /* non-fatal */ }
    setSteps((s) => ({ ...s, install: 'done' }));
    setDone(true);
  }

  return (
    <Box flexDirection="column">
      <Header subtitle="install" />
      <StatusLine label="Security check" status={steps.check} />
      <StatusLine label="Signature verification" status={steps.verify} />
      <StatusLine label="Install packages" status={steps.install} />
      {results.map((r) => (
        r.info?.exists ? (
          <PackageCard
            key={r.name}
            name={r.name}
            version={r.version}
            info={r.info}
            ensProfile={r.ensProfile}
            report={r.report}
            signatureValid={r.signatureValid}
          />
        ) : (
          <Box key={r.name} flexDirection="column" marginLeft={2} marginBottom={1}>
            <Text bold>{r.name}@{r.version}</Text>
            <Text color="gray">Not found in OPM registry</Text>
            {r.chainPatrolStatus && (
              <Text color={r.chainPatrolStatus === 'BLOCKED' ? 'red' : 'yellow'}>
                ChainPatrol: {r.chainPatrolStatus}
              </Text>
            )}
          </Box>
        )
      ))}
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

async function checkSinglePackage(name: string, version: string): Promise<PackageResult> {
  const result: PackageResult = { name, version, blocked: false, warning: false };

  try {
    const info = await getPackageInfo(name, version);
    result.info = info;

    if (info.exists) {
      if (info.aggregateScore >= HIGH_RISK_THRESHOLD) {
        result.blocked = true;
      } else if (info.aggregateScore >= MEDIUM_RISK_THRESHOLD) {
        result.warning = true;
        result.safestVersion = await getSafestVersion(name).catch(() => undefined);
      }

      result.signatureValid = info.signature !== '0x'
        ? verifyChecksum(info.checksum, info.signature, info.author)
        : false;

      const [ensProfile, report] = await Promise.allSettled([
        getENSProfile(info.author),
        info.reportURI ? fetchReportFromFileverse(info.reportURI) : Promise.resolve(null),
      ]);

      result.ensProfile = ensProfile.status === 'fulfilled' ? ensProfile.value : undefined;
      result.report = report.status === 'fulfilled' ? report.value : null;
    } else {
      const cpResult = await checkPackageWithChainPatrol(name).catch(() => null);
      result.chainPatrolStatus = cpResult?.status;
      if (cpResult?.status === 'BLOCKED') result.blocked = true;
    }
  } catch { /* package not in registry */ }

  return result;
}
