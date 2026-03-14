import { enqueueScan } from './queue/memory-queue';

export { enqueueScan } from './queue/memory-queue';
export type { LocalScanContext } from './agents/base-agent';
export { runAgent } from './agents/base-agent';
export { getAgentConfigs } from './agents/agent-configs';
export { callLLM, callLLMRaw, getLLMProvider } from './services/openrouter';
export { fetchPackageData, extractMetadata, buildVersionHistory, fetchSourceFiles, extractLocalSourceFiles, buildLocalPackageData } from './services/npm-registry';
export { submitScoreOnChain, setReportURIOnChain } from './services/contract-writer';
export { uploadReportToFileverse, uploadCheckReportToFileverse, fetchReportFromFileverse } from './services/fileverse';
export type { FileverseUploadResult } from './services/fileverse';
export { formatCheckReportAsMarkdown } from './services/report-formatter';
export { runBenchmarkSuite, runBatchBenchmarkSuite, type AgentCandidate, type BenchmarkRunResult, type BatchBenchmarkRunResult } from './services/benchmark-runner';
export { generateProof, verifyProof, generateCommitment, proofToOnChainBytes, type ZKProof } from './services/zk-verifier';

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
