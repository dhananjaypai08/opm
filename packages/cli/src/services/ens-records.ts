import { ethers } from 'ethers';
import {
  getEnvOrDefault,
  ETH_SEPOLIA_RPC,
  ETH_MAINNET_RPC,
  DEFAULT_CONTRACT_ADDRESS,
  ENS_REGISTRY_ADDRESS,
  OPM_ENS_KEYS,
} from '@opm/core';
import type { OPMENSRecords } from '@opm/core';

const RESOLVER_ABI = [
  'function setText(bytes32 node, string key, string value) external',
  'function text(bytes32 node, string key) view returns (string)',
  'function setContenthash(bytes32 node, bytes calldata hash) external',
  'function contenthash(bytes32 node) view returns (bytes)',
  'function multicall(bytes[] calldata data) external returns (bytes[] memory)',
];

const REGISTRY_ABI = [
  'function resolver(bytes32 node) view returns (address)',
  'function owner(bytes32 node) view returns (address)',
  'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external',
];

const FILEVERSE_PORTAL_ABI = [
  'function files(uint256) view returns (string metadataIPFSHash, string contentIPFSHash, string gateIPFSHash, uint8 fileType, uint256 version)',
];

const FILEVERSE_RPCS = [
  'https://rpc.gnosischain.com',
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://eth.llamarpc.com',
  'https://sepolia.base.org',
];

type ChainLabel = 'sepolia' | 'mainnet';

function getProviders(): Array<{ label: ChainLabel; provider: ethers.JsonRpcProvider }> {
  return [
    {
      label: 'sepolia',
      provider: new ethers.JsonRpcProvider(
        getEnvOrDefault('ETH_SEPOLIA_RPC_URL', ETH_SEPOLIA_RPC),
      ),
    },
    {
      label: 'mainnet',
      provider: new ethers.JsonRpcProvider(
        getEnvOrDefault('ETH_MAINNET_RPC_URL', ETH_MAINNET_RPC),
      ),
    },
  ];
}

async function findResolver(ensName: string): Promise<{
  provider: ethers.JsonRpcProvider;
  resolverAddress: string;
  chain: ChainLabel;
} | null> {
  for (const { label, provider } of getProviders()) {
    try {
      const resolver = await provider.getResolver(ensName);
      if (resolver) {
        return { provider, resolverAddress: resolver.address, chain: label };
      }
    } catch { /* try next chain */ }
  }
  return null;
}

function sanitizeLabel(name: string): string {
  return name.replace(/[^a-zA-Z0-9-]/g, '-').replace(/^-+|-+$/g, '');
}

export function pkgRecordKey(packageName: string, field: string): string {
  return `opm.pkg.${sanitizeLabel(packageName)}.${field}`;
}

/**
 * Writes OPM text records to an ENS name's resolver.
 * The signer (privateKey) must be the manager/owner of the ENS name.
 */
export async function writeENSRecords(
  ensName: string,
  privateKey: string,
  records: Record<string, string>,
  onStatus?: (msg: string) => void,
): Promise<{ txHash: string; chain: ChainLabel; recordCount: number } | null> {
  const log = onStatus || (() => {});

  const resolved = await findResolver(ensName);
  if (!resolved) {
    log(`No resolver found for ${ensName}`);
    return null;
  }

  const { provider, resolverAddress, chain } = resolved;
  const wallet = new ethers.Wallet(privateKey, provider);
  const node = ethers.namehash(ensName);
  const resolver = new ethers.Contract(resolverAddress, RESOLVER_ABI, wallet);

  const balance = await provider.getBalance(wallet.address).catch(() => 0n);
  const balanceEth = ethers.formatEther(balance);
  log(`Signer ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)} has ${balanceEth} ETH on ${chain}`);

  if (balance === 0n) {
    log(`No ETH on ${chain} — fund this wallet on Ethereum ${chain} (not Base ${chain})`);
    return null;
  }

  const entries = Object.entries(records).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return null;

  log(`Writing ${entries.length} record(s) to ${ensName} on ${chain}`);

  try {
    if (entries.length > 1) {
      try {
        const iface = new ethers.Interface(RESOLVER_ABI);
        const calldata = entries.map(([key, value]) =>
          iface.encodeFunctionData('setText', [node, key, value]),
        );
        const tx = await resolver.multicall(calldata);
        const receipt = await tx.wait();
        log(`${entries.length} records set via multicall`);
        return { txHash: receipt.hash, chain, recordCount: entries.length };
      } catch (mcErr: any) {
        log(`Multicall failed, trying individual writes...`);
      }
    }

    let lastHash = '';
    for (const [key, value] of entries) {
      const tx = await resolver.setText(node, key, value);
      const receipt = await tx.wait();
      lastHash = receipt.hash;
      log(`Set ${key}`);
    }
    return { txHash: lastHash, chain, recordCount: entries.length };
  } catch (err: any) {
    const raw = err?.shortMessage || err?.message || 'unknown error';
    log(`Error: ${raw.slice(0, 150)}`);
    if (raw.includes('insufficient funds')) {
      log(`Balance: ${balanceEth} ETH on ${chain} — may not cover gas for ${entries.length} record(s)`);
    } else if (raw.includes('reverted')) {
      log(`Resolver reverted — signer may not be the manager of ${ensName} (check if name is wrapped)`);
    }
    return null;
  }
}

