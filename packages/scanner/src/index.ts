import { enqueueScan } from './queue/memory-queue';

export { enqueueScan } from './queue/memory-queue';
export { runAgent } from './agents/base-agent';
export { getAgentConfigs } from './agents/agent-configs';
export { callOpenRouter } from './services/openrouter';
export { fetchPackageData, extractMetadata, buildVersionHistory, fetchSourceFiles } from './services/npm-registry';
export { submitScoreOnChain, setReportURIOnChain } from './services/contract-writer';
export { uploadReportToFileverse } from './services/fileverse';

if (import.meta.main) {
  const [pkg, ver] = process.argv.slice(2);
  if (!pkg || !ver) {
    console.error('Usage: bun run packages/scanner/src/index.ts <package> <version>');
    process.exit(1);
  }
  enqueueScan(pkg, ver).then((r) => {
    console.log(`Scan complete. Risk: ${r.report.aggregate_risk_score} (${r.report.consensus})`);
    console.log(`Report: ${r.reportURI}`);
  }).catch((err) => {
    console.error('Scan failed:', err);
    process.exit(1);
  });
}
