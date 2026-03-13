import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD, truncateAddress, classifyRisk } from '@opm/core';
import { Header } from '../components/Header';
import { RiskBadge } from '../components/RiskBadge';
import { StatusLine } from '../components/StatusLine';
import { getPackageInfo } from '../services/contract';
import { checkPackageWithChainPatrol } from '../services/chainpatrol';
import { queryOSV, getOSVSeverity } from '../services/osv';
import { resolveVersion } from '../services/version';
import * as fs from 'fs';
import * as path from 'path';

interface DepResult {
  name: string;
  version: string;
  score: number | null;
  author: string;
  onChain: boolean;
  chainPatrol?: string;
  cveCount: number;
  cveHighCount: number;
}

export function AuditCommand() {
  const [status, setStatus] = useState<'running' | 'done'>('running');
  const [results, setResults] = useState<DepResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    runAudit().catch((err) => setError(String(err)));
  }, []);

  async function runAudit() {
    const pkgPath = path.resolve('package.json');
    if (!fs.existsSync(pkgPath)) throw new Error('No package.json found');

    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    const entries = Object.entries(deps) as [string, string][];

    if (entries.length === 0) {
      setStatus('done');
      return;
    }

    const checked: DepResult[] = [];
    for (const [name, verRange] of entries) {
      const rawVersion = String(verRange).replace(/^[\^~]/, '');
      const version = await resolveVersion(name, rawVersion);
      const entry: DepResult = { name, version, score: null, author: '', onChain: false, cveCount: 0, cveHighCount: 0 };

      const [infoResult, osvResult] = await Promise.allSettled([
        getPackageInfo(name, version),
        queryOSV(name, rawVersion),
      ]);

      if (infoResult.status === 'fulfilled' && infoResult.value.exists) {
        entry.onChain = true;
        entry.score = infoResult.value.aggregateScore;
        entry.author = infoResult.value.author;
      } else {
        const cp = await checkPackageWithChainPatrol(name).catch(() => null);
        entry.chainPatrol = cp?.status;
      }

      if (osvResult.status === 'fulfilled') {
        entry.cveCount = osvResult.value.length;
        entry.cveHighCount = osvResult.value.filter((v) => {
          const sev = getOSVSeverity(v);
          return sev === 'HIGH' || sev === 'CRITICAL';
        }).length;
      }

      checked.push(entry);
      setResults([...checked]);
    }

    setStatus('done');
  }

  const high = results.filter((r) => r.score !== null && r.score >= HIGH_RISK_THRESHOLD);
  const medium = results.filter((r) => r.score !== null && r.score >= MEDIUM_RISK_THRESHOLD && r.score < HIGH_RISK_THRESHOLD);
  const low = results.filter((r) => r.score !== null && r.score < MEDIUM_RISK_THRESHOLD);
  const unknown = results.filter((r) => !r.onChain);
  const totalCves = results.reduce((s, r) => s + r.cveCount, 0);

  return (
    <Box flexDirection="column">
      <Header subtitle="audit" />
      <StatusLine label={`Checking ${results.length} dependencies`} status={status === 'done' ? 'done' : 'running'} />
      <Text> </Text>
      {results.map((r) => (
        <Box key={r.name} marginLeft={2}>
          <Box width={30}>
            <Text>{r.name}@{r.version}</Text>
          </Box>
          {r.onChain ? (
            <Box>
              <RiskBadge level={classifyRisk(r.score!)} score={r.score!} />
              <Text color="gray">  {truncateAddress(r.author)}</Text>
            </Box>
          ) : (
            <Box>
              <Text color="gray">not in registry</Text>
              {r.chainPatrol && (
                <Text color={r.chainPatrol === 'BLOCKED' ? 'red' : 'gray'}>  ChainPatrol: {r.chainPatrol}</Text>
              )}
            </Box>
          )}
          {r.cveCount > 0 && (
            <Text color={r.cveHighCount > 0 ? 'red' : 'yellow'}>  {r.cveCount} CVE{r.cveCount > 1 ? 's' : ''}</Text>
          )}
        </Box>
      ))}
      {status === 'done' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Box>
            <Text color="red" bold>{high.length} high</Text>
            <Text color="gray"> · </Text>
            <Text color="yellow" bold>{medium.length} medium</Text>
            <Text color="gray"> · </Text>
            <Text color="green" bold>{low.length} low</Text>
            <Text color="gray"> · </Text>
            <Text color="gray">{unknown.length} unverified</Text>
            {totalCves > 0 && (
              <>
                <Text color="gray"> · </Text>
                <Text color="red" bold>{totalCves} CVE{totalCves > 1 ? 's' : ''}</Text>
              </>
            )}
          </Box>
          {high.length > 0 && (
            <Text color="red" bold>⚠ {high.length} package(s) above risk threshold!</Text>
          )}
        </Box>
      )}
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
