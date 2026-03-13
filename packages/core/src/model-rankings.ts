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
    { id: '1', name: 'Claude Sonnet 4', slug: 'claude-sonnet-4', intelligenceIndex: 55, codingIndex: 52 },
    { id: '2', name: 'GPT-4.1', slug: 'gpt-4.1', intelligenceIndex: 50, codingIndex: 48 },
    { id: '3', name: 'Gemini 2.5 Flash', slug: 'gemini-2.5-flash', intelligenceIndex: 52, codingIndex: 45 },
    { id: '4', name: 'DeepSeek Chat', slug: 'deepseek-chat', intelligenceIndex: 42, codingIndex: 40 },
    { id: '5', name: 'GPT-4.1-mini', slug: 'gpt-4.1-mini', intelligenceIndex: 40, codingIndex: 38 },
    { id: '6', name: 'GPT-4.1-nano', slug: 'gpt-4.1-nano', intelligenceIndex: 35, codingIndex: 32 },
  ];
}

const MODEL_SLUGS: Record<string, string> = {
  'anthropic/claude-sonnet-4-20250514': 'claude-sonnet-4',
  'anthropic/claude-sonnet-4': 'claude-sonnet-4',
  'google/gemini-2.5-flash': 'gemini-2.5-flash',
  'deepseek/deepseek-chat': 'deepseek-chat',
  'openai/gpt-4.1': 'gpt-4.1',
  'gpt-4.1': 'gpt-4.1',
  'openai/gpt-4.1-mini': 'gpt-4.1-mini',
  'gpt-4.1-mini': 'gpt-4.1-mini',
  'openai/gpt-4.1-nano': 'gpt-4.1-nano',
  'gpt-4.1-nano': 'gpt-4.1-nano',
};

export async function getModelWeight(modelSlug: string): Promise<number> {
  const rankings = await fetchModelRankings();
  const normalizedSlug = MODEL_SLUGS[modelSlug] || modelSlug.toLowerCase();
  const model = rankings.find(m => 
    m.slug.toLowerCase() === normalizedSlug || 
    m.name.toLowerCase().includes(normalizedSlug) ||
    normalizedSlug.includes(m.slug.toLowerCase())
  );
  
  if (!model) return 50;
  
  return Math.round((model.intelligenceIndex + model.codingIndex) / 2);
}

export async function getModelIntelligence(modelSlug: string): Promise<number> {
  const rankings = await fetchModelRankings();
  const normalizedSlug = MODEL_SLUGS[modelSlug] || modelSlug.toLowerCase();
  const model = rankings.find(m => 
    m.slug.toLowerCase() === normalizedSlug || 
    m.name.toLowerCase().includes(normalizedSlug) ||
    normalizedSlug.includes(m.slug.toLowerCase())
  );
  
  return model?.intelligenceIndex || 50;
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
