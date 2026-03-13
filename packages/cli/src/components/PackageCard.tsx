import React from 'react';
import { Box, Text } from 'ink';
import { classifyRisk, truncateAddress } from '@opm/core';
import type { OnChainPackageInfo, ScanReport as ScanReportType } from '@opm/core';
import type { ENSProfile } from '../services/ens';
import { RiskBadge } from './RiskBadge';
import { AuthorInfo } from './AuthorInfo';
import { ScanReport } from './ScanReport';

interface PackageCardProps {
  name: string;
  version: string;
  info: OnChainPackageInfo;
  ensProfile?: ENSProfile;
  report?: ScanReportType | null;
  signatureValid?: boolean;
}

export function PackageCard({ name, version, info, ensProfile, report, signatureValid }: PackageCardProps) {
  const level = classifyRisk(info.aggregateScore);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1}>
      <Box>
        <Text bold color="white">{name}</Text>
        <Text color="gray">@{version}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Risk: </Text>
        <RiskBadge level={level} score={info.aggregateScore} />
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text color="gray">Checksum:  </Text>
          <Text color="cyan">{truncateAddress(info.checksum)}</Text>
        </Box>
        <Box>
          <Text color="gray">Signature: </Text>
          <Text color="cyan">{truncateAddress(info.signature)}</Text>
          <Text color={signatureValid ? 'green' : 'red'}>
            {' '}{signatureValid ? '✓ verified' : '✗ unverified'}
          </Text>
        </Box>
      </Box>
      <AuthorInfo address={info.author} ensName={info.ensName} profile={ensProfile} />
      <ScanReport report={report} reportURI={info.reportURI} />
    </Box>
  );
}
