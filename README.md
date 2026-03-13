# OPM - On-chain Package Manager

On-chain security layer for npm packages. Authors sign packages with Ethereum keys, 3 AI agents scan every publish via OpenRouter, scores are submitted to a smart contract on Base Sepolia, and JSON scan reports are stored permanently on Fileverse/IPFS.

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

### Usage

```bash
# Show help
npm run opm

# Push a package (from within a package directory)
npm run opm -- push

# Install a specific package with security checks
npm run opm -- install lodash

# Install all deps with security verification
npm run opm -- install
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
| `OPENROUTER_API_KEY` | OpenRouter API key for AI model access |
| `CHAINPATROL_API_KEY` | ChainPatrol API key |
| `BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC URL |
| `ETH_MAINNET_RPC_URL` | Mainnet RPC for ENS resolution |
| `CONTRACT_ADDRESS` | Deployed OPMRegistry address |
| `PINATA_JWT` | Pinata JWT for Fileverse IPFS uploads |
| `PINATA_GATEWAY_URL` | Pinata gateway URL |
| `PIMLICO_API_KEY` | Pimlico API key for Fileverse |

## Project Structure

```
packages/
  core/       - Shared types, constants, prompts, ABI
  contracts/  - OPMRegistry Solidity contract + Hardhat
  scanner/    - AI scanning agents + queue + Fileverse upload
  cli/        - Ink-based CLI (opm push / opm install)
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
- **Fileverse**: Decentralized JSON audit trail on IPFS
- **ChainPatrol**: Fallback blocklist for packages not in the registry
- **Base Sepolia**: Smart contract deployment chain

## License

MIT
