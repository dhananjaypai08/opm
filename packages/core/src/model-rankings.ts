const ARTIFICIAL_ANALYSIS_API = 'https://artificialanalysis.ai/api/v2/data/llms/models';

export interface ModelRanking {
  id: string;
  name: string;
  slug: string;
  intelligenceIndex: number;
  codingIndex: number;
}

interface AAModelResponse {
  id: string;
  name: string;
  slug: string;
  evaluations?: {
    artificial_analysis_intelligence_index?: number;
    artificial_analysis_coding_index?: number;
  };
}

let cachedRankings: ModelRanking[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000;

export async function fetchModelRankings(): Promise<ModelRanking[]> {
  if (cachedRankings && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return cachedRankings;
  }

  const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY || '';
  if (!apiKey) return getDefaultRankings();

  try {
    const res = await fetch(ARTIFICIAL_ANALYSIS_API, {
      headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data: { data: AAModelResponse[] } = await res.json();

    cachedRankings = data.data.map((m) => ({
      id: String(m.id),
      name: m.name,
      slug: m.slug,
      intelligenceIndex: m.evaluations?.artificial_analysis_intelligence_index || 0,
      codingIndex: m.evaluations?.artificial_analysis_coding_index || 0,
    }));
    cacheTimestamp = Date.now();
    return cachedRankings;
  } catch {
    return getDefaultRankings();
  }
}

export function getDefaultRankings(): ModelRanking[] {
  return [
    { id: '1', name: 'Gemini 3.1 Pro Preview', slug: 'gemini-3.1-pro-preview', intelligenceIndex: 57, codingIndex: 55 },
    { id: '2', name: 'GPT-5.4', slug: 'gpt-5.4', intelligenceIndex: 57, codingIndex: 55 },
    { id: '3', name: 'GPT-5.3 Codex', slug: 'gpt-5.3-codex', intelligenceIndex: 54, codingIndex: 52 },
    { id: '4', name: 'Claude Opus 4.6', slug: 'claude-opus-4-6', intelligenceIndex: 53, codingIndex: 51 },
    { id: '5', name: 'Claude Sonnet 4.6', slug: 'claude-sonnet-4-6', intelligenceIndex: 52, codingIndex: 50 },
    { id: '6', name: 'GPT-5.2', slug: 'gpt-5.2', intelligenceIndex: 51, codingIndex: 49 },
    { id: '7', name: 'GLM-5', slug: 'glm-5', intelligenceIndex: 50, codingIndex: 48 },
    { id: '8', name: 'Grok 4.2 Beta 0309', slug: 'grok-4-2-beta-0309', intelligenceIndex: 48, codingIndex: 46 },
    { id: '9', name: 'Kimi K2.5', slug: 'kimi-k2-5', intelligenceIndex: 47, codingIndex: 45 },
    { id: '10', name: 'Gemini 3 Flash', slug: 'gemini-3-flash', intelligenceIndex: 46, codingIndex: 44 },
    { id: '11', name: 'Qwen 3.5', slug: 'qwen-3-5', intelligenceIndex: 45, codingIndex: 43 },
    { id: '12', name: 'MiniMax-M2.5', slug: 'minimax-m2-5', intelligenceIndex: 42, codingIndex: 40 },
    { id: '13', name: 'DeepSeek V3.2', slug: 'deepseek-v3-2', intelligenceIndex: 42, codingIndex: 40 },
    { id: '14', name: 'MiMo V2 Flash Feb 2026', slug: 'mimo-v2-flash-feb-2026', intelligenceIndex: 41, codingIndex: 39 },
    { id: '15', name: 'Grok 4.1 Fast', slug: 'grok-4-1-fast', intelligenceIndex: 39, codingIndex: 37 },
    { id: '16', name: 'Claude 4.5 Haiku', slug: 'claude-4-5-haiku', intelligenceIndex: 37, codingIndex: 35 },
    { id: '17', name: 'NVIDIA Nemotron 3 Super', slug: 'nvidia-nemotron-3-super', intelligenceIndex: 36, codingIndex: 34 },
    { id: '18', name: 'Nova 2.0 Pro Preview', slug: 'nova-2-0-pro-preview', intelligenceIndex: 36, codingIndex: 34 },
    { id: '19', name: 'Gemini 3.1 Flash Lite Preview', slug: 'gemini-3-1-flash-lite-preview', intelligenceIndex: 34, codingIndex: 32 },
    { id: '20', name: 'gpt-oss-120B', slug: 'gpt-oss-120b', intelligenceIndex: 33, codingIndex: 31 },
    { id: '21', name: 'K-EXAONE', slug: 'k-exaone', intelligenceIndex: 32, codingIndex: 30 },
    { id: '22', name: 'gpt-oss-20B', slug: 'gpt-oss-20b', intelligenceIndex: 24, codingIndex: 22 },
    { id: '23', name: 'NVIDIA Nemotron 3 Nano', slug: 'nvidia-nemotron-3-nano', intelligenceIndex: 24, codingIndex: 22 },
    { id: '24', name: 'K2 Think V2', slug: 'k2-think-v2', intelligenceIndex: 24, codingIndex: 22 },
    { id: '25', name: 'Mi:dm K 2.5 Pro', slug: 'midm-k-2-5-pro', intelligenceIndex: 23, codingIndex: 21 },
    { id: '26', name: 'Mistral Large 3', slug: 'mistral-large-3', intelligenceIndex: 23, codingIndex: 21 },
    { id: '27', name: 'Llama 4 Maverick', slug: 'llama-4-maverick', intelligenceIndex: 18, codingIndex: 16 },
  ];
}

const MODEL_SLUGS: Record<string, string> = {
  'anthropic/claude-opus-4.6': 'claude-opus-4-6',
  'anthropic/claude-sonnet-4.6': 'claude-sonnet-4-6',
  'anthropic/claude-opus-4': 'claude-opus-4-6',
  'google/gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
  'google/gemini-3-flash': 'gemini-3-flash',
  'google/gemini-2.5-flash': 'gemini-2.5-flash',
  'deepseek/deepseek-v3.2': 'deepseek-v3-2',
  'deepseek/deepseek-chat': 'deepseek-v3-2',
  'openai/gpt-5.4': 'gpt-5.4',
  'gpt-5.4': 'gpt-5.4',
  'openai/gpt-5.3-codex': 'gpt-5.3-codex',
  'gpt-5.3-codex': 'gpt-5.3-codex',
  'openai/gpt-5.2': 'gpt-5.2',
  'gpt-5.2': 'gpt-5.2',
};

function findModel(rankings: ModelRanking[], modelSlug: string): ModelRanking | undefined {
  const normalizedSlug = MODEL_SLUGS[modelSlug] || modelSlug.toLowerCase();
  const found = rankings.find(m => m.slug.toLowerCase() === normalizedSlug)
    || rankings.find(m => m.name.toLowerCase() === normalizedSlug)
    || rankings.find(m => m.name.toLowerCase().includes(normalizedSlug));
  // Fallback to default rankings if API rankings didn't contain the model
  if (!found && rankings !== getDefaultRankings()) {
    const defaults = getDefaultRankings();
    return defaults.find(m => m.slug.toLowerCase() === normalizedSlug)
      || defaults.find(m => m.name.toLowerCase() === normalizedSlug)
      || defaults.find(m => m.name.toLowerCase().includes(normalizedSlug));
  }
  return found;
}

export async function getModelWeight(modelSlug: string): Promise<number> {
  const model = findModel(await fetchModelRankings(), modelSlug);
  if (!model) return 50;
  return Math.round((model.intelligenceIndex + model.codingIndex) / 2);
}

export async function getModelIntelligence(modelSlug: string): Promise<number> {
  const model = findModel(await fetchModelRankings(), modelSlug);
  return model?.intelligenceIndex || 50;
}

export async function getModelRankingFor(modelSlug: string): Promise<{ intelligence: number; coding: number; weight: number }> {
  const model = findModel(await fetchModelRankings(), modelSlug);
  const intelligence = model?.intelligenceIndex || 50;
  const coding = model?.codingIndex || 50;
  return { intelligence, coding, weight: Math.round((intelligence + coding) / 2) };
}

export function calculateWeightedScore(
  scores: { score: number; weight: number }[]
): number {
  if (scores.length === 0) return 0;
  
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) {
    return Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
  }
  
  const weightedSum = scores.reduce((sum, s) => sum + s.score * s.weight, 0);
  return Math.round(weightedSum / totalWeight);
}
