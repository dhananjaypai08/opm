import { ethers } from 'ethers';
import { OPM_REGISTRY_ABI, getEnvOrThrow, getEnvOrDefault, BASE_SEPOLIA_RPC } from '@opm/core';
import type { OnChainPackageInfo, AuthorProfile } from '@opm/core';

function getReadContract() {
  const rpc = getEnvOrDefault('BASE_SEPOLIA_RPC_URL', BASE_SEPOLIA_RPC);
  const provider = new ethers.JsonRpcProvider(rpc);
  const address = getEnvOrThrow('CONTRACT_ADDRESS');
  return new ethers.Contract(address, OPM_REGISTRY_ABI, provider);
}

function getWriteContract() {
  const rpc = getEnvOrDefault('BASE_SEPOLIA_RPC_URL', BASE_SEPOLIA_RPC);
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(getEnvOrThrow('OPM_PRIVATE_KEY'), provider);
  const address = getEnvOrThrow('CONTRACT_ADDRESS');
  return new ethers.Contract(address, OPM_REGISTRY_ABI, wallet);
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
