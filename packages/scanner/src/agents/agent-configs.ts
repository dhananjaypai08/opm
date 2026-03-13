import { OPENROUTER_MODELS, OPENAI_MODELS } from '@opm/core';
import { getEnvOrDefault } from '@opm/core';
import { getLLMProvider } from '../services/openrouter';
import type { AgentConfig } from './base-agent';

export function getAgentConfigs(): AgentConfig[] {
  const provider = getLLMProvider();
  const defaults = provider === 'openai' ? OPENAI_MODELS : OPENROUTER_MODELS;

  return [
    {
      agentId: `agent-1`,
      model: getEnvOrDefault('AGENT1_MODEL', defaults.agent1),
    },
    {
      agentId: `agent-2`,
      model: getEnvOrDefault('AGENT2_MODEL', defaults.agent2),
    },
    {
      agentId: `agent-3`,
      model: getEnvOrDefault('AGENT3_MODEL', defaults.agent3),
    },
  ];
}
