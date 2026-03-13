import { OPENROUTER_API_URL, OPENAI_API_URL } from '@opm/core';
import type { AgentScanResult } from '@opm/core';
import { validateScanResult, safeJsonParse } from '@opm/core';

function getProvider(): { apiUrl: string; apiKey: string; kind: 'openai' | 'openrouter' } {
  const forcedProvider = process.env.LLM_PROVIDER;
  
  if (forcedProvider === 'openrouter') {
    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey) throw new Error('OPENROUTER_API_KEY required when LLM_PROVIDER=openrouter');
    return { apiUrl: OPENROUTER_API_URL, apiKey: orKey, kind: 'openrouter' };
  }
  
  if (forcedProvider === 'openai') {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error('OPENAI_API_KEY required when LLM_PROVIDER=openai');
    return { apiUrl: OPENAI_API_URL, apiKey: openaiKey, kind: 'openai' };
  }

  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) return { apiUrl: OPENROUTER_API_URL, apiKey: orKey, kind: 'openrouter' };

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) return { apiUrl: OPENAI_API_URL, apiKey: openaiKey, kind: 'openai' };

  throw new Error('Set OPENROUTER_API_KEY (for diverse models) or OPENAI_API_KEY');
}

export function getLLMProvider(): 'openai' | 'openrouter' {
  const forcedProvider = process.env.LLM_PROVIDER;
  if (forcedProvider === 'openrouter') return 'openrouter';
  if (forcedProvider === 'openai') return 'openai';
  
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.OPENAI_API_KEY) return 'openai';
  throw new Error('Set OPENROUTER_API_KEY (for diverse models) or OPENAI_API_KEY');
}

export async function callLLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<AgentScanResult> {
  const { apiUrl, apiKey, kind } = getProvider();

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (kind === 'openrouter') {
    headers['HTTP-Referer'] = 'https://opm.dev';
    headers['X-Title'] = 'OPM Security Scanner';
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${kind} ${res.status}: ${body}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error(`Empty response from ${kind}/${model}`);

  const parsed = safeJsonParse<AgentScanResult>(raw);
  if (!parsed || !validateScanResult(parsed)) {
    throw new Error(`Invalid scan result JSON from ${model}: ${raw.slice(0, 200)}`);
  }

  return parsed;
}

export async function callLLMRaw<T = unknown>(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<T> {
  const { apiUrl, apiKey, kind } = getProvider();

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (kind === 'openrouter') {
    headers['HTTP-Referer'] = 'https://opm.dev';
    headers['X-Title'] = 'OPM Security Scanner';
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${kind} ${res.status}: ${body}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error(`Empty response from ${kind}/${model}`);

  const parsed = safeJsonParse<T>(raw);
  if (!parsed) throw new Error(`Invalid JSON from ${model}: ${raw.slice(0, 200)}`);
  return parsed;
}
