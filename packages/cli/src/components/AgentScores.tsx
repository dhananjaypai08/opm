import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { classifyRisk, getModelIntelligence } from '@opm/core';
import type { AgentEntry } from '@opm/core';

const RISK_COLORS = { LOW: 'green', MEDIUM: 'yellow', HIGH: 'red', CRITICAL: 'redBright' } as const;

interface AgentScoresProps {
  agents: AgentEntry[];
}

function getIntelligenceEmoji(score: number): string {
  if (score >= 55) return '🟣';
  if (score >= 50) return '🔵';
  if (score >= 45) return '🟢';
  if (score >= 40) return '🟡';
  return '🔴';
}

export function AgentScores({ agents }: AgentScoresProps) {
  const [intelligences, setIntelligences] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all(
      agents.map(async (agent) => {
        const intel = await getModelIntelligence(agent.model);
        return [agent.agent_id, intel] as [string, number];
      })
    ).then((results) => {
      setIntelligences(Object.fromEntries(results));
    });
  }, [agents]);

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text bold color="white"> Agent Scan Results</Text>
      {agents.map((agent, i) => {
        const level = classifyRisk(agent.result.risk_score);
        const color = RISK_COLORS[level];
        const connector = i === agents.length - 1 ? '└──' : '├──';
        const intel = intelligences[agent.agent_id] || 50;
        return (
          <Box key={agent.agent_id}>
            <Text color="gray">{connector} </Text>
            <Text color="cyan">{agent.agent_id}</Text>
            <Text color="gray"> {getIntelligenceEmoji(intel)}{intel} </Text>
            <Text color="gray">({agent.model}): </Text>
            <Text color={color} bold>{agent.result.risk_score}/100</Text>
            <Text color="gray"> - {agent.result.recommendation}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