export async function readOPMRecords(ensName: string): Promise<OPMENSRecords> {
  for (const { provider } of getProviders()) {
    try {
      const resolver = await provider.getResolver(ensName);
      if (!resolver) continue;

      const node = ethers.namehash(ensName);
      const resolverContract = new ethers.Contract(
        resolver.address, RESOLVER_ABI, provider,
      );

      const keys = Object.values(OPM_ENS_KEYS);
      const results = await Promise.allSettled(
        keys.map((key) => resolverContract.text(node, key)),
      );

      const records: OPMENSRecords = {};
      const fieldNames = Object.keys(OPM_ENS_KEYS) as (keyof OPMENSRecords)[];

      let hasAny = false;
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'fulfilled') {
          const value = (results[i] as PromiseFulfilledResult<string>).value;
          if (value) {
            records[fieldNames[i]] = value;
            hasAny = true;
          }
        }
      }

      if (hasAny) return records;
    } catch { /* try next chain */ }
  }
  return {};
}

export async function readPackageENSRecords(
  ensName: string,
  packageName: string,
): Promise<OPMENSRecords> {
  const fields = ['version', 'checksum', 'fileverse', 'risk_score', 'signature'];
  const keys = fields.map((f) => pkgRecordKey(packageName, f));

  for (const { provider } of getProviders()) {
    try {
      const resolver = await provider.getResolver(ensName);
      if (!resolver) continue;

      const node = ethers.namehash(ensName);
      const resolverContract = new ethers.Contract(
        resolver.address, RESOLVER_ABI, provider,
      );

      const results = await Promise.allSettled(
        keys.map((key) => resolverContract.text(node, key)),
      );

      const mapped: (keyof OPMENSRecords)[] = [
        'version', 'checksum', 'fileverse', 'riskScore', 'signature',
      ];
      const records: OPMENSRecords = {};
      let hasAny = false;

      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'fulfilled') {
          const value = (results[i] as PromiseFulfilledResult<string>).value;
          if (value) {
            records[mapped[i]] = value;
            hasAny = true;
          }
        }
      }

      if (hasAny) return records;
    } catch { /* try next chain */ }
  }
  return {};
}

/**
 * Creates a subname under a parent ENS name and writes OPM text records to it.
 * Requires ownership of the parent name.
 * Example: createPackageSubname('djpai.eth', 'express', key, records) → express.djpai.eth
 */
export async function createPackageSubname(
  parentName: string,
  packageName: string,
  privateKey: string,
  records: Record<string, string>,
  onStatus?: (msg: string) => void,
): Promise<{ txHash: string; subname: string; chain: ChainLabel } | null> {
  const log = onStatus || (() => {});

  const label = sanitizeLabel(packageName);
  const subname = `${label}.${parentName}`;

  const resolved = await findResolver(parentName);
  if (!resolved) {
    log(`No resolver found for parent ${parentName}`);
    return null;
  }

  const { provider, resolverAddress, chain } = resolved;
  const wallet = new ethers.Wallet(privateKey, provider);

  const registry = new ethers.Contract(ENS_REGISTRY_ADDRESS, REGISTRY_ABI, wallet);
  const parentNode = ethers.namehash(parentName);
  const labelHash = ethers.keccak256(ethers.toUtf8Bytes(label));

  try {
    const owner = await registry.owner(parentNode);
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      log(`Registry owner of ${parentName}: ${owner.slice(0, 10)}... (name may be wrapped via NameWrapper)`);
      return null;
    }

    log(`Creating subname ${subname} on ${chain}`);
    const tx = await registry.setSubnodeRecord(
      parentNode,
      labelHash,
      wallet.address,
      resolverAddress,
      0,
    );
    const receipt = await tx.wait();
    log(`Subname created: ${subname}`);

    if (Object.keys(records).length > 0) {
      const writeResult = await writeENSRecords(subname, privateKey, records, log);
      if (writeResult) {
        return { txHash: writeResult.txHash, subname, chain };
      }
    }

    return { txHash: receipt.hash, subname, chain };
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || 'unknown error';
    log(`Subname failed: ${msg.slice(0, 120)}`);
    return null;
  }
}

