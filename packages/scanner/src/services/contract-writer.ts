import { ethers } from 'ethers';
import { OPM_REGISTRY_ABI, getEnvOrThrow, getEnvOrDefault, BASE_SEPOLIA_RPC } from '@opm/core';

function getContract() {
  const rpc = getEnvOrDefault('BASE_SEPOLIA_RPC_URL', BASE_SEPOLIA_RPC);
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(getEnvOrThrow('AGENT_PRIVATE_KEY'), provider);
  const address = getEnvOrThrow('CONTRACT_ADDRESS');
  return new ethers.Contract(address, OPM_REGISTRY_ABI, wallet);
}

export async function submitScoreOnChain(
  packageName: string,
  version: string,
  riskScore: number,
  reasoning: string,
): Promise<string> {
  const contract = getContract();
  const truncated = reasoning.slice(0, 256);
  const tx = await contract.submitScore(packageName, version, riskScore, truncated);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function setReportURIOnChain(
  packageName: string,
  version: string,
  uri: string,
): Promise<string> {
  const contract = getContract();
  const tx = await contract.setReportURI(packageName, version, uri);
  const receipt = await tx.wait();
  return receipt.hash;
}
