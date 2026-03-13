# OPM — On-chain Package Manager

A security-first CLI wrapper around npm that brings on-chain verification, multi-agent AI scanning, and decentralized audit trails to the JavaScript package ecosystem.

Authors sign packages with Ethereum keys. Three AI agents scan every publish in parallel and submit structured risk scores to a smart contract on Base Sepolia. Scan reports are stored as encrypted documents on Fileverse dDocs. Consumers verify signatures, check CVE databases, and consult on-chain scores before installing.

## Setup

### Prerequisites

- [Bun](https://bun.sh) >= 1.2
- Node.js >= 20
- An Ethereum wallet with Base Sepolia ETH (for gas)

### Install Dependencies

```bash
git clone <repo> && cd opm
cp .env.example .env
# Fill in your keys (see Environment Variables below)
bun install
```

### Link CLI Globally

```bash
bun link
```

This registers `opm` as a global command.

### Deploy Contract

```bash
cd packages/contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network baseSepolia
# Copy the deployed address to .env as CONTRACT_ADDRESS
```

### Fileverse Setup

OPM stores formatted security reports on Fileverse dDocs (encrypted, on-chain synced).

1. Go to [ddocs.new](https://ddocs.new) → Settings → Developer Mode → Generate API key
2. Add the key to `.env` as `FILEVERSE_API_KEY`
3. Start the local Fileverse API server:

```bash
npx @fileverse/api --apiKey YOUR_API_KEY
```

The server runs on `http://localhost:8001` by default.

## Architecture

```
opm push
  ├─ Pack tarball & compute SHA-256 checksum
  ├─ Sign checksum with author's Ethereum key (ECDSA)
  ├─ Resolve ENS identity (Sepolia + Mainnet)
  ├─ 3 AI agents scan source code in parallel
  │   ├─ Risk score, vulnerabilities, supply chain indicators
  │   ├─ Submit scores to OPMRegistry contract
  │   └─ Upload styled markdown report to Fileverse dDocs
  ├─ BLOCK if aggregate risk >= 80 (CRITICAL)
  ├─ Publish to npm (with --token for automation)
  └─ Register package + signature + report URI on-chain

opm install <pkg>
  ├─ Resolve version (on-chain latest or specified)
  ├─ Query CVE database (OSV API) — block CRITICAL, warn HIGH
  ├─ Look up on-chain registry (risk score, agent consensus)
  ├─ Verify ECDSA signature against checksum
  ├─ ChainPatrol fallback for unknown packages
  ├─ Fetch Fileverse report link
  └─ Install via npm if safe

opm view <name.eth>
  ├─ Resolve ENS name → address (@ensdomains/ensjs + viem)
  ├─ Fetch ENS text records (avatar, bio, GitHub, Twitter)
  ├─ Render avatar as pixel art in terminal
  ├─ Query on-chain author stats (packages, reputation)
  └─ List all published packages with risk scores + report links
```

## Commands

### Security Commands

```bash
# Sign, scan, publish, and register on-chain
opm push
opm push --token <npm-automation-token>

# Install with full security pipeline
opm install lodash
opm install lodash@4.17.21
opm install                    # verify all deps in package.json

# Audit all dependencies against on-chain + CVE data
opm audit

# Look up on-chain security info for a package
opm info lodash
opm info lodash@4.17.21

# View an author's ENS profile, packages, and risk scores
opm view djpai.eth
opm whois djpai
```

### npm Passthrough

All standard npm commands work transparently:

```bash
opm init            opm run dev         opm test
opm start           opm build           opm uninstall lodash
opm outdated        opm update          opm list
opm link            opm pack
```

**Aliases:** `i` / `add` → install, `rm` → uninstall, `ls` → list

### Standalone Scanner

```bash
bun run scan -- <package-name> <version>
```

## npm Publishing

OPM handles npm publish as part of `opm push`. If your npm account has 2FA enabled, use an automation token:

1. Go to [npmjs.com](https://www.npmjs.com) → Access Tokens → Generate New Token → **Automation**
2. Pass it via CLI flag or environment:

```bash
opm push --token npm_xxxxxxxxxxxx
# or
NPM_TOKEN=npm_xxxxxxxxxxxx opm push
# or add NPM_TOKEN to your .env
```

The scan runs **before** publish — if the aggregate risk score is CRITICAL (>= 80), the publish and on-chain registration are blocked.

## Security Pipeline

### `opm install` Flow

1. **Version resolution** — resolves "latest" from on-chain registry
2. **CVE database** — queries [OSV API](https://osv.dev) for known vulnerabilities; computes CVSS v3 base scores
   - CRITICAL CVEs → installation blocked
   - HIGH CVEs → warning displayed
   - Shows CVE ID, severity, summary, and suggested fix version
3. **On-chain registry** — fetches agent consensus risk score
4. **Signature verification** — verifies ECDSA signature against package checksum
5. **ChainPatrol** — fallback blocklist check for packages not in the registry
6. **Fileverse report** — links to the full AI scan report
7. **Install** — runs `npm install` if all checks pass

### `opm push` Flow

1. **Pack & sign** — SHA-256 checksum, ECDSA signature
2. **ENS resolution** — maps author address to ENS name
3. **AI security scan** — 3 agents analyze source code, metadata, and version history
4. **Risk gate** — blocks publish if score >= 80
5. **npm publish** — with token-based auth support
6. **On-chain registration** — stores checksum, signature, ENS name, and report URI

## AI Agents

Three models scan every package in parallel:

| Agent | OpenRouter Model | OpenAI Fallback |
|-------|-----------------|-----------------|
| Agent 1 | Claude Sonnet 4 | GPT-4.1 |
| Agent 2 | Gemini 2.5 Flash | GPT-4.1 Mini |
| Agent 3 | DeepSeek Chat | GPT-4.1 Nano |

If `OPENROUTER_API_KEY` is set, OPM uses diverse models for better consensus. Otherwise falls back to OpenAI variants via `OPENAI_API_KEY`.

Each agent produces a structured JSON report covering:
- Risk score (0-100) and risk level
- Vulnerability analysis with CVE cross-referencing
- Supply chain indicators (install scripts, obfuscation, network calls, eval usage)
- Version history analysis and changelog risk assessment

## ENS Integration

OPM uses the official [`@ensdomains/ensjs`](https://github.com/ensdomains/ensjs) SDK with `viem` for:

- **Address → Name** resolution across Sepolia and Mainnet
- **Name → Address** resolution for author lookups
- **Text record** fetching (avatar, bio, URL, GitHub, Twitter, email)
- **Terminal avatar** rendering via `terminal-image` (ANSI pixel art)
- **Author profiles** via `opm view <name.eth>` showing published packages and risk scores

The smart contract stores ENS names alongside author addresses for on-chain identity binding.

## Integrations

| Integration | Purpose |
|-------------|---------|
| **Base Sepolia** | Smart contract deployment (OPMRegistry) |
| **ENS** | On-chain author identity, profile display, name resolution |
| **Fileverse dDocs** | Encrypted, decentralized storage for styled security reports |
| **ChainPatrol** | Fallback blocklist for packages not in the registry |
| **OSV API** | Real CVE/GHSA vulnerability data with CVSS v3 scoring |
| **OpenRouter / OpenAI** | Multi-model AI scanning (Claude, Gemini, DeepSeek, GPT) |

## Smart Contract

`OPMRegistry.sol` on Base Sepolia:

- Package registration with checksum, signature, and ENS binding
- Authorized agent score submission (gas-funded agent wallets)
- Fileverse report URI storage per package version
- Aggregate risk scoring across agents
- Safest version lookup with configurable lookback
- Author reputation tracking (average score across all packages)
- ENS-to-author mapping for reverse lookups

## Project Structure

```
packages/
  core/        Shared types, constants, ABI, prompts, utilities
  contracts/   OPMRegistry.sol + Hardhat config, tests, deploy script
  scanner/     AI agents, in-memory queue, Fileverse upload, report formatter
  cli/         Ink-based terminal UI
    commands/    push, install, audit, info, author-view, passthrough
    components/  Header, StatusLine, RiskBadge, PackageCard, AuthorInfo
    services/    contract, ens, osv, signature, chainpatrol, fileverse, avatar
```

## Environment Variables

**Client commands** (`opm install`, `opm audit`, `opm info`, `opm view`, `opm whois`) work with **zero configuration**. All RPCs, the contract address, and API defaults are hardcoded in `packages/core/src/constants.ts`.

**Author commands** (`opm push`) require the keys below:

| Variable | Scope | Description |
|----------|-------|-------------|
| `OPM_SIGNING_KEY` | Author | Ethereum private key for signing package checksums |
| `AGENT_PRIVATE_KEY` | Author | Agent wallet key for on-chain score submission gas |
| `NPM_TOKEN` | Author | npm automation token (alternative to `--token` flag) |
| `OPENAI_API_KEY` | Author | OpenAI API key — selects gpt-4.1 / mini / nano |
| `OPENROUTER_API_KEY` | Author | OpenRouter key — enables Claude, Gemini, DeepSeek |
| `FILEVERSE_API_KEY` | Author | Fileverse API key from ddocs.new Developer Mode |

One of `OPENAI_API_KEY` or `OPENROUTER_API_KEY` is required for AI scanning during `opm push`.

**Optional overrides** (defaults baked into `constants.ts`):

| Variable | Default |
|----------|---------|
| `CONTRACT_ADDRESS` | `0x8A6a9a8c7e03F826915bf9f6dA036A0C1A9D1E85` |
| `BASE_SEPOLIA_RPC_URL` | `https://sepolia.base.org` |
| `ETH_MAINNET_RPC_URL` | `https://eth.llamarpc.com` |
| `ETH_SEPOLIA_RPC_URL` | `https://ethereum-sepolia-rpc.publicnode.com` |
| `FILEVERSE_API_URL` | `http://localhost:8001` |
| `CHAINPATROL_API_KEY` | — (optional, for blocklist checks) |
| `ARTIFICIAL_ANALYSIS_API_KEY` | — (optional, for model-weighted scoring) |

## Run Contract Tests

```bash
cd packages/contracts && npx hardhat test
```

## License

MIT
