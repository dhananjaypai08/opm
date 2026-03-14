export const HIGH_RISK_THRESHOLD = 70;
export const MEDIUM_RISK_THRESHOLD = 40;

export const OPENROUTER_MODELS = {
  agent1: 'anthropic/claude-opus-4.6',
  agent2: 'google/gemini-3.1-pro-preview',
  agent3: 'deepseek/deepseek-v3.2',
} as const;

export const OPENAI_MODELS = {
  agent1: 'gpt-5.4',
  agent2: 'gpt-5.3-codex',
  agent3: 'gpt-5.2',
} as const;

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
export const ETH_MAINNET_RPC = 'https://eth.llamarpc.com';
export const ETH_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

export const DEFAULT_CONTRACT_ADDRESS = '0x16684391fc9bf48246B08Afe16d1a57BFa181d48';

export const BASE_SEPOLIA_EXPLORER = 'https://sepolia.basescan.org';

export function txUrl(hash: string): string {
  return `${BASE_SEPOLIA_EXPLORER}/tx/${hash}`;
}

export function addressUrl(addr: string): string {
  return `${BASE_SEPOLIA_EXPLORER}/address/${addr}`;
}

export function contractUrl(): string {
  return addressUrl(DEFAULT_CONTRACT_ADDRESS);
}

export const FILEVERSE_DEFAULT_URL = 'http://localhost:8001';

export const NPM_REGISTRY_URL = 'https://registry.npmjs.org';

export const CHAINPATROL_API_URL = 'https://app.chainpatrol.io/api/v2';

export const SCANNABLE_EXTENSIONS = ['.js', '.ts', '.mjs', '.cjs', '.json'];

export const MAX_FILE_SIZE_BYTES = 100_000;
export const MAX_TOTAL_CODE_CHARS = 200_000;
export const VERSION_LOOKBACK = 3;

export const ENS_REGISTRY_ADDRESS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

export const OPM_ENS_KEYS = {
  version: 'opm.version',
  checksum: 'opm.checksum',
  fileverse: 'opm.fileverse',
  riskScore: 'opm.risk_score',
  packages: 'opm.packages',
  signature: 'opm.signature',
  contract: 'opm.contract',
} as const;
