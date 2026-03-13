import React from 'react';
import { Text } from 'ink';
import type { RiskLevel } from '@opm/core';

const RISK_COLORS: Record<RiskLevel, string> = {
  LOW: 'green',
  MEDIUM: 'yellow',
  HIGH: 'red',
  CRITICAL: 'redBright',
};

const RISK_ICONS: Record<RiskLevel, string> = {
  LOW: '●',
  MEDIUM: '▲',
  HIGH: '✖',
  CRITICAL: '⬤',
};

interface RiskBadgeProps {
  level: RiskLevel;
  score: number;
}

export function RiskBadge({ level, score }: RiskBadgeProps) {
  const color = RISK_COLORS[level];
  return (
    <Text>
      <Text color={color} bold>{RISK_ICONS[level]} {level}</Text>
      <Text color="gray"> ({score}/100)</Text>
    </Text>
  );
}