/**
 * Encodes an IPFS CID (v0 "Qm..." or v1 "bafy...") into ENS contenthash bytes.
 * Format: 0xe301 (IPFS namespace varint) + CID bytes
 */
export function encodeIPFSContenthash(cid: string): string {
  const IPFS_NAMESPACE = 'e301';

  if (cid.startsWith('Qm')) {
    const decoded = ethers.decodeBase58(cid);
    let hex = decoded.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    return '0x' + IPFS_NAMESPACE + '0170' + hex;
  }

  if (cid.startsWith('bafy')) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    const stripped = cid.slice(1); // remove multibase prefix 'b'
    let bits = '';
    for (const c of stripped) {
      const val = alphabet.indexOf(c);
      if (val === -1) throw new Error(`Invalid base32 character: ${c}`);
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
    return '0x' + IPFS_NAMESPACE + hex;
  }

  throw new Error(`Unsupported CID format: ${cid.slice(0, 10)}...`);
}

/**
 * Decodes an ENS contenthash back to a human-readable string.
 * Returns the protocol and hash (e.g. "ipfs://Qm...")
 */
export function decodeContenthash(hex: string): string | null {
  if (!hex || hex === '0x') return null;
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.startsWith('e301')) {
    const cidBytes = clean.slice(4);
    // CIDv1 raw (0155) with sha256 (1220)
    if (cidBytes.startsWith('0155') && cidBytes.length >= 72) {
      const sha256Hex = cidBytes.slice(8);
      return `ipfs://bafkrei...${sha256Hex.slice(0, 12)}`;
    }
    // CIDv1 dag-pb (0170) with sha256 (1220)
    if (cidBytes.startsWith('0170') && cidBytes.length >= 72) {
      const sha256Hex = cidBytes.slice(8);
      return `ipfs://Qm...${sha256Hex.slice(0, 12)}`;
    }
    return `ipfs://${cidBytes.slice(0, 16)}...`;
  }
  if (clean.startsWith('e501')) {
    return `ipns://${clean.slice(4, 20)}...`;
  }
  return null;
}

/**
 * Computes an IPFS-compatible contenthash from arbitrary content.
 * Uses SHA-256 with CIDv1 raw codec (0x55) — the same encoding as `ipfs add --raw-leaves`.
 * Returns the contenthash hex string (0xe301...) for ENS.
 */
export function computeContenthashFromContent(content: string): string {
  const hash = ethers.sha256(ethers.toUtf8Bytes(content)).slice(2);
  // CIDv1: version(01) + raw codec(55) + sha256 multihash(1220 + hash)
  return '0xe3010155' + '1220' + hash;
}

/**
 * Sets the ENS contenthash.
 * Accepts either a raw IPFS CID (Qm.../bafy...) or pre-encoded contenthash bytes.
 */
export async function setENSContenthash(
  ensName: string,
  privateKey: string,
  contenthashOrCid: string,
  onStatus?: (msg: string) => void,
): Promise<{ txHash: string; chain: ChainLabel } | null> {
  const log = onStatus || (() => {});

  const resolved = await findResolver(ensName);
  if (!resolved) {
    log(`No resolver found for ${ensName}`);
    return null;
  }

  const { provider, resolverAddress, chain } = resolved;
  const wallet = new ethers.Wallet(privateKey, provider);
  const node = ethers.namehash(ensName);
  const resolver = new ethers.Contract(resolverAddress, RESOLVER_ABI, wallet);

  try {
    let cid = contenthashOrCid;
    if (cid.startsWith('ipfs://')) cid = cid.slice(7);
    if (cid.startsWith('/ipfs/')) cid = cid.slice(6);
    const encoded = cid.startsWith('0x')
      ? cid
      : encodeIPFSContenthash(cid);
    log(`Setting contenthash on ${ensName}...`);
    const tx = await resolver.setContenthash(node, encoded);
    const receipt = await tx.wait();
    log(`Contenthash set on ${chain}`);
    return { txHash: receipt.hash, chain };
  } catch (err: any) {
    const raw = err?.shortMessage || err?.message || 'unknown error';
    log(`Contenthash error: ${raw.slice(0, 120)}`);
    return null;
  }
}

