#!/usr/bin/env bun
import React from 'react';
import { render, Box, Text } from 'ink';
import { PushCommand } from './commands/push';
import { InstallCommand } from './commands/install';
import { Header } from './components/Header';

const args = process.argv.slice(2);
const command = args[0];

function App() {
  switch (command) {
    case 'push':
      return <PushCommand />;
    case 'install':
    case 'i': {
      const pkg = args[1];
      let name: string | undefined;
      let version: string | undefined;
      if (pkg) {
        const atIdx = pkg.lastIndexOf('@');
        if (atIdx > 0) {
          name = pkg.slice(0, atIdx);
          version = pkg.slice(atIdx + 1);
        } else {
          name = pkg;
        }
      }
      return <InstallCommand packageName={name} version={version} />;
    }
    default:
      return <Help />;
  }
}

function Help() {
  return (
    <Box flexDirection="column">
      <Header />
      <Box flexDirection="column" marginLeft={2}>
        <Text color="gray">Usage:</Text>
        <Text>  opm push              Sign and publish, trigger AI security scan</Text>
        <Text>  opm install [pkg]     Install with on-chain security verification</Text>
        <Text>  opm install           Verify all deps in package.json</Text>
        <Text> </Text>
        <Text color="gray">Environment:</Text>
        <Text>  OPM_PRIVATE_KEY       Author signing key</Text>
        <Text>  CONTRACT_ADDRESS      OPMRegistry contract on Base Sepolia</Text>
        <Text>  OPENROUTER_API_KEY    For AI security scanning</Text>
      </Box>
    </Box>
  );
}

render(<App />);
