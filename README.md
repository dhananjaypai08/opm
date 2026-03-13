# OPM - On-chain Package Manager

On-chain security layer for npm packages. Authors sign packages with Ethereum keys, 3 AI agents scan every publish, scores are submitted to a smart contract on Base Sepolia, and JSON scan reports are stored as encrypted documents on Fileverse (dDocs).

## Architecture

```
Author -> opm push -> Sign checksum -> Publish to npm -> Register on-chain
                                                       -> 3 AI agents scan in parallel
                                                       -> Upload JSON report to Fileverse
                                                       -> Submit scores to contract

Dev -> opm install pkg -> Query contract for scores
                       -> Verify author signature
                       -> ENS identity lookup
                       -> Fetch Fileverse report
                       -> ChainPatrol fallback
                       -> Install if safe
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.2
- Node.js >= 20
- An Ethereum wallet with Base Sepolia ETH

### Setup

```bash
cp .env.example .env
# Fill in your keys in .env

npm install --legacy-peer-deps
```

### Fileverse Setup

OPM uses Fileverse dDocs to store encrypted scan reports. You need to run the `@fileverse/api` local server:

1. Go to [ddocs.new](https://ddocs.new) → Settings → Developer Mode → Generate API key
2. Add the key to `.env` as `FILEVERSE_API_KEY`
3. Start the Fileverse API server:

```bash
npx @fileverse/api --apiKey YOUR_API_KEY
```

The server runs on `http://localhost:8001` by default. Reports are created as encrypted dDocs and synced to the blockchain, producing shareable links stored on-chain.

### Deploy Contract

```bash
cd packages/contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network baseSepolia
# Copy the contract address to .env as CONTRACT_ADDRESS
```

### Run Tests

```bash
cd packages/contracts && npx hardhat test
```

### Link CLI

```bash
bun link
```

This registers `opm` as a global command.

### Usage

```bash
# Show help
opm

# Push a package (sign, publish, and trigger AI security scan)
cd my-package && opm push

# Install with on-chain security checks
opm install lodash
opm install                    # verify all deps in package.json

# Audit all dependencies against on-chain security data
opm audit

# Look up on-chain security info for a package
opm info lodash
opm info lodash@4.17.21

# Standard npm commands (passthrough)
opm init
opm run dev
opm test
opm start
opm build
opm uninstall lodash
opm outdated
opm update
opm list
opm link
opm pack
```

### Standalone Scanner

```bash
npm run scan -- <package-name> <version>
```

## Environment Variables

| Variable | Description |
|---|---|
| `OPM_PRIVATE_KEY` | Author's Ethereum private key for signing |
| `AGENT_PRIVATE_KEY` | Agent wallet key (for contract gas on Base Sepolia) |
| `OPENAI_API_KEY` | OpenAI API key (auto-selects gpt-4.1 variants) |
| `OPENROUTER_API_KEY` | OpenRouter API key (alternative to OpenAI) |
| `CHAINPATROL_API_KEY` | ChainPatrol API key |
| `BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC URL |
| `ETH_MAINNET_RPC_URL` | Mainnet RPC for ENS resolution |
| `CONTRACT_ADDRESS` | Deployed OPMRegistry address |
| `FILEVERSE_API_KEY` | Fileverse API key (from ddocs.new Developer Mode) |
| `FILEVERSE_API_URL` | Fileverse local API URL (default: http://localhost:8001) |

## Project Structure

```
packages/
  core/       - Shared types, constants, prompts, ABI
  contracts/  - OPMRegistry Solidity contract + Hardhat
  scanner/    - AI scanning agents + queue + Fileverse upload
  cli/        - Ink-based CLI (push, install, audit, info + npm passthrough)
```

## Smart Contract

`OPMRegistry.sol` on Base Sepolia handles:
- Package registration with ENS identity binding
- Agent score submission (authorized agents only)
- Fileverse report URI storage
- Aggregate risk scoring + safest version lookup
- Author reputation tracking

## AI Agents

Three models scan every package in parallel via OpenRouter:
- MiniMax M2.5
- GPT-4.1
- Gemini 2.5 Flash

Each produces a structured JSON report with risk score, vulnerabilities, supply chain indicators, and version analysis.

## Integrations

- **ENS**: On-chain author identity binding via ENS/Basenames
- **Fileverse**: Encrypted dDocs for JSON audit trail, synced to blockchain
- **ChainPatrol**: Fallback blocklist for packages not in the registry
- **Base Sepolia**: Smart contract deployment chain

## License

MIT
