import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Header } from '../components/Header';
import { execSync } from 'child_process';

interface PassthroughProps {
  command: string;
  args: string[];
}

export function PassthroughCommand({ command, args }: PassthroughProps) {
  const [output, setOutput] = useState('');
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    const npmArgs = [command, ...args].join(' ');
    try {
      const result = execSync(`npm ${npmArgs}`, { encoding: 'utf-8', stdio: 'pipe' });
      setOutput(result);
      setExitCode(0);
    } catch (err: any) {
      setOutput(err.stdout || err.stderr || err.message);
      setExitCode(err.status ?? 1);
    }
  }, []);

  return (
    <Box flexDirection="column">
      <Header subtitle={command} />
      {output && <Text>{output}</Text>}
      {exitCode !== null && exitCode !== 0 && (
        <Text color="red">Exited with code {exitCode}</Text>
      )}
    </Box>
  );
}
