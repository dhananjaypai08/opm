import React from 'react';
import { Box, Text } from 'ink';
import { classifyRisk } from '@opm/core';
import type { AgentEntry } from '@opm/core';

const RISK_COLORS = { LOW: 'green', MEDIUM: 'yellow', HIGH: 'red', CRITICAL: 'redBright' } as const;

interface AgentScoresProps {
  agents: AgentEntry[];
}

export function AgentScores({ agents }: AgentScoresProps) {
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text bold color="white"> Agent Scan Results</Text>
      {agents.map((agent, i) => {
        const level = classifyRisk(agent.result.risk_score);
        const color = RISK_COLORS[level];
        const connector = i === agents.length - 1 ? '└──' : '├──';
        return (
          <Box key={agent.agent_id}>
            <Text color="gray">{connector} </Text>
            <Text color="cyan">{agent.agent_id}</Text>
            <Text color="gray"> ({agent.model}): </Text>
            <Text color={color} bold>{agent.result.risk_score}/100</Text>
            <Text color="gray"> - {agent.result.recommendation}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
