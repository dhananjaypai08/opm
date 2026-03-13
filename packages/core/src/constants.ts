export const HIGH_RISK_THRESHOLD = 70;
export const MEDIUM_RISK_THRESHOLD = 40;

export const DEFAULT_MODELS = {
  agent1: 'minimax/minimax-m2.5',
  agent2: 'openai/gpt-4.1',
  agent3: 'google/gemini-2.5-flash-preview',
} as const;

export const AGENT_IDS = ['minimax-m2.5', 'gpt-5.2', 'gemini-3-flash'] as const;

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';

export const NPM_REGISTRY_URL = 'https://registry.npmjs.org';

export const CHAINPATROL_API_URL = 'https://app.chainpatrol.io/api/v2';

export const SCANNABLE_EXTENSIONS = ['.js', '.ts', '.mjs', '.cjs', '.json'];

export const MAX_FILE_SIZE_BYTES = 100_000;
export const MAX_TOTAL_CODE_CHARS = 200_000;
export const VERSION_LOOKBACK = 3;
