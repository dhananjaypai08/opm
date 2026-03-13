import { ethers } from 'ethers';
import { OPM_REGISTRY_ABI, getEnvOrThrow, getEnvOrDefault, BASE_SEPOLIA_RPC, DEFAULT_CONTRACT_ADDRESS } from '@opm/core';
import type { OnChainPackageInfo, AuthorProfile } from '@opm/core';

function getContractAddress(): string {
  return getEnvOrDefault('CONTRACT_ADDRESS', DEFAULT_CONTRACT_ADDRESS);
}

function getReadContract() {
  const rpc = getEnvOrDefault('BASE_SEPOLIA_RPC_URL', BASE_SEPOLIA_RPC);
  const provider = new ethers.JsonRpcProvider(rpc);
  return new ethers.Contract(getContractAddress(), OPM_REGISTRY_ABI, provider);
}

function getWriteContract() {
  const rpc = getEnvOrDefault('BASE_SEPOLIA_RPC_URL', BASE_SEPOLIA_RPC);
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(getEnvOrThrow('OPM_SIGNING_KEY', 'OPM_PRIVATE_KEY'), provider);
  return new ethers.Contract(getContractAddress(), OPM_REGISTRY_ABI, wallet);
}

export async function getPackageInfo(name: string, version: string): Promise<OnChainPackageInfo> {
  const contract = getReadContract();
  const [author, checksum, sig, ensName, reportURI, aggregateScore, exists] =
    await contract.getPackageInfo(name, version);

  let scores: OnChainPackageInfo['scores'] = [];
  if (exists) {
    const rawScores = await contract.getScores(name, version);
    scores = rawScores.map((s: { agent: string; riskScore: number; reasoning: string }) => ({
      agent: s.agent,
      riskScore: Number(s.riskScore),
      reasoning: s.reasoning,
    }));
  }

  return {
    author,
    checksum,
    signature: ethers.hexlify(sig),
    ensName,
    reportURI,
    scores,
    aggregateScore: Number(aggregateScore),
    exists,
  };
}

export async function registerPackageOnChain(
  name: string,
  version: string,
  checksum: string,
  signature: Uint8Array,
  ensName: string,
): Promise<string> {
  const contract = getWriteContract();
  const tx = await contract.registerPackage(name, version, checksum, signature, ensName);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function getVersions(name: string): Promise<string[]> {
  const contract = getReadContract();
  return contract.getVersions(name);
}

export async function getSafestVersion(name: string, lookback: number = 3): Promise<string> {
  const contract = getReadContract();
  return contract.getSafestVersion(name, lookback);
}

export async function getAuthorProfile(address: string): Promise<AuthorProfile> {
  const contract = getReadContract();
  const p = await contract.getAuthorByAddress(address);
  return {
    addr: p.addr,
    ensName: p.ensName,
    reputationScore: p.reputationCount > 0
      ? Number(p.reputationTotal) / Number(p.reputationCount)
      : 0,
    packagesPublished: Number(p.packagesPublished),
  };
}

export async function getAuthorByENS(ensName: string): Promise<AuthorProfile> {
  const contract = getReadContract();
  const p = await contract.getAuthorByENS(ensName);
  return {
    addr: p.addr,
    ensName: p.ensName,
    reputationScore: p.reputationCount > 0
      ? Number(p.reputationTotal) / Number(p.reputationCount)
      : 0,
    packagesPublished: Number(p.packagesPublished),
  };
}

export interface AuthorPackageSummary {
  name: string;
  version: string;
  aggregateScore: number;
  reportURI: string;
  checksum: string;
  signature: string;
}

export async function getPackagesByAuthor(authorAddress: string): Promise<AuthorPackageSummary[]> {
  const rpc = getEnvOrDefault('BASE_SEPOLIA_RPC_URL', BASE_SEPOLIA_RPC);
  const provider = new ethers.JsonRpcProvider(rpc);
  const contract = new ethers.Contract(getContractAddress(), OPM_REGISTRY_ABI, provider);

  const packageMap = new Map<string, { name: string; version: string }>();

  try {
    const latest = await provider.getBlockNumber();
    const CHUNK = 5_000;
    const startBlock = Math.max(0, latest - 50_000);

    for (let from = startBlock; from <= latest; from += CHUNK) {
      const to = Math.min(from + CHUNK - 1, latest);
      try {
        const events = await contract.queryFilter(
          contract.filters.PackageRegistered(), from, to,
        );
        for (const event of events) {
          const parsed = contract.interface.parseLog({
            topics: event.topics as string[], data: event.data,
          });
          if (!parsed) continue;
          const [name, version, author] = parsed.args;
          if (author.toLowerCase() === authorAddress.toLowerCase()) {
            packageMap.set(`${name}@${version}`, { name, version });
          }
        }
      } catch { /* chunk failed, continue */ }
    }
  } catch { /* event scan failed entirely */ }

  const results: AuthorPackageSummary[] = [];
  for (const { name, version } of packageMap.values()) {
    try {
      const info = await getPackageInfo(name, version);
      if (info.exists) {
        results.push({
          name, version,
          aggregateScore: info.aggregateScore,
          reportURI: info.reportURI,
          checksum: info.checksum,
          signature: info.signature,
        });
      }
    } catch { /* skip */ }
  }

  return results;
}

export async function getPackagesByAuthorDirect(
  authorAddress: string,
  knownPackageNames: string[],
): Promise<AuthorPackageSummary[]> {
  const results: AuthorPackageSummary[] = [];

  for (const name of knownPackageNames) {
    try {
      const versions = await getVersions(name);
      for (const version of versions) {
        const info = await getPackageInfo(name, version);
        if (info.exists && info.author.toLowerCase() === authorAddress.toLowerCase()) {
          results.push({
            name, version,
            aggregateScore: info.aggregateScore,
            reportURI: info.reportURI,
            checksum: info.checksum,
            signature: info.signature,
          });
        }
      }
    } catch { /* skip */ }
  }

  return results;
}
