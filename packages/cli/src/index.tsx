#!/usr/bin/env bun
import React from 'react';
import { render, Box, Text } from 'ink';
import { PushCommand } from './commands/push';
import { InstallCommand } from './commands/install';
import { AuditCommand } from './commands/audit';
import { InfoCommand } from './commands/info';
import { AuthorViewCommand } from './commands/author-view';
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

function isENSName(arg?: string): boolean {
  return !!arg && arg.endsWith('.eth');
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
    case 'info': {
      const { name, version } = parsePackageArg(rest[0]);
      if (!name) return <Help />;
      return <InfoCommand packageName={name} version={version} />;
    }
    case 'view': {
      if (isENSName(rest[0])) {
        return <AuthorViewCommand ensName={rest[0]} />;
      }
      const { name, version } = parsePackageArg(rest[0]);
      if (!name) return <Help />;
      return <InfoCommand packageName={name} version={version} />;
    }
    case 'whois': {
      if (!rest[0]) return <Help />;
      const ensArg = rest[0].endsWith('.eth') ? rest[0] : `${rest[0]}.eth`;
      return <AuthorViewCommand ensName={ensArg} />;
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
        <Text>  opm view {'<name.eth>'}      Show author profile, packages, and risk scores</Text>
        <Text>  opm whois {'<name>'}          Look up an ENS identity on OPM</Text>
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
        <Text color="gray">Aliases:  i/add → install, rm → uninstall, ls → list</Text>
        <Text color="gray">          view name.eth → author profile, view pkg → info</Text>
        <Text> </Text>
        <Text color="cyan" bold>Environment:</Text>
        <Text>  OPM_PRIVATE_KEY        Author signing key</Text>
        <Text>  CONTRACT_ADDRESS       OPMRegistry contract on Base Sepolia</Text>
        <Text>  OPENAI_API_KEY         For AI security scanning</Text>
      </Box>
    </Box>
  );
}

render(<App />);
