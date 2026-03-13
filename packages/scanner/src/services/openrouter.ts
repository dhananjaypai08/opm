import { OPENROUTER_API_URL, OPENAI_API_URL } from '@opm/core';
import type { AgentScanResult } from '@opm/core';
import { validateScanResult, safeJsonParse } from '@opm/core';

function getProvider(): { apiUrl: string; apiKey: string; kind: 'openai' | 'openrouter' } {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) return { apiUrl: OPENAI_API_URL, apiKey: openaiKey, kind: 'openai' };

  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) return { apiUrl: OPENROUTER_API_URL, apiKey: orKey, kind: 'openrouter' };

  throw new Error('Set OPENAI_API_KEY or OPENROUTER_API_KEY');
}

export function getLLMProvider(): 'openai' | 'openrouter' {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  throw new Error('Set OPENAI_API_KEY or OPENROUTER_API_KEY');
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
