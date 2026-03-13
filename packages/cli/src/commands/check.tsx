import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { CHECK_SYSTEM_PROMPT, buildCheckPrompt, classifyRisk, getModelRankingFor } from '@opm/core';
import type { DepEntry, CheckReport, CheckDepResult, CheckAgentResult } from '@opm/core';
import { Header } from '../components/Header';
import { StatusLine } from '../components/StatusLine';
import { RiskBadge } from '../components/RiskBadge';
import { Hyperlink } from '../components/Hyperlink';
import { queryOSV, getOSVSeverity, getFixedVersion } from '../services/osv';
import { getPackageInfo } from '../services/contract';
import { detectTyposquatBatch } from '../services/typosquat';
import { callLLMRaw, getAgentConfigs, uploadCheckReportToFileverse } from '@opm/scanner';
import * as fs from 'fs';
import * as path from 'path';

type Phase = 'scanning' | 'agents' | 'upload' | 'done';

export function CheckCommand() {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [report, setReport] = useState<CheckReport | null>(null);
  const [reportLink, setReportLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    runCheck().catch((e) => setError(String(e)));
  }, []);

  async function runCheck() {
    const pkgPath = path.resolve('package.json');
    if (!fs.existsSync(pkgPath)) { setError('No package.json found'); return; }

    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const projectName = pkgJson.name || path.basename(process.cwd());
    const deps = Object.entries(pkgJson.dependencies || {}) as [string, string][];
    const devDeps = Object.entries(pkgJson.devDependencies || {}) as [string, string][];
    const allEntries = [
      ...deps.map(([n, v]) => ({ n, v: clean(v) })),
      ...devDeps.map(([n, v]) => ({ n, v: clean(v) })),
    ];
    const allNames = allEntries.map((e) => e.n);

    const [typosquatResults, ...parallelResults] = await Promise.all([
      detectTyposquatBatch(allNames),
      ...allEntries.map(({ n, v }) =>
        Promise.allSettled([queryOSV(n, v), getPackageInfo(n, v)]),
      ),
    ]);

    const depResults: CheckDepResult[] = allEntries.map((entry, idx) => {
      const typo = typosquatResults[idx];
      const [osvR, chainR] = parallelResults[idx] as PromiseSettledResult<any>[];

      const result: CheckDepResult = {
        name: entry.n, version: entry.v,
        typosquat: typo && typo.confidence !== 'none'
          ? { likelyTarget: typo.likelyTarget!, confidence: typo.confidence, reason: typo.reason }
          : null,
        cveCount: 0, cveCritical: 0, cveHigh: 0,
        cveIds: [], fixVersion: null, onChainScore: null,
      };

      if (osvR.status === 'fulfilled' && osvR.value.length > 0) {
        result.cveCount = osvR.value.length;
        result.cveIds = osvR.value.map((c: any) => c.id);
        let bestFix: string | null = null;
        for (const cve of osvR.value) {
          const sev = getOSVSeverity(cve);
          if (sev === 'CRITICAL') result.cveCritical++;
          else if (sev === 'HIGH') result.cveHigh++;
          const fix = getFixedVersion(cve, entry.v);
          if (fix && (!bestFix || compareSemver(fix, bestFix) > 0)) bestFix = fix;
        }
        result.fixVersion = bestFix;
      }

      if (chainR.status === 'fulfilled' && chainR.value.exists) {
        result.onChainScore = chainR.value.aggregateScore;
      }

      return result;
    });

    setPhase('agents');
    let agentResults: CheckAgentResult[] = [];
    try {
      const configs = getAgentConfigs();
      const depE: DepEntry[] = deps.map(([n, v]) => ({ name: n, version: clean(v) }));
      const devE: DepEntry[] = devDeps.map(([n, v]) => ({ name: n, version: clean(v) }));
      const prompt = buildCheckPrompt(depE, devE);

      const runs = await Promise.allSettled(
        configs.map(async (cfg) => {
          const { intelligence, coding } = await getModelRankingFor(cfg.model);
          const res = await callLLMRaw<{
            findings: CheckAgentResult['findings'];
            overall_assessment: string;
            risk_score: number;
          }>(cfg.model, CHECK_SYSTEM_PROMPT, prompt);
          return {
            agentId: cfg.agentId, model: cfg.model,
            intelligence, coding,
            findings: res.findings || [],
            overall: res.overall_assessment || '',
            riskScore: res.risk_score || 0,
          } satisfies CheckAgentResult;
        }),
      );
      agentResults = runs.filter((r): r is PromiseFulfilledResult<CheckAgentResult> =>
        r.status === 'fulfilled',
      ).map((r) => r.value);
    } catch { /* no LLM keys — skip */ }

    const checkReport: CheckReport = {
      project: projectName,
      timestamp: new Date().toISOString(),
      totalDeps: allEntries.length,
      deps: depResults,
      agents: agentResults,
    };
    setReport(checkReport);

    setPhase('upload');
    try {
      const link = await uploadCheckReportToFileverse(checkReport);
      setReportLink(link);
    } catch { /* no Fileverse key — skip */ }

    setPhase('done');
  }

  const typosquats = (report?.deps || []).filter((d) => d.typosquat);
  const criticalCves = (report?.deps || []).filter((d) => d.cveCritical > 0);
  const cveWarnings = (report?.deps || []).filter((d) => d.cveCount > 0 && d.cveCritical === 0);
  const highRisk = (report?.deps || []).filter((d) => d.onChainScore !== null && d.onChainScore >= 70);
  const agentFlags = (report?.agents || []).flatMap((a) =>
    a.findings.filter((f) => f.issue !== 'safe' && f.severity !== 'NONE'),
  );
  const uniqueAgentFlags = [...new Map(agentFlags.map((f) => [f.package, f])).values()];

  return (
    <Box flexDirection="column">
      <Header subtitle="check" />
      <Text> </Text>

      <StatusLine label={`Scanning ${report?.totalDeps || '...'} dependencies`}
        status={phase === 'scanning' ? 'running' : 'done'}
        detail={phase === 'scanning' ? 'typosquats + CVEs + on-chain (parallel)' : `${report?.totalDeps} checked`} />

      {phase !== 'scanning' && (
        <StatusLine label="AI agents analyzing dependency tree"
          status={phase === 'agents' ? 'running' : 'done'}
          detail={report?.agents.length ? `${report.agents.length} agents` : undefined} />
      )}

      {(phase === 'upload' || phase === 'done') && (
        <StatusLine label="Upload report to Fileverse"
          status={phase === 'upload' ? 'running' : reportLink ? 'done' : 'skip'} />
      )}

      {phase === 'done' && report && (
        <Box flexDirection="column" marginTop={1}>
          {typosquats.length > 0 && (
            <Box flexDirection="column">
              <Text color="red" bold> TYPOSQUAT RISK ({typosquats.length})</Text>
              {typosquats.map((d) => (
                <Box key={d.name} flexDirection="column" marginLeft={2}>
                  <Box>
                    <Text color="red">✖ </Text>
                    <Text color="white" bold>{d.name}</Text>
                    <Text color="gray">@{d.version}</Text>
                    <Text color="red"> → did you mean </Text>
                    <Text color="green" bold>{d.typosquat!.likelyTarget}</Text>
                    <Text color="gray"> ({d.typosquat!.confidence})</Text>
                  </Box>
                  <Box marginLeft={4}>
                    <Text color="gray">{d.typosquat!.reason}</Text>
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {criticalCves.length > 0 && (
            <Box flexDirection="column" marginTop={typosquats.length > 0 ? 1 : 0}>
              <Text color="red" bold> CRITICAL CVEs ({criticalCves.length})</Text>
              {criticalCves.map((d) => (
                <Box key={d.name} flexDirection="column" marginLeft={2}>
                  <Box>
                    <Text color="red">✖ </Text>
                    <Text color="white" bold>{d.name}</Text>
                    <Text color="gray">@{d.version}</Text>
                    <Text color="red"> — {d.cveCritical} critical, {d.cveHigh} high</Text>
                  </Box>
                  <Box marginLeft={4}>
                    <Text color="gray">{d.cveIds.slice(0, 3).join(', ')}</Text>
                  </Box>
                  {d.fixVersion && (
                    <Box marginLeft={4}>
                      <Text color="green">↑ upgrade to {d.fixVersion}</Text>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {cveWarnings.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="yellow" bold> CVE WARNINGS ({cveWarnings.length})</Text>
              {cveWarnings.map((d) => (
                <Box key={d.name} marginLeft={2}>
                  <Text color="yellow">⚠ </Text>
                  <Text>{d.name}</Text>
                  <Text color="gray">@{d.version}</Text>
                  <Text color="yellow"> — {d.cveCount} CVE(s)</Text>
                  {d.fixVersion && <Text color="green"> → {d.fixVersion}</Text>}
                </Box>
              ))}
            </Box>
          )}

          {highRisk.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="red" bold> HIGH ON-CHAIN RISK ({highRisk.length})</Text>
              {highRisk.map((d) => (
                <Box key={d.name} marginLeft={2}>
                  <Text color="red">✖ </Text>
                  <Text>{d.name}</Text>
                  <Text color="gray">@{d.version}</Text>
                  <Text> </Text>
                  <RiskBadge level={classifyRisk(d.onChainScore!)} score={d.onChainScore!} />
                </Box>
              ))}
            </Box>
          )}

          {report.agents.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="gray">────────────────────────────────────────</Text>
              <Text color="white" bold> AI Agent Analysis</Text>
              {report.agents.map((a) => (
                <Box key={a.agentId} flexDirection="column" marginLeft={2} marginTop={1}>
                  <Box>
                    <Text color="cyan" bold>{a.agentId}</Text>
                    <Text color="gray"> ({a.model}) </Text>
                    <Text color="magenta">AI: {a.intelligence}</Text>
                    <Text color="gray"> | </Text>
                    <Text color="blue">Code: {a.coding}</Text>
                  </Box>
                  {a.findings.filter((f) => f.issue !== 'safe').length > 0 ? (
                    a.findings.filter((f) => f.issue !== 'safe').map((f, i) => (
                      <Box key={i} marginLeft={2}>
                        <Text color={f.severity === 'CRITICAL' || f.severity === 'HIGH' ? 'red' : 'yellow'}>
                          [{f.severity}] </Text>
                        <Text color="white">{f.package} </Text>
                        <Text color="gray">— {f.issue}: {f.explanation.slice(0, 80)}</Text>
                        {f.suggested_replacement && (
                          <Text color="green"> → {f.suggested_replacement}</Text>
                        )}
                      </Box>
                    ))
                  ) : (
                    <Box marginLeft={2}>
                      <Text color="green">No issues found</Text>
                    </Box>
                  )}
                  <Box marginLeft={2}>
                    <Text color="gray" wrap="wrap">{a.overall.slice(0, 150)}</Text>
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          <Box flexDirection="column" marginTop={1}>
            <Text color="gray">────────────────────────────────────────</Text>
            <Text color="white" bold> Summary</Text>
            <Box marginLeft={2} flexDirection="column">
              <Text>{typosquats.length > 0 ? '🔴' : '🟢'} Typosquats: {typosquats.length}</Text>
              <Text>{criticalCves.length > 0 ? '🔴' : cveWarnings.length > 0 ? '🟡' : '🟢'} CVEs: {criticalCves.length + cveWarnings.length} packages ({criticalCves.length} critical)</Text>
              <Text>{highRisk.length > 0 ? '🔴' : '🟢'} On-chain risk: {highRisk.length} high-risk</Text>
              {report.agents.length > 0 && (
                <Text>{uniqueAgentFlags.length > 0 ? '🟡' : '🟢'} AI agents: {uniqueAgentFlags.length} flagged</Text>
              )}
            </Box>
            {reportLink && (
              <Box marginLeft={2} marginTop={1}>
                <Text color="gray">Report: </Text>
                <Hyperlink url={reportLink} />
              </Box>
            )}
            {(typosquats.length > 0 || criticalCves.length > 0) && (
              <Box marginLeft={2} marginTop={1}>
                <Text color="yellow">Run </Text>
                <Text color="cyan" bold>opm fix</Text>
                <Text color="yellow"> to auto-correct these issues</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}

function clean(v: string): string { return String(v).replace(/^[\^~]/, ''); }

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
