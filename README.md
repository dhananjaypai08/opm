# OPM: On-chain Package Manager

[![npm](https://img.shields.io/npm/v/opmsec)](https://www.npmjs.com/package/opmsec)
[![GitHub](https://img.shields.io/github/stars/dhananjaypai08/opm)](https://github.com/dhananjaypai08/opm)
[![Contract](https://img.shields.io/badge/Base%20Sepolia-0x8A6a...1E85-blue)](https://sepolia.basescan.org/address/0x16684391fc9bf48246B08Afe16d1a57BFa181d48)

OPM is a security-hardened CLI wrapper around npm that introduces cryptographic packagepackage signing, multi-agent AI threat analysis, on-chain audit registries, and decentralized report storage to the JavaScript dependency supply chain. The CLI is built on Bun and uses Ink (React for terminals) for its interface, while all underlying package operations (install, publish, pack) delegate to npm via subprocess invocation. Its on-chain registry architecture implements a domain-specific instantiation of the [ERC-8004 (Trustless Agents)](https://eips.ethereum.org/EIPS/eip-8004) pattern, where autonomous AI agents submit structured reputation signals and validation evidence to chain-resident registries, enabling trust establishment across organizational boundaries without prior coordination.

OPM supports **permissionless agent registration** — anyone can onboard their own security agent by proving 100% accuracy on a labeled benchmark suite via zero-knowledge proofs, with the proof hash stored immutably on-chain. Every on-chain transaction (agent score submissions, package registrations, agent registrations) surfaces as a clickable [BaseScan](https://sepolia.basescan.org) link directly in the terminal UI.

Package metadata (version, checksum, Fileverse content hash, risk score, signature) is mapped to **ENS text records** on the author's name, enabling decentralized package discovery via `opm.*` record keys. Authors can create per-package ENS subnames (e.g. `express.djpai.eth`) for namespaced resolution.

## System Overview

OPM interposes a verification pipeline between the developer and the npm registry. Package authors sign tarballs with ECDSA keys derived from Ethereum wallets. Upon publish, three heterogeneous AI models conduct parallel static analysis of source code, dependency metadata, and version history. Each agent submits a structured risk assessment to the `OPMRegistry` smart contract deployed on Base Sepolia, following the same identity-reputation-validation triad defined by ERC-8004: agents hold on-chain identities (authorized wallets with ENS binding), submit structured reputation signals (`riskScore` + `reasoning` per package version, analogous to ERC-8004's `giveFeedback`), and attach off-chain validation evidence as Fileverse report URIs (analogous to ERC-8004's `feedbackURI`/`responseURI`). The formatted audit report is encrypted and persisted to Fileverse dDocs. Consumers invoking `opm install` query this on-chain registry, verify signatures against checksums, cross-reference the OSV vulnerability database, and enforce configurable risk thresholds before permitting installation.

### Threat Model

OPM addresses the following attack surfaces:

- **Supply chain injection**: Malicious postinstall scripts, obfuscated payloads, environment variable exfiltration, and runtime code generation detected by AI agents.
- **Typosquatting**: Package names are compared against npm registry search results and download-count differentials. AI agents independently assess name similarity to known packages.
- **Dependency confusion**: Scoped versus unscoped name conflicts and internal package shadowing are surfaced during `opm check`.
- **Silent maintainer takeover**: Version history analysis detects sudden dependency graph mutations, new maintainer additions, and anomalous size deltas between releases.
- **Known vulnerability exploitation**: Real-time CVE and GHSA data from the Open Source Vulnerabilities (OSV) API is integrated into install-time blocking and upgrade recommendations, with CVSS v3 base score computation for severity classification.
- **Malicious / spamming agents**: Permissionless agent registration requires passing a 10-case benchmark suite with 100% accuracy, verified via zero-knowledge proofs, preventing unqualified agents from polluting the on-chain risk registry.

### Data Flow

```
opm push
  |
  +-- Compute SHA-256 checksum over packed tarball
  +-- Sign checksum with author's Ethereum private key (ECDSA secp256k1)
  +-- Resolve author ENS identity (Sepolia, Mainnet fallback)
  +-- Dispatch 3+ AI agents in parallel (permissionless agents included)
  |     +-- Each agent: static analysis, risk scoring (0-100), structured JSON output
  |     +-- Agent wallets submit scores to OPMRegistry.submitScore()
  |     +-- Aggregate risk computed; publish blocked if score >= 80
  |     +-- BaseScan tx links shown for every score submission
  +-- Upload formatted markdown report to Fileverse dDocs (encrypted, on-chain synced)
  +-- Publish tarball to npm (automation token or OTP for 2FA)
  +-- Register package metadata on OPMRegistry.registerPackage()
  |     +-- Stores: checksum, signature, ENS name, report URI
  |     +-- BaseScan tx link + contract link shown in terminal
  +-- Set report URI on-chain via OPMRegistry.setReportURI()
  +-- Write ENS text records (opm.version, opm.checksum, opm.fileverse, opm.risk_score, opm.packages)
  |     +-- Multicall batching when resolver supports it
  |     +-- Per-package records: opm.pkg.<name>.version, opm.pkg.<name>.fileverse
  |     +-- Subname creation: <package>.<author>.eth (if parent name is owned)
  |     +-- Etherscan tx link shown for ENS record writes

opm register-agent --name <name> --model <model>
  |
  +-- Validate agent configuration and environment
  +-- Generate ZK commitment over expected benchmark outputs
  +-- Run candidate agent against 10 labeled security test cases
  |     +-- Categories: clean, typosquat, malicious, CVE, obfuscated, exfiltration, dependency confusion
  |     +-- Each case evaluated against expected risk level and score range
  +-- Generate zero-knowledge proof of accuracy
  |     +-- Hash commitment scheme: hash(salt, expected) → commitment
  |     +-- Proof: hash(commitment, result_hash, accuracy_flag, salt)
  |     +-- Proves 100% accuracy without revealing test data or individual results
  +-- Verify ZK proof integrity
  +-- Register agent on OPMRegistry.registerAgent() if 100% accuracy
  |     +-- Stores: name, model, systemPromptHash, proofHash on-chain
  |     +-- Auto-authorizes agent for submitScore and setReportURI
  +-- Show BaseScan tx link and contract link
```

## Prerequisites

- [Bun](https://bun.sh) >= 1.2
- Node.js >= 20
- Ethereum wallet funded with Base Sepolia ETH (required for gas during `opm push`)

## Installation

```bash
git clone https://github.com/dhananjaypai08/opm.git && cd opm
cp .env.example .env
bun install
bun link
```

Or install from npm:

```bash
npm i -g opmsec
```

The `bun link` command registers `opm` as a globally available CLI binary.

## Smart Contract Deployment

```bash
cd packages/contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network baseSepolia
```

Record the deployed contract address and set it as `CONTRACT_ADDRESS` in `.env`, or rely on the default address hardcoded in `packages/core/src/constants.ts`.

The contract is live on Base Sepolia: [`0x16684391fc9bf48246B08Afe16d1a57BFa181d48`](https://sepolia.basescan.org/address/0x16684391fc9bf48246B08Afe16d1a57BFa181d48)

## Fileverse dDocs Configuration

OPM persists AI scan reports as encrypted, on-chain-synced documents via the Fileverse dDocs protocol.

1. Navigate to [ddocs.new](https://ddocs.new), open Settings, enable Developer Mode, and generate an API key.
2. Set `FILEVERSE_API_KEY` in `.env`.
3. Start the local Fileverse API server:

```bash
npx @fileverse/api --apiKey <YOUR_API_KEY>
```

The server binds to `http://localhost:8001` by default. This is configurable via `FILEVERSE_API_URL`.

## Commands

### Security Commands

| Command | Description |
|---------|-------------|
| `opm push` | Sign, scan, publish to npm, register on-chain, write ENS records |
| `opm push --token <token>` | Publish using an npm automation token (bypasses 2FA) |
| `opm push --otp <code>` | Publish with a one-time 2FA code |
| `opm install <pkg>[@ver]` | Install with signature verification, CVE checks, and on-chain risk gating |
| `opm install` | Verify all dependencies in package.json (bulk scan mode) |
| `opm check` | Scan all dependencies for typosquats, CVEs, and AI-detected risks |
| `opm fix` | Auto-correct typosquatted names and upgrade vulnerable versions |
| `opm audit` | Audit all dependencies against on-chain and CVE data |
| `opm info <pkg>` | Display on-chain security metadata + ENS records for a package |
| `opm view <name.eth>` | Display ENS author profile, OPM records, and published packages |
| `opm whois <name>` | ENS identity lookup (appends `.eth` if omitted) |

### Agent Commands

| Command | Description |
|---------|-------------|
| `opm register-agent --name <n> --model <m>` | Register a new security agent with ZK-verified benchmarks |
| `opm register-agent --system-prompt <p>` | Optional custom system prompt (defaults to OPM security auditor) |

### npm Passthrough

All standard npm commands are forwarded transparently:

```
opm init        opm run <script>    opm test
opm start       opm build           opm uninstall <pkg>
opm outdated    opm update          opm list
opm link        opm pack
```

Aliases: `i`, `add` map to `install`; `rm` maps to `uninstall`; `ls` maps to `list`.

## Permissionless Agent Registration

OPM supports permissionless agent onboarding. Any developer can register their own security agent by providing a model and optionally a custom system prompt. Before registration, the agent must prove it can accurately classify security threats.

### How It Works

1. **Benchmark Suite**: 10 labeled test cases covering clean packages, typosquats, env exfiltration, obfuscated code, postinstall attacks, known CVEs, and dependency confusion.
2. **Agent Evaluation**: The candidate agent runs against all 10 cases. Each response is evaluated against expected risk levels and score ranges.
3. **ZK Proof Generation**: A zero-knowledge proof is generated using a hash-commitment scheme:
   - Expected outputs are committed: `hash(salt, expected_verdicts) → commitment`
   - Agent outputs are hashed: `hash(salt, actual_verdicts) → result_hash`
   - Proof binds everything: `hash(commitment, result_hash, accuracy_flag, salt) → proof`
   - Only a binary pass/fail is disclosed — test data and individual results remain hidden
4. **On-chain Registration**: If accuracy is 100%, the agent's proof hash is stored on-chain via `OPMRegistry.registerAgent()`, and the agent is auto-authorized to submit scores.

### Circom Circuit

A reference circom circuit (`packages/contracts/circuits/accuracy_verifier.circom`) implements the verification logic for potential on-chain proof verification:

```bash
# Compile
circom accuracy_verifier.circom --r1cs --wasm --sym -o build/

# Trusted setup
snarkjs groth16 setup build/accuracy_verifier.r1cs pot12_final.ptau build/accuracy_verifier_0000.zkey
snarkjs zkey contribute build/accuracy_verifier_0000.zkey build/accuracy_verifier_final.zkey --name="opm-ceremony"

# Export Solidity verifier (for on-chain verification)
snarkjs zkey export solidityverifier build/accuracy_verifier_final.zkey contracts/AccuracyVerifier.sol
```

## AI Agent Architecture

Three language models evaluate every package publish in parallel. Model diversity is enforced to reduce single-model blind spots and improve consensus reliability. Additional agents can be registered permissionlessly.

| Agent | OpenRouter (preferred) | OpenAI (fallback) |
|-------|----------------------|-------------------|
| agent-1 | Claude Sonnet 4 | GPT-4.1 |
| agent-2 | Gemini 2.5 Flash | GPT-4.1 Mini |
| agent-3 | DeepSeek Chat | GPT-4.1 Nano |

When `OPENROUTER_API_KEY` is configured, OPM routes through OpenRouter for model diversity. Otherwise, it falls back to OpenAI variants via `OPENAI_API_KEY`. At least one key is required for `opm push`.

Each agent produces a structured JSON assessment containing:

- **Risk score** (0-100) with categorical classification (LOW, MEDIUM, HIGH, CRITICAL)
- **Vulnerability enumeration** with severity, category, file path, and evidence
- **Supply chain indicators**: install scripts, native bindings, obfuscated code, network calls, filesystem access, process spawning, eval usage, environment variable access
- **Version history analysis**: changelog risk, maintainer changes, dependency graph mutations
- **Recommendation**: SAFE, CAUTION, WARN, or BLOCK

Agent scores are weighted by model intelligence and coding indices sourced from the Artificial Analysis API, producing an intelligence-weighted aggregate risk score.

## Smart Contract: OPMRegistry

Solidity 0.8.20, deployed on [Base Sepolia](https://sepolia.basescan.org/address/0x16684391fc9bf48246B08Afe16d1a57BFa181d48). The contract implements a domain-specific form of the three-registry architecture defined by [ERC-8004 (Trustless Agents)](https://eips.ethereum.org/EIPS/eip-8004), adapted for package security rather than general-purpose agent economies.

### Key Functions

| Function | Access | Description |
|----------|--------|-------------|
| `registerPackage` | Public | Register a new package version with checksum, signature, and ENS binding |
| `submitScore` | Authorized agents | Submit a risk score (0-100) and reasoning string for a package version |
| `setReportURI` | Authorized agents | Attach a Fileverse report URI to a package version |
| `registerAgent` | Public | Permissionless agent registration with ZK proof hash |
| `revokeAgent` | Owner | Deactivate a registered agent |
| `getAggregateScore` | View | Compute mean risk score across all agent submissions |
| `getSafestVersion` | View | Return the lowest-risk version within a configurable lookback window |
| `getScores` | View | Return all individual agent scores for a version |
| `getPackageInfo` | View | Retrieve full metadata and aggregate score for a package version |
| `getRegisteredAgent` | View | Retrieve registered agent details |
| `getAgentCount` | View | Total number of registered agents |

### On-chain Activity

Every transaction is surfaced in the terminal UI with clickable BaseScan links:

- **Score submissions**: Each agent's `submitScore` tx → `https://sepolia.basescan.org/tx/{hash}`
- **Package registration**: `registerPackage` tx → clickable link
- **Agent registration**: `registerAgent` tx → clickable link
- **Contract reference**: Direct link to the OPM Registry contract

### Risk Thresholds

| Threshold | Value | Effect |
|-----------|-------|--------|
| `HIGH_RISK_THRESHOLD` | 70 | Packages above this score trigger warnings |
| `MEDIUM_RISK_THRESHOLD` | 40 | Packages above this score are flagged for caution |
| Critical gate (CLI) | 80 | `opm push` blocks publication; `opm install` blocks installation |

## Website

Landing page built with Next.js + Tailwind CSS.

```bash
cd packages/web
npm install
npm run dev       # Development at http://localhost:3000
npm run build     # Production build
npm start         # Start production server
```

For Railway/Vercel deployment: set the root directory to `packages/web` and use `npm install && npm run build` as the build command.

## Documentation (Mintlify)

Full documentation is in the `docs/` directory, configured for [Mintlify](https://mintlify.com).

### Setup

```bash
npm i -g mintlify
cd docs
mintlify dev
```

Opens at `http://localhost:3333`. The docs cover:

- **Getting Started**: Introduction, Quickstart, Configuration
- **Core Concepts**: Security Model, Multi-Agent Consensus, On-chain Registry, ZK Agent Verification
- **CLI Reference**: All commands with usage, flags, and examples
- **Smart Contract**: Functions, Events, Deployment
- **Architecture**: Scanner engine, Agent system, Benchmark suite

### Deploy to Mintlify

Push your repo to GitHub and connect it to [Mintlify](https://mintlify.com/start) — it auto-deploys from the `docs/` directory.

## Project Structure

```
packages/
  core/             Shared types, constants, ABI, prompt schemas, model rankings, benchmarks
  contracts/        OPMRegistry.sol, Hardhat config, deployment scripts, tests
    circuits/       Circom ZK circuit for accuracy verification
  scanner/          AI agent runner, LLM client, queue, Fileverse, benchmark runner, ZK verifier
  cli/              Ink-based terminal UI
    commands/       push, install, check, fix, audit, info, author-view, register-agent, passthrough
    components/     Header, StatusLine, RiskBadge, Hyperlink, PackageCard, AuthorInfo, AgentScores
    services/       contract, ens, ens-records, osv, signature, chainpatrol, fileverse, avatar, typosquat, version
  web/              Next.js landing page (dark mode, Tailwind CSS)
docs/               Mintlify documentation (mint.json + MDX pages)
```

## Environment Variables

Client-side commands (`install`, `check`, `fix`, `audit`, `info`, `view`, `whois`) operate with zero configuration.

Author-side commands (`push`) require the following:

| Variable | Description |
|----------|-------------|
| `OPM_SIGNING_KEY` | Ethereum private key for ECDSA package signing |
| `AGENT_PRIVATE_KEY` | Agent wallet private key (funds on-chain score submission gas) |
| `NPM_TOKEN` | npm automation token (alternative to `--token` CLI flag) |
| `OPENAI_API_KEY` | OpenAI API key; selects GPT-4.1 / Mini / Nano agents |
| `OPENROUTER_API_KEY` | OpenRouter API key; enables Claude, Gemini, DeepSeek model diversity |
| `FILEVERSE_API_KEY` | Fileverse API key (generate at ddocs.new, Settings, Developer Mode) |

Agent registration (`register-agent`) requires:

| Variable | Description |
|----------|-------------|
| `AGENT_PRIVATE_KEY` | Wallet that becomes the agent identity on-chain |
| `OPENROUTER_API_KEY` or `OPENAI_API_KEY` | Required to run LLM benchmark calls |

Optional overrides (defaults are compiled in):

| Variable | Default |
|----------|---------|
| `CONTRACT_ADDRESS` | `0x16684391fc9bf48246B08Afe16d1a57BFa181d48` |
| `BASE_SEPOLIA_RPC_URL` | `https://sepolia.base.org` |
| `CHAINPATROL_API_KEY` | Optional; enables blocklist checks |
| `ARTIFICIAL_ANALYSIS_API_KEY` | Optional; enables intelligence-weighted scoring |

## Testing

### Contract Tests

```bash
cd packages/contracts && npx hardhat test
```

### Standalone Scanner

```bash
bun run scan -- <package-name> <version>
```

## Links

- **npm**: [npmjs.com/package/opmsec](https://www.npmjs.com/package/opmsec)
- **GitHub**: [github.com/dhananjaypai08/opm](https://github.com/dhananjaypai08/opm)
- **Contract**: [BaseScan](https://sepolia.basescan.org/address/0x16684391fc9bf48246B08Afe16d1a57BFa181d48)

## License

MIT
