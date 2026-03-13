import { ethers } from 'ethers';
import * as fs from 'fs';

export function computeChecksum(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return ethers.keccak256(data);
}

export async function signChecksumAsync(checksum: string, privateKey: string): Promise<{ signature: string; address: string }> {
  const wallet = new ethers.Wallet(privateKey);
  const signature = await wallet.signMessage(ethers.getBytes(checksum));
  return { signature, address: wallet.address };
}

export function verifyChecksum(checksum: string, signature: string, expectedAddress: string): boolean {
  try {
    const recovered = ethers.verifyMessage(ethers.getBytes(checksum), signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}
