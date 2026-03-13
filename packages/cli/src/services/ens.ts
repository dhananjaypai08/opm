import { ethers } from 'ethers';
import { getEnvOrDefault, BASE_SEPOLIA_RPC } from '@opm/core';

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

function getSepoliaProvider(): ethers.JsonRpcProvider {
  const rpc = getEnvOrDefault('ETH_SEPOLIA_RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com');
  const network = new ethers.Network('sepolia', 11155111);
  network.attachPlugin(new ethers.EnsPlugin(ENS_REGISTRY));
  return new ethers.JsonRpcProvider(rpc, network, { staticNetwork: network });
}

function getBaseSepoliaProvider(): ethers.JsonRpcProvider {
  const rpc = getEnvOrDefault('BASE_SEPOLIA_RPC_URL', BASE_SEPOLIA_RPC);
  const network = new ethers.Network('base-sepolia', 84532);
  network.attachPlugin(new ethers.EnsPlugin(ENS_REGISTRY));
  return new ethers.JsonRpcProvider(rpc, network, { staticNetwork: network });
}

function getMainnetProvider(): ethers.JsonRpcProvider {
  const rpc = getEnvOrDefault('ETH_MAINNET_RPC_URL', 'https://eth.llamarpc.com');
  return new ethers.JsonRpcProvider(rpc);
}

export async function resolveENSName(address: string): Promise<string | null> {
  const [sepolia, baseSepolia, mainnet] = await Promise.allSettled([
    getSepoliaProvider().lookupAddress(address),
    getBaseSepoliaProvider().lookupAddress(address),
    getMainnetProvider().lookupAddress(address),
  ]);

  if (sepolia.status === 'fulfilled' && sepolia.value) return sepolia.value;
  if (baseSepolia.status === 'fulfilled' && baseSepolia.value) return baseSepolia.value;
  if (mainnet.status === 'fulfilled' && mainnet.value) return mainnet.value;
  return null;
}

export async function resolveAddress(ensName: string): Promise<string | null> {
  const [sepolia, baseSepolia, mainnet] = await Promise.allSettled([
    getSepoliaProvider().resolveName(ensName),
    getBaseSepoliaProvider().resolveName(ensName),
    getMainnetProvider().resolveName(ensName),
  ]);

  if (sepolia.status === 'fulfilled' && sepolia.value) return sepolia.value;
  if (baseSepolia.status === 'fulfilled' && baseSepolia.value) return baseSepolia.value;
  if (mainnet.status === 'fulfilled' && mainnet.value) return mainnet.value;
  return null;
}

export interface ENSProfile {
  name: string | null;
  avatar: string | null;
  url: string | null;
  github: string | null;
  twitter: string | null;
}

async function resolveTextRecords(provider: ethers.JsonRpcProvider, name: string): Promise<Partial<ENSProfile>> {
  try {
    const resolver = await provider.getResolver(name);
    if (!resolver) return {};

    const [avatar, url, github, twitter] = await Promise.allSettled([
      resolver.getText('avatar'),
      resolver.getText('url'),
      resolver.getText('com.github'),
      resolver.getText('com.twitter'),
    ]);

    return {
      avatar: avatar.status === 'fulfilled' ? avatar.value : null,
      url: url.status === 'fulfilled' ? url.value : null,
      github: github.status === 'fulfilled' ? github.value : null,
      twitter: twitter.status === 'fulfilled' ? twitter.value : null,
    };
  } catch {
    return {};
  }
}

export async function getENSProfile(address: string): Promise<ENSProfile> {
  const profile: ENSProfile = { name: null, avatar: null, url: null, github: null, twitter: null };

  const providers = [
    { provider: getSepoliaProvider(), label: 'sepolia' },
    { provider: getBaseSepoliaProvider(), label: 'base-sepolia' },
    { provider: getMainnetProvider(), label: 'mainnet' },
  ];

  for (const { provider } of providers) {
    const name = await provider.lookupAddress(address).catch(() => null);
    if (name) {
      profile.name = name;
      Object.assign(profile, await resolveTextRecords(provider, name));
      return profile;
    }
  }

  return profile;
}
