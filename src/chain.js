import { BrowserProvider, Contract, getAddress, verifyTypedData, ZeroAddress } from 'ethers';
import { CHAIN_ID, QR_TTL, sameAddress } from './model.js';

export const QR_TYPES = {
  CheckIn: [
    { name: 'eventId', type: 'uint256' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'owner', type: 'address' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};
export const NFT_READ_ABI = [
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];
const ERC721_INTERFACE = '0x80ac58cd';
const MAX_UINT256 = (1n << 256n) - 1n;

export function normalizeUint256(value, label = 'ID') {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,78}$/.test(raw) || BigInt(raw) > MAX_UINT256) {
    throw Error(`${label} harus berupa bilangan bulat antara 0 dan batas uint256.`);
  }
  return BigInt(raw).toString();
}
export function normalizeContract(value) {
  let address;
  try { address = getAddress(String(value ?? '').trim()); }
  catch { throw Error('Masukkan alamat kontrak Ethereum yang valid, bukan nama ENS.'); }
  if (address === ZeroAddress) throw Error('Alamat kontrak tidak boleh berupa zero address.');
  return address;
}
export function normalizeChainConfig(config) {
  return {
    contract: normalizeContract(config?.contract),
    eventId: normalizeUint256(config?.eventId, 'Event ID'),
    tokenId: normalizeUint256(config?.tokenId, 'Token ID'),
  };
}
export function qrDomain(contract) {
  return { name: 'AntiCaloCheckIn', version: '1', chainId: CHAIN_ID, verifyingContract: normalizeContract(contract) };
}
function signedShape(payload) {
  if (!payload || Array.isArray(payload) || payload.v !== 1 || payload.mode !== 'onchain' || payload.chainId !== CHAIN_ID) {
    throw Error('Payload harus berupa QR on-chain anti-calo v1 pada Sepolia. QR demo tidak digunakan di halaman ini.');
  }
  normalizeContract(payload.contract);
  const m = payload.message;
  if (!m || Array.isArray(m)) throw Error('Message EIP-712 tidak ditemukan.');
  normalizeUint256(m.eventId, 'Event ID');
  normalizeUint256(m.tokenId, 'Token ID');
  try { if (getAddress(m.owner) === ZeroAddress) throw Error(); }
  catch { throw Error('Alamat pemilik di dalam QR tidak valid.'); }
  if (!Number.isSafeInteger(m.issuedAt) || !Number.isSafeInteger(m.expiresAt) || m.issuedAt < 0 || m.expiresAt - m.issuedAt !== QR_TTL) {
    throw Error('Waktu QR harus berupa integer detik dengan masa berlaku 120 detik.');
  }
  if (!/^0x[\da-fA-F]{64}$/.test(m.nonce ?? '') || !/^0x[\da-fA-F]{130}$/.test(payload.signature ?? '')) {
    throw Error('Nonce atau tanda tangan QR tidak valid.');
  }
  return payload;
}
export function parseSignedQR(input) {
  if (typeof input !== 'string' || input.length > 8192) throw Error('Payload QR harus berupa JSON, maksimal 8 KB.');
  let p;
  try { p = JSON.parse(input); }
  catch { throw Error('Payload QR bukan JSON yang valid.'); }
  return signedShape(p);
}
export function validateSignedQR(payload, { contract, owner, eventId, tokenId, now = Math.floor(Date.now() / 1000) }) {
  signedShape(payload);
  const expected = normalizeChainConfig({ contract, eventId, tokenId });
  if (!sameAddress(payload.contract, expected.contract)) throw Error('Alamat kontrak QR berbeda dari konfigurasi.');
  const m = payload.message;
  if (normalizeUint256(m.eventId) !== expected.eventId || normalizeUint256(m.tokenId) !== expected.tokenId || !sameAddress(m.owner, owner)) {
    throw Error('Event, token, atau pemilik QR tidak cocok dengan pemeriksaan.');
  }
  if (!Number.isSafeInteger(now) || m.issuedAt > now || m.expiresAt <= now) throw Error('QR kedaluwarsa atau waktunya belum berlaku.');
  let recovered;
  try { recovered = verifyTypedData(qrDomain(expected.contract), QR_TYPES, m, payload.signature); }
  catch { throw Error('Tanda tangan QR tidak dapat diverifikasi.'); }
  if (!sameAddress(recovered, owner)) throw Error('Tanda tangan bukan milik pemilik NFT saat ini.');
  return recovered;
}
function injectedProvider(injected) {
  if (!injected?.request) throw Error('MetaMask belum ditemukan. Buka halaman ini pada browser yang memiliki ekstensi wallet.');
  return new BrowserProvider(injected, 'any', { cacheTimeout: -1 });
}
async function requireSepolia(injected) {
  if (!injected?.request) throw Error('MetaMask belum ditemukan. Pasang ekstensi MetaMask atau gunakan akun demo.');
  const chainId = Number(await injected.request({ method: 'eth_chainId' }));
  if (chainId !== CHAIN_ID) throw Error('Pindahkan wallet ke Ethereum Sepolia terlebih dahulu.');
  return chainId;
}
export async function connectInjectedWallet(injected = globalThis.window?.ethereum) {
  if (!injected?.request) throw Error('MetaMask belum ditemukan. Pasang ekstensi MetaMask atau gunakan akun demo.');
  const accounts = await injected.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw Error('Tidak ada wallet yang dipilih.');
  const current = await injected.request({ method: 'eth_accounts' });
  if (!Array.isArray(current) || !current.length) throw Error('Koneksi wallet tidak aktif. Hubungkan kembali.');
  const chainId = Number(await injected.request({ method: 'eth_chainId' }));
  return { address: getAddress(current[0]), chainId };
}
export async function switchToSepolia(injected = globalThis.window?.ethereum) {
  if (!injected?.request) throw Error('MetaMask belum ditemukan.');
  await injected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
  await requireSepolia(injected);
}

