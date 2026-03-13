import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { classifyRisk, truncateAddress } from '@opm/core';
import type { AuthorProfile } from '@opm/core';
import { Header } from '../components/Header';
import { StatusLine } from '../components/StatusLine';
import { RiskBadge } from '../components/RiskBadge';
import { resolveAddress, getENSTextRecords, type ENSProfile } from '../services/ens';
import {
  getAuthorProfile,
  getPackagesByAuthor, getPackagesByAuthorDirect, type AuthorPackageSummary,
} from '../services/contract';
import { renderAvatar } from '../services/avatar';

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skip';

interface Steps {
  resolve: StepStatus;
  onchain: StepStatus;
  profile: StepStatus;
  packages: StepStatus;
}

interface AuthorViewProps {
  ensName: string;
}

export function AuthorViewCommand({ ensName }: AuthorViewProps) {
  const [steps, setSteps] = useState<Steps>({
    resolve: 'pending', onchain: 'pending', profile: 'pending', packages: 'pending',
  });
  const [address, setAddress] = useState<string | null>(null);
  const [author, setAuthor] = useState<AuthorProfile | null>(null);
  const [ensProfile, setEnsProfile] = useState<ENSProfile | null>(null);
  const [packages, setPackages] = useState<AuthorPackageSummary[]>([]);
  const [avatarArt, setAvatarArt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const update = (key: keyof Steps, status: StepStatus) =>
    setSteps((s) => ({ ...s, [key]: status }));

  useEffect(() => {
    run().catch((err) => setError(String(err)));
  }, []);

  async function run() {
    update('resolve', 'running');
    update('profile', 'running');

    const [addrResult, textResult] = await Promise.allSettled([
      resolveAddress(ensName),
      getENSTextRecords(ensName, ['avatar', 'url', 'com.github', 'com.twitter', 'description', 'email']),
    ]);

    const addr = addrResult.status === 'fulfilled' ? addrResult.value : null;
    setAddress(addr);
    update('resolve', addr ? 'done' : 'error');

    const textRecords: Record<string, string> = textResult.status === 'fulfilled'
      ? textResult.value as Record<string, string> : {};
    const profile: ENSProfile = {
      name: ensName,
      avatar: textRecords['avatar'] || null,
      url: textRecords['url'] || null,
      github: textRecords['com.github'] || null,
      twitter: textRecords['com.twitter'] || null,
      description: textRecords['description'] || null,
      email: textRecords['email'] || null,
    };
    setEnsProfile(profile);
    update('profile', 'done');

    update('onchain', 'running');
    let authorProfile: AuthorProfile | null = null;
    if (addr) {
      authorProfile = await getAuthorProfile(addr).catch(() => null);
    }
    setAuthor(authorProfile);
    update('onchain', authorProfile && authorProfile.addr !== '0x0000000000000000000000000000000000000000' ? 'done' : 'error');

    const resolvedAddr = authorProfile?.addr || addr;
    if (resolvedAddr && resolvedAddr !== '0x0000000000000000000000000000000000000000') {
      update('packages', 'running');
      let pkgs: AuthorPackageSummary[] = [];
      try {
        pkgs = await getPackagesByAuthor(resolvedAddr);
      } catch { /* event query failed */ }

      if (pkgs.length === 0 && authorProfile && authorProfile.packagesPublished > 0) {
        const knownNames = ['opm', 'opmsec'];
        try {
          pkgs = await getPackagesByAuthorDirect(resolvedAddr, knownNames);
        } catch { /* direct query failed */ }
      }

      setPackages(pkgs);
      update('packages', 'done');
    } else {
      update('packages', 'skip');
    }

    setDone(true);
  }

  const riskColor = (score: number) => score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green';

  return (
    <Box flexDirection="column">
      <Header subtitle="view" />
      <Text color="cyan" bold> {ensName}</Text>
      <Text> </Text>

      <StatusLine label="Resolve ENS" status={steps.resolve}
        detail={steps.resolve === 'done' && address ? truncateAddress(address) : undefined} />
      <StatusLine label="ENS profile" status={steps.profile} />
      <StatusLine label="On-chain registry" status={steps.onchain}
        detail={steps.onchain === 'done' ? 'registered author' : steps.onchain === 'error' ? 'not found' : undefined} />
      <StatusLine label="Fetch packages" status={steps.packages}
        detail={steps.packages === 'done' ? `${packages.length} package(s)` : undefined} />

      {done && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">────────────────────────────────────────</Text>
          <Text color="white" bold> Identity</Text>
          <Box marginLeft={2}>
            {avatarArt && (
              <Box marginRight={2}>
                <Text>{avatarArt}</Text>
              </Box>
            )}
            <Box flexDirection="column">
              <Box>
                <Text color="gray">ENS:     </Text>
                <Text color="cyan" bold>{ensName}</Text>
              </Box>
              {address && (
                <Box>
                  <Text color="gray">Address: </Text>
                  <Text color="cyan">{address}</Text>
                </Box>
              )}
              {ensProfile?.description && (
                <Box>
                  <Text color="gray">Bio:     </Text>
                  <Text>{ensProfile.description}</Text>
                </Box>
              )}
              {ensProfile?.url && (
                <Box>
                  <Text color="gray">URL:     </Text>
                  <Text color="blue">{ensProfile.url}</Text>
                </Box>
              )}
              {ensProfile?.github && (
                <Box>
                  <Text color="gray">GitHub:  </Text>
                  <Text color="white">@{ensProfile.github}</Text>
                </Box>
              )}
              {ensProfile?.twitter && (
                <Box>
                  <Text color="gray">Twitter: </Text>
                  <Text color="white">@{ensProfile.twitter}</Text>
                </Box>
              )}
              {ensProfile?.email && (
                <Box>
                  <Text color="gray">Email:   </Text>
                  <Text>{ensProfile.email}</Text>
                </Box>
              )}
            </Box>
          </Box>

          {author && author.addr !== '0x0000000000000000000000000000000000000000' && (
            <>
              <Text> </Text>
              <Text color="white" bold> Author Stats</Text>
              <Box flexDirection="column" marginLeft={2}>
                <Box>
                  <Text color="gray">Packages published: </Text>
                  <Text color="white" bold>{author.packagesPublished}</Text>
                </Box>
                <Box>
                  <Text color="gray">Avg reputation:     </Text>
                  <RiskBadge level={classifyRisk(author.reputationScore)} score={author.reputationScore} />
                </Box>
              </Box>
            </>
          )}

          {packages.length > 0 && (
            <>
              <Text> </Text>
              <Text color="white" bold> Published Packages ({packages.length})</Text>
              {packages.map((pkg) => {
                const risk = classifyRisk(pkg.aggregateScore);
                const sigOk = pkg.signature && pkg.signature !== '0x' && pkg.signature.length > 10;
                return (
                  <Box key={`${pkg.name}@${pkg.version}`} flexDirection="column"
                    borderStyle="round" borderColor={risk === 'HIGH' || risk === 'CRITICAL' ? 'red' : risk === 'MEDIUM' ? 'yellow' : 'green'}
                    paddingX={1} marginLeft={2} marginBottom={1}>
                    <Box>
                      <Text bold color="white">{pkg.name}</Text>
                      <Text color="gray">@{pkg.version}</Text>
                      <Text>  </Text>
                      <RiskBadge level={risk} score={pkg.aggregateScore} />
                    </Box>
                    <Box marginTop={0}>
                      <Text color="gray">Checksum:  </Text>
                      <Text color="cyan">{truncateAddress(pkg.checksum)}</Text>
                      <Text>  </Text>
                      <Text color="gray">Signature: </Text>
                      <Text color="cyan">{truncateAddress(pkg.signature)}</Text>
                      <Text color={sigOk ? 'green' : 'red'}> {sigOk ? '✓' : '✗'}</Text>
                    </Box>
                    {pkg.reportURI && !pkg.reportURI.startsWith('local://') && (
                      <Box>
                        <Text color="gray">Report: </Text>
                        <Text color="blue">{pkg.reportURI}</Text>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </>
          )}

          {packages.length === 0 && author && author.addr !== '0x0000000000000000000000000000000000000000' && (
            <Box marginLeft={2} marginTop={1}>
              <Text color="gray">Contract reports {author.packagesPublished} package(s) but none could be resolved</Text>
            </Box>
          )}

          {!author || author.addr === '0x0000000000000000000000000000000000000000' ? (
            <Box marginLeft={2} marginTop={1}>
              <Text color="yellow">{ensName} has not published any packages through OPM</Text>
            </Box>
          ) : null}
        </Box>
      )}

      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
