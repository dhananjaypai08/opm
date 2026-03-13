import React from 'react';
import { Box, Text } from 'ink';
import type { ScanReport as ScanReportType } from '@opm/core';

interface ScanReportProps {
  report?: ScanReportType | null;
  reportURI?: string;
}

export function ScanReport({ report, reportURI }: ScanReportProps) {
  if (!report && !reportURI) return null;

  const totalVulns = report
    ? report.agents.reduce((sum, a) => sum + a.result.vulnerabilities.length, 0)
    : 0;

  const hasInstallScripts = report?.agents.some(
    (a) => a.result.supply_chain_indicators.has_install_scripts,
  );

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text bold color="white"> Scan Report</Text>
      {reportURI && (
        <Box>
          <Text color="gray">  Link: </Text>
          <Text color="blue" underline>{reportURI}</Text>
        </Box>
      )}
      {report && (
        <>
          <Box>
            <Text color="gray">  Vulnerabilities found: </Text>
            <Text color={totalVulns > 0 ? 'yellow' : 'green'}>{totalVulns}</Text>
          </Box>
          <Box>
            <Text color="gray">  Install scripts: </Text>
            <Text color={hasInstallScripts ? 'red' : 'green'}>
              {hasInstallScripts ? 'YES' : 'none'}
            </Text>
          </Box>
          <Box>
            <Text color="gray">  Versions analyzed: </Text>
            <Text>{report.versions_analyzed.join(', ')}</Text>
          </Box>
        </>
      )}
    </Box>
  );
}