// Fungsi ERC-721 standar dapat dibaca tanpa menebak ABI bisnis marketplace.
export async function readOnchainTicket({ contract, tokenId, injected = globalThis.window?.ethereum }) {
  const address = normalizeContract(contract), id = normalizeUint256(tokenId, 'Token ID');
  await requireSepolia(injected);
  const provider = injectedProvider(injected);
  try {
    const block = await provider.getBlock('latest');
    if (!block || !Number.isSafeInteger(block.timestamp)) throw Error('Blok Sepolia terbaru belum dapat dibaca. Coba ulang.');
    const code = await provider.getCode(address, block.number);
    if (code === '0x') throw Error('Tidak ada kontrak pada alamat ini di Sepolia. Periksa jaringan dan alamat deployment.');
    const nft = new Contract(address, NFT_READ_ABI, provider);
    let supported;
    try { supported = await nft.supportsInterface(ERC721_INTERFACE, { blockTag: block.number }); }
    catch { throw Error('Kontrak belum mendukung pemeriksaan ERC-721 standar. Dibutuhkan adapter sesuai ABI tim.'); }
    if (!supported) throw Error('Alamat ini bukan kontrak yang menyatakan dukungan ERC-721.');
    let owner;
    try { owner = getAddress(await nft.ownerOf(id, { blockTag: block.number })); }
    catch { throw Error('Pemilik NFT tidak dapat dibaca. Token mungkin belum dibuat atau sudah dibakar.'); }
    if (owner === ZeroAddress) throw Error('Token tidak memiliki pemilik yang valid.');
    await requireSepolia(injected);
    return { contract: address, tokenId: id, owner, chainId: CHAIN_ID, blockNumber: block.number, blockTimestamp: block.timestamp };
  } finally { provider.destroy(); }
}
export async function signOnchainQR({ contract, eventId, tokenId, injected = globalThis.window?.ethereum }) {
  const config = normalizeChainConfig({ contract, eventId, tokenId });
  const ticket = await readOnchainTicket({ ...config, injected });
  const provider = injectedProvider(injected);
  try {
    const signer = await provider.getSigner(), owner = await signer.getAddress();
    if (!sameAddress(ticket.owner, owner)) throw Error('Wallet yang terhubung bukan pemilik NFT ini.');
    const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
    const message = {
      eventId: config.eventId, tokenId: config.tokenId, owner,
      issuedAt: ticket.blockTimestamp, expiresAt: ticket.blockTimestamp + QR_TTL,
      nonce: '0x' + [...bytes].map(x => x.toString(16).padStart(2, '0')).join(''),
    };
    await requireSepolia(injected);
    const signature = await signer.signTypedData(qrDomain(config.contract), QR_TYPES, message);
    // Jangan menampilkan hasil lama ketika akun, jaringan, atau pemilik berubah saat popup wallet terbuka.
    await requireSepolia(injected);
    const accounts = await injected.request({ method: 'eth_accounts' });
    if (!sameAddress(accounts?.[0], owner)) throw Error('Akun wallet berubah saat proses tanda tangan. Buat QR ulang.');
    const latest = await readOnchainTicket({ ...config, injected });
    const payload = { v: 1, mode: 'onchain', chainId: CHAIN_ID, contract: config.contract, message, signature };
    validateSignedQR(payload, { ...config, owner: latest.owner, now: Math.max(latest.blockTimestamp, Math.floor(Date.now() / 1000)) });
    return payload;
  } finally { provider.destroy(); }
}
export async function verifyOnchainQR({ input, contract, eventId, tokenId, injected = globalThis.window?.ethereum }) {
  const config = normalizeChainConfig({ contract, eventId, tokenId }), payload = parseSignedQR(input);
  // Tolak domain/token yang salah sebelum melakukan permintaan RPC.
  if (!sameAddress(payload.contract, config.contract) || normalizeUint256(payload.message.tokenId) !== config.tokenId || normalizeUint256(payload.message.eventId) !== config.eventId) {
    throw Error('Kontrak, token, atau event QR berbeda dari konfigurasi pemeriksaan.');
  }
  const ticket = await readOnchainTicket({ ...config, injected });
  const signer = validateSignedQR(payload, { ...config, owner: ticket.owner, now: Math.max(ticket.blockTimestamp, Math.floor(Date.now() / 1000)) });
  return { ...ticket, signer, eventId: config.eventId, expiresAt: payload.message.expiresAt };
}
// ABI aplikasi belum tersedia. Jangan kirim transaksi dengan fungsi kontrak yang ditebak.
export async function submitOnchainTransaction() {
  throw Error('Integrasi transaksi belum aktif: membutuhkan alamat kontrak, ABI final, dan aturan check-in on-chain.');
}
