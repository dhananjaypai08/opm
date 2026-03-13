export const HIGH_RISK_THRESHOLD = 70;
export const MEDIUM_RISK_THRESHOLD = 40;

export const OPENROUTER_MODELS = {
  agent1: 'anthropic/claude-sonnet-4-20250514',
  agent2: 'google/gemini-2.5-flash',
  agent3: 'deepseek/deepseek-chat',
} as const;

export const OPENAI_MODELS = {
  agent1: 'gpt-4.1',
  agent2: 'gpt-4.1-mini',
  agent3: 'gpt-4.1-nano',
} as const;

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
export const ETH_MAINNET_RPC = 'https://eth.llamarpc.com';
export const ETH_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

export const DEFAULT_CONTRACT_ADDRESS = '0x8A6a9a8c7e03F826915bf9f6dA036A0C1A9D1E85';

export const FILEVERSE_DEFAULT_URL = 'http://localhost:8001';

export const NPM_REGISTRY_URL = 'https://registry.npmjs.org';

export const CHAINPATROL_API_URL = 'https://app.chainpatrol.io/api/v2';

export const SCANNABLE_EXTENSIONS = ['.js', '.ts', '.mjs', '.cjs', '.json'];

export const MAX_FILE_SIZE_BYTES = 100_000;
export const MAX_TOTAL_CODE_CHARS = 200_000;
export const VERSION_LOOKBACK = 3;
