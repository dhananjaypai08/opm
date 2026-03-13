#!/usr/bin/env bun
import React from 'react';
import { render, Box, Text } from 'ink';
import { PushCommand } from './commands/push';
import { InstallCommand } from './commands/install';
import { AuditCommand } from './commands/audit';
import { InfoCommand } from './commands/info';
import { PassthroughCommand } from './commands/passthrough';
import { Header } from './components/Header';

const args = process.argv.slice(2);
const command = args[0];
const rest = args.slice(1);

function parsePackageArg(pkg?: string) {
  if (!pkg) return {};
  const atIdx = pkg.lastIndexOf('@');
  if (atIdx > 0) return { name: pkg.slice(0, atIdx), version: pkg.slice(atIdx + 1) };
  return { name: pkg };
}

const PASSTHROUGH = new Set(['init', 'run', 'test', 'uninstall', 'remove', 'rm', 'ls', 'list', 'outdated', 'update', 'link', 'pack', 'start', 'build']);

function App() {
  switch (command) {
    case 'push':
      return <PushCommand />;
    case 'install':
    case 'i':
    case 'add': {
      const { name, version } = parsePackageArg(rest[0]);
      return <InstallCommand packageName={name} version={version} />;
    }
    case 'audit':
      return <AuditCommand />;
    case 'info':
    case 'view': {
      const { name, version } = parsePackageArg(rest[0]);
      if (!name) return <Help />;
      return <InfoCommand packageName={name} version={version} />;
    }
    default:
      if (command && PASSTHROUGH.has(command)) {
        return <PassthroughCommand command={command} args={rest} />;
      }
      return <Help />;
  }
}

function Help() {
  return (
    <Box flexDirection="column">
      <Header />
      <Box flexDirection="column" marginLeft={2}>
        <Text color="cyan" bold>Security commands:</Text>
        <Text>  opm push                Sign, publish, and trigger AI security scan</Text>
        <Text>  opm install [pkg]       Install with on-chain security verification</Text>
        <Text>  opm audit               Scan all deps against on-chain security data</Text>
        <Text>  opm info {'<pkg>'}            Show on-chain security info for a package</Text>
        <Text> </Text>
        <Text color="cyan" bold>Standard commands (npm passthrough):</Text>
        <Text>  opm init                Initialize a new package</Text>
        <Text>  opm run {'<script>'}         Run a package script</Text>
        <Text>  opm test                Run tests</Text>
        <Text>  opm start               Run start script</Text>
        <Text>  opm build               Run build script</Text>
        <Text>  opm uninstall {'<pkg>'}      Remove a dependency</Text>
        <Text>  opm outdated             Check for outdated deps</Text>
        <Text>  opm update               Update dependencies</Text>
        <Text>  opm list                 List installed packages</Text>
        <Text>  opm link                 Symlink a package</Text>
        <Text>  opm pack                 Create a tarball</Text>
        <Text> </Text>
        <Text color="gray">Aliases:  i/add → install, rm → uninstall, ls → list, view → info</Text>
        <Text> </Text>
        <Text color="cyan" bold>Environment:</Text>
        <Text>  OPM_PRIVATE_KEY        Author signing key</Text>
        <Text>  CONTRACT_ADDRESS       OPMRegistry contract on Base Sepolia</Text>
        <Text>  OPENROUTER_API_KEY     For AI security scanning</Text>
      </Box>
    </Box>
  );
}

render(<App />);
