import React from 'react';
import { Box, Text } from 'ink';

const LOGO = `
  ██████  ██████  ███    ███
 ██    ██ ██   ██ ████  ████
 ██    ██ ██████  ██ ████ ██
 ██    ██ ██      ██  ██  ██
  ██████  ██      ██      ██`;

interface HeaderProps {
  subtitle?: string;
}

export function Header({ subtitle }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>{LOGO}</Text>
      <Text color="gray"> On-chain Package Manager</Text>
      {subtitle && <Text color="yellow"> {subtitle}</Text>}
      <Text color="gray">{'─'.repeat(40)}</Text>
    </Box>
  );
}
