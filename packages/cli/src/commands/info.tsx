import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Header } from '../components/Header';
import { PackageCard } from '../components/PackageCard';
import { StatusLine } from '../components/StatusLine';
import { getPackageInfo, getSafestVersion, getVersions } from '../services/contract';
import { getENSProfile, type ENSProfile } from '../services/ens';
import { fetchReportFromFileverse } from '../services/fileverse';
import { queryOSV, type OSVVulnerability } from '../services/osv';
import { resolveVersion } from '../services/version';
import type { OnChainPackageInfo, ScanReport as ScanReportType } from '@opm/core';

interface InfoCommandProps {
  packageName: string;
  version?: string;
}

export function InfoCommand({ packageName, version }: InfoCommandProps) {
  const [status, setStatus] = useState<'running' | 'done'>('running');
  const [resolvedVer, setResolvedVer] = useState<string>(version || '');
  const [info, setInfo] = useState<OnChainPackageInfo | null>(null);
  const [ensProfile, setEnsProfile] = useState<ENSProfile | undefined>();
  const [report, setReport] = useState<ScanReportType | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [safest, setSafest] = useState<string | undefined>();
  const [cves, setCves] = useState<OSVVulnerability[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    run().catch((err) => setError(String(err)));
  }, []);

  async function run() {
    const ver = await resolveVersion(packageName, version || 'latest');
    setResolvedVer(ver);

    const pkgInfo = await getPackageInfo(packageName, ver);
    setInfo(pkgInfo);

    if (!pkgInfo.exists) {
      setStatus('done');
      return;
    }

    const [ep, rpt, vers, safe, osvResult] = await Promise.allSettled([
      getENSProfile(pkgInfo.author),
      pkgInfo.reportURI ? fetchReportFromFileverse(pkgInfo.reportURI) : Promise.resolve(null),
      getVersions(packageName),
      getSafestVersion(packageName),
      queryOSV(packageName, ver),
    ]);

    setEnsProfile(ep.status === 'fulfilled' ? ep.value : undefined);
    setReport(rpt.status === 'fulfilled' ? rpt.value : null);
    setVersions(vers.status === 'fulfilled' ? vers.value : []);
    setSafest(safe.status === 'fulfilled' ? safe.value : undefined);
    setCves(osvResult.status === 'fulfilled' ? osvResult.value : []);
    setStatus('done');
  }

  return (
    <Box flexDirection="column">
      <Header subtitle="info" />
      <StatusLine label={`Looking up ${packageName}${resolvedVer ? `@${resolvedVer}` : ''}`} status={status === 'done' ? 'done' : 'running'} />
      {status === 'done' && info && (
        info.exists ? (
          <Box flexDirection="column">
            <PackageCard
              name={packageName}
              version={resolvedVer}
              info={info}
              ensProfile={ensProfile}
              report={report}
              signatureValid={info.signature !== '0x'}
            />
            {cves.length > 0 && (
              <Box flexDirection="column" marginLeft={2} marginTop={1}>
                <Text color="red" bold>Known CVEs ({cves.length}):</Text>
                {cves.slice(0, 5).map((c) => (
                  <Box key={c.id} marginLeft={2}>
                    <Text color="yellow">{c.id}</Text>
                    <Text color="gray"> {c.summary?.slice(0, 60)}</Text>
                  </Box>
                ))}
              </Box>
            )}
            {versions.length > 0 && (
              <Box marginLeft={2} marginTop={1}>
                <Text color="gray">Versions: </Text>
                <Text>{versions.join(', ')}</Text>
              </Box>
            )}
            {safest && (
              <Box marginLeft={2}>
                <Text color="gray">Safest version: </Text>
                <Text color="green" bold>{safest}</Text>
              </Box>
            )}
          </Box>
        ) : (
          <Box marginLeft={2} marginTop={1}>
            <Text color="yellow">{packageName} not found in OPM registry</Text>
          </Box>
        )
      )}
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
