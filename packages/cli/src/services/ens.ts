import { ethers } from 'ethers';
import { getEnvOrDefault } from '@opm/core';

function getMainnetProvider(): ethers.JsonRpcProvider {
  const rpc = getEnvOrDefault('ETH_MAINNET_RPC_URL', 'https://eth.llamarpc.com');
  return new ethers.JsonRpcProvider(rpc);
}

export async function resolveENSName(address: string): Promise<string | null> {
  try {
    const provider = getMainnetProvider();
    return await provider.lookupAddress(address);
  } catch {
    return null;
  }
}

export async function resolveAddress(ensName: string): Promise<string | null> {
  try {
    const provider = getMainnetProvider();
    return await provider.resolveName(ensName);
  } catch {
    return null;
  }
}

export interface ENSProfile {
  name: string | null;
  avatar: string | null;
  url: string | null;
  github: string | null;
  twitter: string | null;
}

export async function getENSProfile(address: string): Promise<ENSProfile> {
  const provider = getMainnetProvider();
  const name = await provider.lookupAddress(address).catch(() => null);

  const profile: ENSProfile = { name, avatar: null, url: null, github: null, twitter: null };
  if (!name) return profile;

  try {
    const resolver = await provider.getResolver(name);
    if (!resolver) return profile;

    const [avatar, url, github, twitter] = await Promise.allSettled([
      resolver.getText('avatar'),
      resolver.getText('url'),
      resolver.getText('com.github'),
      resolver.getText('com.twitter'),
    ]);

    profile.avatar = avatar.status === 'fulfilled' ? avatar.value : null;
    profile.url = url.status === 'fulfilled' ? url.value : null;
    profile.github = github.status === 'fulfilled' ? github.value : null;
    profile.twitter = twitter.status === 'fulfilled' ? twitter.value : null;
  } catch { /* ENS text record lookup is best-effort */ }

  return profile;
}
