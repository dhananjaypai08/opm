import React from 'react';
import { Box, Text } from 'ink';
import { truncateAddress } from '@opm/core';
import type { ENSProfile } from '../services/ens';

interface AuthorInfoProps {
  address: string;
  ensName?: string;
  profile?: ENSProfile;
}

export function AuthorInfo({ address, ensName, profile }: AuthorInfoProps) {
  const displayName = ensName || profile?.name;
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box>
        <Text color="gray">Author: </Text>
        {displayName ? (
          <Text color="magenta" bold>{displayName}</Text>
        ) : (
          <Text color="white">{truncateAddress(address)}</Text>
        )}
        {displayName && <Text color="gray"> ({truncateAddress(address)})</Text>}
      </Box>
      {profile?.github && (
        <Box>
          <Text color="gray">  GitHub: </Text>
          <Text color="blue">{profile.github}</Text>
        </Box>
      )}
      {profile?.twitter && (
        <Box>
          <Text color="gray">  Twitter: </Text>
          <Text color="blue">@{profile.twitter}</Text>
        </Box>
      )}
      {profile?.url && (
        <Box>
          <Text color="gray">  Web: </Text>
          <Text color="blue">{profile.url}</Text>
        </Box>
      )}
    </Box>
  );
}
