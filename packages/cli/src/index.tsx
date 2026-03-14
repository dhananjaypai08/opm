#!/usr/bin/env bun
import React from 'react';
import { render, Box, Text } from 'ink';
import { PushCommand } from './commands/push';
import { InstallCommand } from './commands/install';
import { AuditCommand } from './commands/audit';
import { InfoCommand } from './commands/info';
import { AuthorViewCommand } from './commands/author-view';
import { CheckCommand } from './commands/check';
import { FixCommand } from './commands/fix';
import { PassthroughCommand } from './commands/passthrough';
import { RegisterAgentCommand } from './commands/register-agent';
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
    case 'push': {
      const tokenIdx = rest.findIndex((a) => a === '--token' || a === '--access-token');
      const npmToken = tokenIdx >= 0 ? rest[tokenIdx + 1] : undefined;
      const otpIdx = rest.findIndex((a) => a === '--otp');
      const otp = otpIdx >= 0 ? rest[otpIdx + 1] : undefined;
      return <PushCommand npmToken={npmToken} otp={otp} />;
    }
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
    case 'check':
      return <CheckCommand />;
    case 'fix':
      return <FixCommand />;
    case 'whois': {
      if (!rest[0]) return <Help />;
      const ensArg = rest[0].endsWith('.eth') ? rest[0] : `${rest[0]}.eth`;
      return <AuthorViewCommand ensName={ensArg} />;
    }
    case 'register-agent': {
      const nameIdx = rest.findIndex((a) => a === '--name');
      const modelIdx = rest.findIndex((a) => a === '--model');
      const promptIdx = rest.findIndex((a) => a === '--system-prompt');
      const agentName = nameIdx >= 0 ? rest[nameIdx + 1] : undefined;
      const agentModel = modelIdx >= 0 ? rest[modelIdx + 1] : undefined;
      const systemPrompt = promptIdx >= 0 ? rest[promptIdx + 1] : undefined;
      if (!agentName || !agentModel) {
        return (
          <Box flexDirection="column">
            <Header />
            <Text color="red">Usage: opm register-agent --name {'<name>'} --model {'<model>'} [--system-prompt {'<prompt>'}]</Text>
            <Text color="gray">  --name          Agent identifier (e.g. my-security-agent)</Text>
            <Text color="gray">  --model         LLM model to use (e.g. anthropic/claude-sonnet-4-20250514)</Text>
            <Text color="gray">  --system-prompt Custom system prompt (defaults to OPM security auditor prompt)</Text>
            <Text> </Text>
            <Text color="gray">The agent will be benchmarked against 10 labeled security test cases.</Text>
            <Text color="gray">A ZK proof of 100% accuracy is required for registration.</Text>
          </Box>
        );
      }
      return <RegisterAgentCommand agentName={agentName} model={agentModel} systemPrompt={systemPrompt} />;
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
        <Text>  opm push [--token t] [--otp c]  Sign, scan, publish, register</Text>
        <Text>  opm install [pkg]       Install with on-chain security verification</Text>
        <Text>  opm check               Scan all deps: typosquats, CVEs, AI analysis</Text>
        <Text>  opm fix                 Auto-fix typosquats and vulnerable versions</Text>
        <Text>  opm audit               Scan all deps against on-chain security data</Text>
        <Text>  opm info {'<pkg>'}            Show on-chain security info for a package</Text>
        <Text>  opm view {'<name.eth>'}      Show author profile, packages, and risk scores</Text>
        <Text>  opm whois {'<name>'}          Look up an ENS identity on OPM</Text>
        <Text> </Text>
        <Text color="cyan" bold>Agent commands:</Text>
        <Text>  opm register-agent          Register a new security agent (ZK-verified)</Text>
        <Text>    --name {'<name>'}             Agent identifier</Text>
        <Text>    --model {'<model>'}           LLM model (e.g. anthropic/claude-sonnet-4-20250514)</Text>
        <Text>    --system-prompt {'<p>'}       Custom system prompt (optional)</Text>
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
        <Text color="cyan" bold>Environment (install/audit/info/view need no config):</Text>
        <Text>  OPM_SIGNING_KEY        Author signing key (for push only)</Text>
        <Text>  NPM_TOKEN              npm automation token (for push only)</Text>
      </Box>
    </Box>
  );
}

render(<App />);
