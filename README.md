# OPM: On-chain Package Manager

OPM is a security-hardened CLI wrapper around npm that introduces cryptographic package signing, multi-agent AI threat analysis, on-chain audit registries, and decentralized report storage to the JavaScript dependency supply chain. The CLI is built on Bun and uses Ink (React for terminals) for its interface, while all underlying package operations (install, publish, pack) delegate to npm via subprocess invocation. Its on-chain registry architecture implements a domain-specific instantiation of the [ERC-8004 (Trustless Agents)](https://eips.ethereum.org/EIPS/eip-8004) pattern, where autonomous AI agents submit structured reputation signals and validation evidence to chain-resident registries, enabling trust establishment across organizational boundaries without prior coordination.

## System Overview

OPM interposes a verification pipeline between the developer and the npm registry. Package authors sign tarballs with ECDSA keys derived from Ethereum wallets. Upon publish, three heterogeneous AI models conduct parallel static analysis of source code, dependency metadata, and version history. Each agent submits a structured risk assessment to the `OPMRegistry` smart contract deployed on Base Sepolia, following the same identity-reputation-validation triad defined by ERC-8004: agents hold on-chain identities (authorized wallets with ENS binding), submit structured reputation signals (`riskScore` + `reasoning` per package version, analogous to ERC-8004's `giveFeedback`), and attach off-chain validation evidence as Fileverse report URIs (analogous to ERC-8004's `feedbackURI`/`responseURI`). The formatted audit report is encrypted and persisted to Fileverse dDocs. Consumers invoking `opm install` query this on-chain registry, verify signatures against checksums, cross-reference the OSV vulnerability database, and enforce configurable risk thresholds before permitting installation.

### Threat Model

OPM addresses the following attack surfaces:

- **Supply chain injection**: Malicious postinstall scripts, obfuscated payloads, environment variable exfiltration, and runtime code generation detected by AI agents.
- **Typosquatting**: Package names are compared against npm registry search results and download-count differentials. AI agents independently assess name similarity to known packages.
- **Dependency confusion**: Scoped versus unscoped name conflicts and internal package shadowing are surfaced during `opm check`.
- **Silent maintainer takeover**: Version history analysis detects sudden dependency graph mutations, new maintainer additions, and anomalous size deltas between releases.
- **Known vulnerability exploitation**: Real-time CVE and GHSA data from the Open Source Vulnerabilities (OSV) API is integrated into install-time blocking and upgrade recommendations, with CVSS v3 base score computation for severity classification.

### Data Flow

```
opm push
  |
  +-- Compute SHA-256 checksum over packed tarball
  +-- Sign checksum with author's Ethereum private key (ECDSA secp256k1)
  +-- Resolve author ENS identity (Sepolia, Mainnet fallback)
  +-- Dispatch 3 AI agents in parallel
  |     +-- Each agent: static analysis, risk scoring (0-100), structured JSON output
  |     +-- Agent wallets submit scores to OPMRegistry.submitScore()
  |     +-- Aggregate risk computed; publish blocked if score >= 80
  +-- Upload formatted markdown report to Fileverse dDocs (encrypted, on-chain synced)
  +-- Publish tarball to npm (automation token or OTP for 2FA)
  +-- Register package metadata on OPMRegistry.registerPackage()
  |     +-- Stores: checksum, signature, ENS name, report URI
  +-- Set report URI on-chain via OPMRegistry.setReportURI()

opm install <pkg>[@<version>]
  |
  +-- Resolve version against on-chain registry (latest or specified)
  +-- Query OSV API for CVE/GHSA advisories
  |     +-- CRITICAL severity: installation blocked
  |     +-- HIGH severity: warning with suggested fix version
  +-- Fetch on-chain risk score and agent consensus
  +-- Verify ECDSA signature against tarball checksum
  +-- ChainPatrol API fallback for packages absent from the registry
  +-- Link Fileverse report if available
  +-- Delegate to npm install if all gates pass

opm check
  |
  +-- Read all dependencies and devDependencies from package.json
  +-- Batch typosquat detection (npm search API + bulk download counts, single round-trip)
  +-- Parallel CVE queries (OSV) and on-chain risk lookups for every dependency
  +-- Dispatch 3 AI agents with full dependency manifest for analysis
  +-- Upload aggregated report to Fileverse dDocs
  +-- Display categorized findings: typosquats, critical CVEs, warnings, AI flags

opm fix
  |
  +-- Execute the same parallel scan pipeline as opm check
  +-- For typosquats: replace package name in package.json with the likely intended package
  +-- For critical/high CVEs: upgrade version to the highest available fix release
  +-- For AI consensus flags (>= 2/3 agents agree): apply suggested correction
  +-- Validate all mutations (semver format, valid package names) before writing
  +-- Upload fix report to Fileverse dDocs

opm view <name.eth>
  |
  +-- Resolve ENS name to Ethereum address (@ensdomains/ensjs v4 + viem)
  +-- Fetch ENS text records: avatar, description, URL, GitHub, Twitter, email
  +-- Render avatar as 24-bit true color ANSI pixel art in terminal
  +-- Query on-chain author profile and reputation score
  +-- Enumerate all published packages with per-version risk scores and report links
```

## Prerequisites

- [Bun](https://bun.sh) >= 1.2
- Node.js >= 20
- Ethereum wallet funded with Base Sepolia ETH (required for gas during `opm push`)

## Installation

```bash
git clone <repository-url> && cd opm
cp .env.example .env
bun install
bun link
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
| `opm push` | Sign, scan, publish to npm, and register on-chain |
| `opm push --token <token>` | Publish using an npm automation token (bypasses 2FA) |
| `opm push --otp <code>` | Publish with a one-time 2FA code |
| `opm install <pkg>[@ver]` | Install with signature verification, CVE checks, and on-chain risk gating |
| `opm install` | Verify all dependencies in package.json (bulk scan mode) |
| `opm check` | Scan all dependencies for typosquats, CVEs, and AI-detected risks |
| `opm fix` | Auto-correct typosquatted names and upgrade vulnerable versions |
| `opm audit` | Audit all dependencies against on-chain and CVE data |
| `opm info <pkg>` | Display on-chain security metadata for a specific package |
| `opm view <name.eth>` | Display ENS author profile, published packages, and reputation |
| `opm whois <name>` | ENS identity lookup (appends `.eth` if omitted) |

### npm Passthrough

All standard npm commands are forwarded transparently:

```
opm init        opm run <script>    opm test
opm start       opm build           opm uninstall <pkg>
opm outdated    opm update          opm list
opm link        opm pack
```

Aliases: `i`, `add` map to `install`; `rm` maps to `uninstall`; `ls` maps to `list`.

## AI Agent Architecture

Three language models evaluate every package publish in parallel. Model diversity is enforced to reduce single-model blind spots and improve consensus reliability.

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

### Dependency Audit Prompt (opm check / opm fix)

A separate prompt schema is used when agents analyze a project's full dependency tree. Agents evaluate each dependency for:

- Typosquatting patterns (name similarity, download count disparity)
- Malicious package metadata (suspicious descriptions, phantom scopes)
- Dependency confusion vectors
- Version pinning risks

The response schema returns per-package findings with suggested replacements and version upgrades. In `opm fix`, corrections are applied only when 2 or more agents reach consensus, and all suggested values are validated against semver and npm naming constraints before mutation.

## Smart Contract: OPMRegistry

Solidity 0.8.20, deployed on Base Sepolia. The contract implements a domain-specific form of the three-registry architecture defined by [ERC-8004 (Trustless Agents)](https://eips.ethereum.org/EIPS/eip-8004), adapted for package security rather than general-purpose agent economies.

### Storage Layout

| Mapping | Purpose | ERC-8004 Analogue |
|---------|---------|-------------------|
| `packages` | Package name to version list and metadata | N/A (domain-specific) |
| `versionData` | Per-version author, checksum, ECDSA signature, agent scores, report URI | Combines Reputation Registry feedback storage with Validation Registry evidence |
| `authors` | Author address to ENS name, reputation aggregate, and package count | Identity Registry (agent handle with portable identifier and metadata) |
| `ensToAuthor` | ENS name hash to author address for reverse lookups | Identity Registry service endpoint (ENS resolution) |
| `authorizedAgents` | Agent wallet authorization for score submission | Identity Registry agent registration (address-based rather than ERC-721 token) |

### External Functions

| Function | Access | Description | ERC-8004 Analogue |
|----------|--------|-------------|-------------------|
| `registerPackage` | Public | Register a new package version with checksum, signature, and ENS binding | `register()` in Identity Registry |
| `submitScore` | Authorized agents | Submit a risk score (0-100) and reasoning string for a package version | `giveFeedback()` in Reputation Registry |
| `setReportURI` | Authorized agents | Attach a Fileverse report URI to a package version | `feedbackURI` / `responseURI` in Reputation + Validation Registries |
| `getAggregateScore` | View | Compute mean risk score across all agent submissions | `getSummary()` in Reputation Registry |
| `getSafestVersion` | View | Return the lowest-risk version within a configurable lookback window | Aggregated reputation query with filtering |
| `getScores` | View | Return all individual agent scores for a version | `readAllFeedback()` in Reputation Registry |
| `getAuthorReputation` | View | Compute author's mean risk score across all packages | `getSummary()` scoped to agent identity |
| `getPackageInfo` | View | Retrieve full metadata and aggregate score for a package version | Composite read across all three registries |
| `getVersions` | View | List all registered versions of a package | N/A (domain-specific) |
| `getAuthorByAddress` | View | Retrieve author profile by Ethereum address | Identity Registry lookup |
| `getAuthorByENS` | View | Resolve author profile by ENS name | Identity Registry lookup via ENS service endpoint |

### Risk Thresholds

| Threshold | Value | Effect |
|-----------|-------|--------|
| `HIGH_RISK_THRESHOLD` | 70 | Packages above this score trigger warnings |
| `MEDIUM_RISK_THRESHOLD` | 40 | Packages above this score are flagged for caution |
| Critical gate (CLI) | 80 | `opm push` blocks publication; `opm install` blocks installation |

## ENS Integration

OPM uses the official [`@ensdomains/ensjs`](https://github.com/ensdomains/ensjs) v4 SDK with `viem` transport for:

- Forward resolution (name to address) and reverse resolution (address to name) across Sepolia and Ethereum Mainnet
- Text record retrieval: `avatar`, `description`, `url`, `com.github`, `com.twitter`, `email`
- Terminal avatar rendering using a custom ANSI renderer (24-bit true color half-block characters via `jimp`)
- On-chain ENS-to-author mapping stored in `OPMRegistry` for identity binding

## External Integrations

| Service | Protocol | Purpose |
|---------|----------|---------|
| Base Sepolia | EVM (Ethers.js v6) | OPMRegistry smart contract deployment and interaction (ERC-8004 aligned) |
| Ethereum Name Service | @ensdomains/ensjs + viem | Author identity resolution, profile display, on-chain binding |
| Fileverse dDocs | REST API (@fileverse/api) | Encrypted, decentralized storage for formatted security reports |
| OSV (Open Source Vulnerabilities) | REST API (osv.dev) | Real-time CVE/GHSA advisory data with CVSS v3 base score computation |
| ChainPatrol | REST API | Fallback asset blocklist for packages not in the on-chain registry |
| OpenRouter | REST API | Multi-model AI routing (Claude, Gemini, DeepSeek) |
| OpenAI | REST API | Direct GPT-4.1 family access as fallback provider |
| Artificial Analysis | REST API | Model intelligence and coding indices for weighted score aggregation |
| npm Registry | REST API | Package metadata, tarball fetching, download statistics, search |

## Project Structure

```
packages/
  core/           Shared types, constants, ABI, prompt schemas, model rankings, utilities
  contracts/      OPMRegistry.sol, Hardhat configuration, deployment scripts, tests
  scanner/        AI agent runner, LLM client, in-memory queue, Fileverse upload, report formatter
  cli/            Ink-based terminal UI application
    commands/       push, install, check, fix, audit, info, author-view, passthrough
    components/     Header, StatusLine, RiskBadge, Hyperlink, PackageCard, AuthorInfo, AgentScores
    services/       contract, ens, osv, signature, chainpatrol, fileverse, avatar, typosquat, version
```

## Environment Variables

Client-side commands (`install`, `check`, `fix`, `audit`, `info`, `view`, `whois`) operate with zero configuration. All RPC endpoints, the contract address, and API base URLs have sensible defaults compiled into `packages/core/src/constants.ts`.

Author-side commands (`push`) require the following:

| Variable | Description |
|----------|-------------|
| `OPM_SIGNING_KEY` | Ethereum private key for ECDSA package signing |
| `AGENT_PRIVATE_KEY` | Agent wallet private key (funds on-chain score submission gas) |
| `NPM_TOKEN` | npm automation token (alternative to `--token` CLI flag) |
| `OPENAI_API_KEY` | OpenAI API key; selects GPT-4.1 / Mini / Nano agents |
| `OPENROUTER_API_KEY` | OpenRouter API key; enables Claude, Gemini, DeepSeek model diversity |
| `FILEVERSE_API_KEY` | Fileverse API key (generate at ddocs.new, Settings, Developer Mode) |

At least one of `OPENAI_API_KEY` or `OPENROUTER_API_KEY` must be set for AI scanning.

Optional overrides (defaults are compiled in):

| Variable | Default |
|----------|---------|
| `CONTRACT_ADDRESS` | `0x8A6a9a8c7e03F826915bf9f6dA036A0C1A9D1E85` |
| `BASE_SEPOLIA_RPC_URL` | `https://sepolia.base.org` |
| `ETH_MAINNET_RPC_URL` | `https://eth.llamarpc.com` |
| `ETH_SEPOLIA_RPC_URL` | `https://ethereum-sepolia-rpc.publicnode.com` |
| `FILEVERSE_API_URL` | `http://localhost:8001` |
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

## License

MIT
