import { DEFAULT_MODELS, AGENT_IDS } from '@opm/core';
import { getEnvOrDefault } from '@opm/core';
import type { AgentConfig } from './base-agent';

export function getAgentConfigs(): AgentConfig[] {
  return [
    {
      agentId: AGENT_IDS[0],
      model: getEnvOrDefault('AGENT1_MODEL', DEFAULT_MODELS.agent1),
    },
    {
      agentId: AGENT_IDS[1],
      model: getEnvOrDefault('AGENT2_MODEL', DEFAULT_MODELS.agent2),
    },
    {
      agentId: AGENT_IDS[2],
      model: getEnvOrDefault('AGENT3_MODEL', DEFAULT_MODELS.agent3),
    },
  ];
}
