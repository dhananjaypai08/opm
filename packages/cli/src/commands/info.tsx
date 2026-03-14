import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { truncateAddress } from '@opm/core';
import type { OnChainPackageInfo, ScanReport as ScanReportType, OPMENSRecords } from '@opm/core';
import { Header } from '../components/Header';
import { PackageCard } from '../components/PackageCard';
import { StatusLine, type Status } from '../components/StatusLine';
import { Hyperlink } from '../components/Hyperlink';
import { getPackageInfo, getSafestVersion, getVersions } from '../services/contract';
import { getENSProfile, resolveENSName, type ENSProfile } from '../services/ens';
import { readOPMRecords, readPackageENSRecords, readENSContenthash, decodeContenthash } from '../services/ens-records';
import { fetchReportFromFileverse } from '../services/fileverse';
import { queryOSV, type OSVVulnerability } from '../services/osv';
import { resolveVersion } from '../services/version';

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
  const [ensRecords, setEnsRecords] = useState<OPMENSRecords>({});
  const [pkgEnsRecords, setPkgEnsRecords] = useState<OPMENSRecords>({});
  const [contenthash, setContenthash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    run().catch((err) => setError(String(err)));
  }, []);

  async function run() {
    const resolved = await resolveVersion(packageName, version || 'latest');
    const ver = resolved.version;
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

    const authorEns = ep.status === 'fulfilled' && ep.value?.name
      ? ep.value.name
      : await resolveENSName(pkgInfo.author).catch(() => null);

    if (authorEns) {
      const [opmRecs, pkgRecs, ch] = await Promise.allSettled([
        readOPMRecords(authorEns),
        readPackageENSRecords(authorEns, packageName),
        readENSContenthash(authorEns),
      ]);
      if (opmRecs.status === 'fulfilled') setEnsRecords(opmRecs.value);
      if (pkgRecs.status === 'fulfilled') setPkgEnsRecords(pkgRecs.value);
      if (ch.status === 'fulfilled' && ch.value) setContenthash(ch.value);
    }

    setStatus('done');
  }

  const hasEnsData = Object.keys(ensRecords).length > 0 || Object.keys(pkgEnsRecords).length > 0 || contenthash;
  const fvHash = pkgEnsRecords.fileverse || ensRecords.fileverse;

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

            {hasEnsData && (
              <Box flexDirection="column" marginTop={1}>
                <Text color="gray">────────────────────────────────────────</Text>
                <Text color="white" bold> ENS Records</Text>
                {contenthash && (() => {
                  const decoded = decodeContenthash(contenthash);
                  return decoded ? (
                    <Box marginLeft={2}>
                      <Text color="gray">contenthash:    </Text>
                      <Text color="magenta">{decoded.length > 60 ? decoded.slice(0, 60) + '...' : decoded}</Text>
                    </Box>
                  ) : null;
                })()}
                {(pkgEnsRecords.version || ensRecords.version) && (
                  <Box marginLeft={2}>
                    <Text color="gray">opm.version:    </Text>
                    <Text color="cyan">{pkgEnsRecords.version || ensRecords.version}</Text>
                  </Box>
                )}
                {(pkgEnsRecords.checksum || ensRecords.checksum) && (
                  <Box marginLeft={2}>
                    <Text color="gray">opm.checksum:   </Text>
                    <Text color="cyan">{truncateAddress(pkgEnsRecords.checksum || ensRecords.checksum || '')}</Text>
                  </Box>
                )}
                {fvHash && (
                  <Box marginLeft={2}>
                    <Text color="gray">opm.fileverse:  </Text>
                    {fvHash.startsWith('http') ? (
                      <Hyperlink url={fvHash} label={fvHash.length > 50 ? fvHash.slice(0, 50) + '...' : fvHash} color="green" />
                    ) : (
                      <Text color="green">{fvHash}</Text>
                    )}
                  </Box>
                )}
                {(pkgEnsRecords.riskScore || ensRecords.riskScore) && (
                  <Box marginLeft={2}>
                    <Text color="gray">opm.risk_score: </Text>
                    <Text color="cyan">{pkgEnsRecords.riskScore || ensRecords.riskScore}/100</Text>
                  </Box>
                )}
                {(pkgEnsRecords.signature || ensRecords.signature) && (
                  <Box marginLeft={2}>
                    <Text color="gray">opm.signature:  </Text>
                    <Text color="cyan">{truncateAddress(pkgEnsRecords.signature || ensRecords.signature || '')}</Text>
                  </Box>
                )}
                {ensRecords.contract && (
                  <Box marginLeft={2}>
                    <Text color="gray">opm.contract:   </Text>
                    <Text color="cyan">{truncateAddress(ensRecords.contract)}</Text>
                  </Box>
                )}
                {ensRecords.packages && (
                  <Box marginLeft={2}>
                    <Text color="gray">opm.packages:   </Text>
                    <Text color="white">{ensRecords.packages}</Text>
                  </Box>
                )}
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
