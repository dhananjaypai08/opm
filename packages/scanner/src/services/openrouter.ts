import { OPENROUTER_API_URL } from '@opm/core';
import type { AgentScanResult } from '@opm/core';
import { getEnvOrThrow, validateScanResult, safeJsonParse } from '@opm/core';

export async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<AgentScanResult> {
  const apiKey = getEnvOrThrow('OPENROUTER_API_KEY');

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://opm.dev',
      'X-Title': 'OPM Security Scanner',
    },
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
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenRouter');

  const parsed = safeJsonParse<AgentScanResult>(raw);
  if (!parsed || !validateScanResult(parsed)) {
    throw new Error(`Invalid scan result JSON from ${model}: ${raw.slice(0, 200)}`);
  }

  return parsed;
}
