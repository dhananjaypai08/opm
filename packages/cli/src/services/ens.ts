import { createPublicClient, http } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { addEnsContracts } from '@ensdomains/ensjs';
import { getName } from '@ensdomains/ensjs/public';
import { getRecords } from '@ensdomains/ensjs/public';
import { getAddressRecord } from '@ensdomains/ensjs/public';
import { getEnvOrDefault, ETH_SEPOLIA_RPC, ETH_MAINNET_RPC } from '@opm/core';

function getSepoliaClient() {
  return createPublicClient({
    chain: addEnsContracts(sepolia),
    transport: http(getEnvOrDefault('ETH_SEPOLIA_RPC_URL', ETH_SEPOLIA_RPC)),
  });
}

function getMainnetClient() {
  return createPublicClient({
    chain: addEnsContracts(mainnet),
    transport: http(getEnvOrDefault('ETH_MAINNET_RPC_URL', ETH_MAINNET_RPC)),
  });
}

export async function resolveENSName(address: string): Promise<string | null> {
  const addr = address as `0x${string}`;
  const clients = [
    { client: getSepoliaClient(), label: 'sepolia' },
    { client: getMainnetClient(), label: 'mainnet' },
  ];

  const results = await Promise.allSettled(
    clients.map(({ client }) =>
      getName(client as any, { address: addr, allowMismatch: true }),
    ),
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value?.name) {
      return result.value.name;
    }
  }
  return null;
}

export async function resolveAddress(ensName: string): Promise<string | null> {
  const clients = [
    { client: getSepoliaClient(), label: 'sepolia' },
    { client: getMainnetClient(), label: 'mainnet' },
  ];

  const results = await Promise.allSettled(
    clients.map(({ client }) =>
      getAddressRecord(client as any, { name: ensName, coin: 'ETH' }),
    ),
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value?.value) {
      return result.value.value;
    }
  }
  return null;
}

export interface ENSProfile {
  name: string | null;
  avatar: string | null;
  url: string | null;
  github: string | null;
  twitter: string | null;
  description: string | null;
  email: string | null;
}

export async function getENSProfile(address: string): Promise<ENSProfile> {
  const profile: ENSProfile = {
    name: null, avatar: null, url: null,
    github: null, twitter: null, description: null, email: null,
  };

  const name = await resolveENSName(address);
  if (!name) return profile;
  profile.name = name;

  const clients = [
    getSepoliaClient(),
    getMainnetClient(),
  ];

  for (const client of clients) {
    try {
      const records = await getRecords(client as any, {
        name,
        texts: ['avatar', 'url', 'com.github', 'com.twitter', 'description', 'email'],
        contentHash: false,
        abi: false,
      });

      if (records?.texts?.length > 0) {
        for (const t of records.texts) {
          if (t.key === 'avatar' && t.value) profile.avatar = t.value;
          if (t.key === 'url' && t.value) profile.url = t.value;
          if (t.key === 'com.github' && t.value) profile.github = t.value;
          if (t.key === 'com.twitter' && t.value) profile.twitter = t.value;
          if (t.key === 'description' && t.value) profile.description = t.value;
          if (t.key === 'email' && t.value) profile.email = t.value;
        }
        if (records.texts.some((t) => t.value)) return profile;
      }
    } catch { /* try next client */ }
  }

  return profile;
}

export async function getENSTextRecords(
  ensName: string,
  keys: string[],
): Promise<Record<string, string>> {
  const clients = [getSepoliaClient(), getMainnetClient()];

  for (const client of clients) {
    try {
      const records = await getRecords(client as any, {
        name: ensName,
        texts: keys,
        contentHash: false,
        abi: false,
      });

      if (records?.texts?.length > 0) {
        const result: Record<string, string> = {};
        for (const t of records.texts) {
          if (t.value) result[t.key] = t.value;
        }
        if (Object.keys(result).length > 0) return result;
      }
    } catch { /* try next client */ }
  }

  return {};
}
