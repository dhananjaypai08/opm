import React from 'react';
import { Box, Text } from 'ink';

export type Status = 'pending' | 'running' | 'done' | 'error' | 'skip' | 'blocked';

const STATUS_MAP: Record<Status, { icon: string; color: string }> = {
  pending: { icon: '○', color: 'gray' },
  running: { icon: '◌', color: 'yellow' },
  done: { icon: '●', color: 'green' },
  error: { icon: '✖', color: 'red' },
  skip: { icon: '─', color: 'gray' },
  blocked: { icon: '⊘', color: 'red' },
};

interface StatusLineProps {
  label: string;
  status: Status;
  detail?: string;
}

export function StatusLine({ label, status, detail }: StatusLineProps) {
  const { icon, color } = STATUS_MAP[status];
  return (
    <Box>
      <Text color={color}>{icon} </Text>
      <Text>{label}</Text>
      {detail && <Text color="gray"> - {detail}</Text>}
    </Box>
  );
}