/**
 * Reads the contenthash from an ENS name's resolver.
 */
export async function readENSContenthash(ensName: string): Promise<string | null> {
  for (const { provider } of getProviders()) {
    try {
      const resolver = await provider.getResolver(ensName);
      if (!resolver) continue;

      const node = ethers.namehash(ensName);
      const resolverContract = new ethers.Contract(
        resolver.address, RESOLVER_ABI, provider,
      );

      const raw: string = await resolverContract.contenthash(node);
      if (raw && raw !== '0x') return raw;
    } catch { /* try next chain */ }
  }
  return null;
}

/**
 * Parses a Fileverse link into portal address and file ID.
 * Example: https://docs.fileverse.io/0x05EfCD.../37#key=... → { portalAddress, fileId: 37 }
 */
export function parseFileverseLink(link: string): { portalAddress: string; fileId: number } | null {
  try {
    const url = new URL(link);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0].startsWith('0x')) {
      const id = parseInt(parts[1], 10);
      if (!isNaN(id)) return { portalAddress: parts[0], fileId: id };
    }
  } catch { /* not a valid URL */ }
  return null;
}

/**
 * Reads the IPFS content hash from a Fileverse Portal smart contract.
 * Fileverse stores metadataIPFSHash and contentIPFSHash on-chain for each document.
 */
export async function readFileverseContentHash(
  portalAddress: string,
  fileId: number,
  onStatus?: (msg: string) => void,
): Promise<string | null> {
  const log = onStatus || (() => {});

  for (const rpc of FILEVERSE_RPCS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      const portal = new ethers.Contract(portalAddress, FILEVERSE_PORTAL_ABI, provider);
      const file = await portal.files(fileId);
      const hash = file.metadataIPFSHash || file.contentIPFSHash;
      if (hash) {
        log(`Fileverse IPFS hash: ${hash}`);
        return hash;
      }
    } catch { /* try next chain */ }
  }

  log('Could not read IPFS hash from Fileverse portal contract');
  return null;
}

/**
 * Builds the full set of OPM text records for a package push.
 * Includes both author-level (opm.*) and per-package (opm.pkg.<name>.*) records.
 */
export function buildOPMRecords(data: {
  packageName: string;
  version: string;
  checksum: string;
  signature: string;
  reportURI?: string;
  riskScore?: number;
  existingPackages?: string;
}): Record<string, string> {
  const records: Record<string, string> = {};

  records['url'] = `https://www.npmjs.com/package/${data.packageName}`;

  records[OPM_ENS_KEYS.version] = data.version;
  records[OPM_ENS_KEYS.checksum] = data.checksum;
  records[OPM_ENS_KEYS.signature] = data.signature;
  records[OPM_ENS_KEYS.contract] = DEFAULT_CONTRACT_ADDRESS;

  if (data.reportURI && !data.reportURI.startsWith('local://')) {
    records[OPM_ENS_KEYS.fileverse] = data.reportURI;
  }

  if (data.riskScore !== undefined) {
    records[OPM_ENS_KEYS.riskScore] = String(data.riskScore);
  }

  const packagesList = data.existingPackages
    ? [...new Set([
        ...data.existingPackages.split(',').map((s) => s.trim()).filter(Boolean),
        data.packageName,
      ])].join(',')
    : data.packageName;
  records[OPM_ENS_KEYS.packages] = packagesList;

  records[pkgRecordKey(data.packageName, 'version')] = data.version;
  records[pkgRecordKey(data.packageName, 'checksum')] = data.checksum;
  records[pkgRecordKey(data.packageName, 'signature')] = data.signature;

  if (data.reportURI && !data.reportURI.startsWith('local://')) {
    records[pkgRecordKey(data.packageName, 'fileverse')] = data.reportURI;
  }

  if (data.riskScore !== undefined) {
    records[pkgRecordKey(data.packageName, 'risk_score')] = String(data.riskScore);
  }

  return records;
}
