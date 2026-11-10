// Login wallet gaya SIWE (Sign-In With Ethereum) untuk anti-calo.
//
// Memenuhi kebutuhan "login menggunakan wallet". Tanpa backend, verifikasi
// dilakukan di client: wallet menandatangani pesan SIWE, lalu signature
// diverifikasi terhadap alamat. Sesi disimpan di sessionStorage.
//
// CATATAN KEAMANAN: login client-side hanya mengatur tampilan. Otorisasi nyata
// tetap harus dilakukan backend (verifikasi nonce + signature di server) dan
// kontrak. Nonce di sini belum diminta/diverifikasi server, jadi ini belum
// memenuhi SIWE penuh. Saat backend tersedia, ganti verifikasi lokal dengan
// pemanggilan API /auth/nonce dan /auth/verify.
import { BrowserProvider, getAddress, verifyMessage } from 'ethers';
import { CHAIN_ID, sameAddress } from './model.js';

export const SESSION_KEY = 'anticalo-siwe-session-v1';
const DOMAIN = 'anti-calo';

function safeStorage() {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

// Nonce acak. Dengan backend, nilai ini harus berasal dari server.
export function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Susun pesan SIWE (format EIP-4361 yang disederhanakan).
export function buildSiweMessage({ address, nonce, domain = DOMAIN, chainId = CHAIN_ID, issuedAt = new Date().toISOString() }) {
  const wallet = getAddress(address);
  return [
    `${domain} ingin kamu login dengan wallet Ethereum:`,
    wallet,
    '',
    'Tanda tangani untuk masuk ke anti-calo. Tindakan ini gratis dan tidak mengirim transaksi.',
    '',
    `URI: ${globalThis.location?.origin ?? 'https://anti-calo'}`,
    `Version: 1`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

// Verifikasi signature SIWE terhadap alamat yang diklaim.
export function verifySiwe({ message, signature, address }) {
  let recovered;
  try {
    recovered = verifyMessage(message, signature);
  } catch {
    throw Error('Tanda tangan login tidak dapat diverifikasi.');
  }
  if (!sameAddress(recovered, address)) {
    throw Error('Tanda tangan bukan milik wallet yang login.');
  }
  return getAddress(recovered);
}

// Lakukan alur login penuh dengan wallet terinjeksi.
export async function loginWithWallet({ injected = globalThis.window?.ethereum, storage = safeStorage() } = {}) {
  if (!injected?.request) {
    throw Error('MetaMask belum ditemukan. Pasang ekstensi wallet untuk login.');
  }
  const accounts = await injected.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw Error('Tidak ada wallet yang dipilih.');
  const address = getAddress(accounts[0]);
  const chainId = Number(await injected.request({ method: 'eth_chainId' }));

  const nonce = createNonce();
  const issuedAt = new Date().toISOString();
  const message = buildSiweMessage({ address, nonce, chainId, issuedAt });

  const provider = new BrowserProvider(injected, 'any', { cacheTimeout: -1 });
  let signature;
  try {
    const signer = await provider.getSigner();
    signature = await signer.signMessage(message);
  } finally {
    provider.destroy();
  }

  // Verifikasi lokal (pengganti sementara verifikasi server).
  verifySiwe({ message, signature, address });

  const session = { address, chainId, nonce, issuedAt, loggedInAt: Date.now() };
  saveSession(session, storage);
  return session;
}

export function saveSession(session, storage = safeStorage()) {
  try {
    storage?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* abaikan bila storage tidak tersedia */
  }
  return session;
}

export function loadSession(storage = safeStorage()) {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s.address !== 'string') return null;
    return { ...s, address: getAddress(s.address) };
  } catch {
    return null;
  }
}

export function logout(storage = safeStorage()) {
  try {
    storage?.removeItem(SESSION_KEY);
  } catch {
    /* abaikan */
  }
}

export function isLoggedIn(storage = safeStorage()) {
  return loadSession(storage) !== null;
}
