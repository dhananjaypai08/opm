import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { CHECK_SYSTEM_PROMPT, buildCheckPrompt, getModelRankingFor } from '@opm/core';
import type { DepEntry, CheckReport, CheckDepResult, CheckAgentResult } from '@opm/core';
import { Header } from '../components/Header';
import { StatusLine } from '../components/StatusLine';
import { Hyperlink } from '../components/Hyperlink';
import { queryOSV, getOSVSeverity, getFixedVersion } from '../services/osv';
import { detectTyposquatBatch } from '../services/typosquat';
import { callLLMRaw, getAgentConfigs, uploadCheckReportToFileverse } from '@opm/scanner';
import * as fs from 'fs';
import * as path from 'path';

interface FixAction {
  name: string;
  version: string;
  kind: 'typosquat' | 'cve' | 'ai';
  newName: string | null;
  newVersion: string | null;
  reason: string;
}

type Phase = 'scan' | 'agents' | 'apply' | 'upload' | 'done';

export function FixCommand() {
  const [phase, setPhase] = useState<Phase>('scan');
  const [fixes, setFixes] = useState<FixAction[]>([]);
  const [total, setTotal] = useState(0);
  const [applied, setApplied] = useState(false);
  const [reportLink, setReportLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    runFix().catch((e) => setError(String(e)));
  }, []);

  async function runFix() {
    const pkgPath = path.resolve('package.json');
    if (!fs.existsSync(pkgPath)) { setError('No package.json found'); return; }

    const rawJson = fs.readFileSync(pkgPath, 'utf-8');
    const pkgJson = JSON.parse(rawJson);
    const projectName = pkgJson.name || path.basename(process.cwd());
    const deps = Object.entries(pkgJson.dependencies || {}) as [string, string][];
    const devDeps = Object.entries(pkgJson.devDependencies || {}) as [string, string][];
    const allEntries = [
      ...deps.map(([n, v]) => ({ n, v: clean(v) })),
      ...devDeps.map(([n, v]) => ({ n, v: clean(v) })),
    ];
    setTotal(allEntries.length);

    const allNames = allEntries.map((e) => e.n);
    const [typosquatResults, ...parallelResults] = await Promise.all([
      detectTyposquatBatch(allNames),
      ...allEntries.map(({ n, v }) => queryOSV(n, v).catch(() => [])),
    ]);

    const actions: FixAction[] = [];
    const depResults: CheckDepResult[] = [];

    for (let i = 0; i < allEntries.length; i++) {
      const { n, v } = allEntries[i];
      const typo = typosquatResults[i];
      const cves = (parallelResults[i] as any[]) || [];

      const depR: CheckDepResult = {
        name: n, version: v, typosquat: null,
        cveCount: 0, cveCritical: 0, cveHigh: 0,
        cveIds: [], fixVersion: null, onChainScore: null,
      };

      if (typo && typo.confidence !== 'none' && typo.likelyTarget) {
        depR.typosquat = { likelyTarget: typo.likelyTarget, confidence: typo.confidence, reason: typo.reason };
        actions.push({
          name: n, version: v, kind: 'typosquat',
          newName: typo.likelyTarget, newVersion: null,
          reason: typo.reason,
        });
      }

      if (cves.length > 0) {
        depR.cveCount = cves.length;
        depR.cveIds = cves.map((c: any) => c.id);
        let bestFix: string | null = null;
        for (const cve of cves) {
          const sev = getOSVSeverity(cve);
          if (sev === 'CRITICAL') depR.cveCritical++;
          else if (sev === 'HIGH') depR.cveHigh++;
          const fix = getFixedVersion(cve, v);
          if (fix && (!bestFix || compareSemver(fix, bestFix) > 0)) bestFix = fix;
        }
        depR.fixVersion = bestFix;
        if ((depR.cveCritical > 0 || depR.cveHigh > 0) && bestFix) {
          actions.push({
            name: n, version: v, kind: 'cve',
            newName: null, newVersion: bestFix,
            reason: `${cves.length} CVE(s): ${depR.cveIds.slice(0, 3).join(', ')}`,
          });
        }
      }

      depResults.push(depR);
    }

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
      agentResults = runs
        .filter((r): r is PromiseFulfilledResult<CheckAgentResult> => r.status === 'fulfilled')
        .map((r) => r.value);

      const flagCounts = new Map<string, { count: number; replacement: string | null; version: string | null; reason: string }>();
      for (const agent of agentResults) {
        for (const f of agent.findings) {
          if (f.issue === 'safe' || f.severity === 'NONE') continue;
          if (actions.some((a) => a.name === f.package)) continue;
          const prev = flagCounts.get(f.package) || { count: 0, replacement: null, version: null, reason: '' };
          prev.count++;
          if (f.suggested_replacement) prev.replacement = f.suggested_replacement;
          if (f.suggested_version) prev.version = f.suggested_version;
          prev.reason = f.explanation;
          flagCounts.set(f.package, prev);
        }
      }
      for (const [pkg, { count, replacement, version, reason }] of flagCounts) {
        if (count < 2) continue;
        const entry = allEntries.find((a) => a.n === pkg);
        if (!entry) continue;
        const validName = isPackageName(replacement) ? replacement : null;
        const validVersion = isSemver(version) ? version : null;
        if (!validName && !validVersion) continue;
        actions.push({
          name: pkg, version: entry.v, kind: 'ai',
          newName: validName, newVersion: validVersion,
          reason: `${count}/3 agents flagged: ${reason.slice(0, 80)}`,
        });
      }
    } catch { /* no LLM keys — skip */ }

    setFixes([...actions]);

    if (actions.length > 0) {
      setPhase('apply');
      const updated = JSON.parse(rawJson);
      for (const action of actions) {
        for (const section of ['dependencies', 'devDependencies'] as const) {
          if (!updated[section] || !(action.name in updated[section])) continue;
          const origRange = updated[section][action.name];
          const prefix = origRange.startsWith('^') ? '^' : origRange.startsWith('~') ? '~' : '';
          if (action.newName && action.newName !== action.name) {
            delete updated[section][action.name];
            updated[section][action.newName] = action.newVersion ? `${prefix}${action.newVersion}` : origRange;
          } else if (action.newVersion) {
            updated[section][action.name] = `${prefix}${action.newVersion}`;
          }
        }
      }
      fs.writeFileSync(pkgPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
      setApplied(true);
    }

    setPhase('upload');
    try {
      const checkReport: CheckReport = {
        project: projectName,
        timestamp: new Date().toISOString(),
        totalDeps: allEntries.length,
        deps: depResults,
        agents: agentResults,
      };
      const uploadResult = await uploadCheckReportToFileverse(checkReport);
      setReportLink(uploadResult.link);
    } catch { /* no Fileverse key — skip */ }

    setPhase('done');
  }

  return (
    <Box flexDirection="column">
      <Header subtitle="fix" />
      <Text> </Text>

      <StatusLine label={`Scanning ${total || '...'} dependencies`}
        status={phase === 'scan' ? 'running' : 'done'}
        detail={phase === 'scan' ? 'parallel batch' : `${total} scanned`} />

      {phase !== 'scan' && (
        <StatusLine label="AI agents analyzing dependency tree"
          status={phase === 'agents' ? 'running' : 'done'} />
      )}

      {(phase === 'upload' || phase === 'done') && (
        <StatusLine label="Upload report to Fileverse"
          status={phase === 'upload' ? 'running' : reportLink ? 'done' : 'skip'} />
      )}

      {phase === 'done' && fixes.length === 0 && (
        <Box marginTop={1} marginLeft={2}>
          <Text color="green">✓ No issues found — all dependencies look good</Text>
        </Box>
      )}

      {phase === 'done' && fixes.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="white" bold> Applied Fixes ({fixes.length})</Text>
          {fixes.map((f, i) => (
            <Box key={i} flexDirection="column" marginLeft={2}>
              <Box>
                <Text color={f.kind === 'typosquat' ? 'red' : f.kind === 'cve' ? 'yellow' : 'magenta'}>
                  {f.kind === 'typosquat' ? '✖ TYPOSQUAT' : f.kind === 'cve' ? '⚠ CVE' : '⚑ AI FLAG'}
                </Text>
                <Text color="gray"> </Text>
                <Text color="white">{f.name}</Text>
                <Text color="gray">@{f.version}</Text>
              </Box>
              <Box marginLeft={4}>
                {f.newName && f.newName !== f.name && (
                  <Text color="green">→ renamed to {f.newName} </Text>
                )}
                {f.newVersion && (
                  <Text color="green">→ upgraded to {f.newVersion} </Text>
                )}
              </Box>
              <Box marginLeft={4}>
                <Text color="gray">{f.reason.slice(0, 100)}</Text>
              </Box>
            </Box>
          ))}
          {applied && (
            <Box marginLeft={2} marginTop={1}>
              <Text color="green" bold>✓ package.json updated</Text>
              <Text color="gray"> — run </Text>
              <Text color="cyan">npm install</Text>
              <Text color="gray"> to apply</Text>
            </Box>
          )}
        </Box>
      )}

      {reportLink && (
        <Box marginLeft={2} marginTop={1}>
          <Text color="gray">Report: </Text>
          <Hyperlink url={reportLink} />
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

function isSemver(v: string | null): boolean {
  if (!v) return false;
  return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v.replace(/^v/, ''));
}

function isPackageName(n: string | null): boolean {
  if (!n) return false;
  return /^(@[\w-]+\/)?[\w][\w.-]*$/.test(n);
}
