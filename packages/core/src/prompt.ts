import type { PackageMetadata, VersionHistoryEntry, SourceFile } from './types';

export const SYSTEM_PROMPT = `You are a security auditor for npm packages. Your job is to analyze package source code and version history to identify security risks, malicious patterns, and supply chain attack indicators.

You MUST respond with a valid JSON object matching this exact schema -- no markdown, no explanation outside the JSON:

{
  "risk_score": <number 0-100>,
  "risk_level": "<LOW | MEDIUM | HIGH | CRITICAL>",
  "reasoning": "<string: 2-4 sentence summary of your overall security assessment>",
  "vulnerabilities": [
    {
      "severity": "<LOW | MEDIUM | HIGH | CRITICAL>",
      "category": "<string>",
      "description": "<string: what the vulnerability is>",
      "file": "<string: file path where found>",
      "evidence": "<string: relevant code snippet or pattern>"
    }
  ],
  "supply_chain_indicators": {
    "has_install_scripts": <boolean>,
    "has_native_bindings": <boolean>,
    "has_obfuscated_code": <boolean>,
    "has_network_calls": <boolean>,
    "has_filesystem_access": <boolean>,
    "has_process_spawn": <boolean>,
    "has_eval_usage": <boolean>,
    "accesses_env_variables": <boolean>
  },
  "version_analysis": {
    "version_reviewed": "<string: current version>",
    "previous_versions_reviewed": ["<string>"],
    "changelog_risk": "<NONE | LOW | MEDIUM | HIGH>",
    "changelog_reasoning": "<string>"
  },
  "recommendation": "<SAFE | CAUTION | WARN | BLOCK>"
}

Risk score guidelines:
- 0-20: Clean, well-structured code with no concerning patterns
- 21-40: Minor concerns but likely benign
- 41-70: Moderate risk, suspicious patterns that warrant manual review
- 71-100: High/critical risk, likely malicious or extremely dangerous

Focus on these attack vectors:
1. Postinstall/preinstall scripts that execute arbitrary code
2. Code that exfiltrates environment variables, credentials, or filesystem data
3. Obfuscated or encoded payloads (base64, hex-encoded strings executed at runtime)
4. Network requests to suspicious or hardcoded external endpoints
5. Prototype pollution or injection vulnerabilities
6. Typosquatting indicators (name similarity to popular packages)
7. Sudden large changes between versions (new maintainer, scope change)
8. Dependency confusion patterns (scoped vs unscoped name conflicts)`;

export interface KnownCVE {
  id: string;
  summary: string;
}

export function buildUserPrompt(
  meta: PackageMetadata,
  versionHistory: VersionHistoryEntry[],
  sourceFiles: SourceFile[],
  knownCVEs?: KnownCVE[],
): string {
  const depsStr = Object.entries(meta.dependencies || {})
    .map(([k, v]) => `${k}@${v}`)
    .join(', ') || 'none';

  const scriptsStr = ['preinstall', 'postinstall', 'prepare']
    .map((s) => `${s}: ${meta.scripts?.[s] || 'none'}`)
    .join(', ');

  const historyStr = versionHistory
    .map(
      (v) =>
        `- ${v.version} (published: ${v.published}):\n` +
        `  Dependencies changed: ${v.depsChanged}\n` +
        `  Files changed: ${v.filesChanged}\n` +
        `  Size delta: ${v.sizeDelta}\n` +
        `  New maintainer: ${v.newMaintainer}`,
    )
    .join('\n');

  const codeStr = sourceFiles
    .map((f) => `### File: ${f.path} (${f.size} bytes)\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  const cveStr = knownCVEs && knownCVEs.length > 0
    ? `## Known Vulnerabilities (from OSV/GitHub Advisory Database)\n${knownCVEs.map((c) => `- ${c.id}: ${c.summary}`).join('\n')}\n`
    : '';

  return `Analyze this npm package for security risks.

## Package Metadata
- Name: ${meta.name}
- Version: ${meta.version}
- Description: ${meta.description || 'none'}
- Author: ${meta.author || 'unknown'}
- License: ${meta.license || 'none'}
- Dependencies: ${depsStr}
- Install scripts: ${scriptsStr}

## Version History (last 3 versions)
${historyStr || 'No previous versions available.'}

${cveStr}## Source Code
${codeStr || 'No source files found.'}

Analyze this package thoroughly and respond with the JSON schema specified in your system instructions.`;
}
