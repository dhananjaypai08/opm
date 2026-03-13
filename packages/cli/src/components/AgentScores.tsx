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
        const intel = agent.model_intelligence || 0;
        const coding = agent.model_coding || 0;
        const weight = agent.model_weight || 0;
        return (
          <Box key={agent.agent_id} flexDirection="column">
            <Box>
              <Text color="gray">{connector} </Text>
              <Text color="cyan">{agent.agent_id}</Text>
              <Text color="gray"> ({agent.model}) </Text>
              <Text color={color} bold>{agent.result.risk_score}/100</Text>
              <Text color="gray"> {agent.result.recommendation}</Text>
            </Box>
            {(intel > 0 || coding > 0) && (
              <Box marginLeft={4}>
                <Text color="magenta">AI: {intel}</Text>
                <Text color="gray"> | </Text>
                <Text color="blue">Code: {coding}</Text>
                <Text color="gray"> | </Text>
                <Text color="cyan">W: {weight}</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
