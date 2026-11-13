import { BrowserProvider, sha256, toUtf8Bytes } from 'ethers';

// Alamat backend (backend/). Kosong = fitur backend nonaktif dan website tetap berjalan seperti sebelumnya.
export const API_URL = String(import.meta.env?.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
export const hasApi = () => API_URL !== '';
export const CATEGORIES = ['Musik', 'Seni & budaya', 'Teknologi', 'Lifestyle'];

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export const sha256Hex = (data) => sha256(typeof data === 'string' ? toUtf8Bytes(data) : data).slice(2);

// Pesan yang ditandatangani wallet. Harus identik dengan authMessage() di backend/src/api/auth.js.
export function authMessage({ method, path, timestamp, contentSha256 }) {
  return `anti-calo-auth\nmethod:${method.toUpperCase()}\npath:${path}\ntimestamp:${timestamp}\ncontent-sha256:${contentSha256 || '-'}`;
}

export function weiToEth(wei) {
  const v = BigInt(wei), base = 10n ** 18n;
  const fraction = (v % base).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${v / base}.${fraction}` : String(v / base);
}

// Backend menyimpan satu field "location"; frontend memisahkan venue dan kota ("Venue, Kota").
export function splitLocation(location = '') {
  const i = location.lastIndexOf(',');
  return i < 0 ? { venue: location.trim(), city: '' } : { venue: location.slice(0, i).trim(), city: location.slice(i + 1).trim() };
}
export const joinLocation = ({ venue, city }) => [venue, city].map((s) => String(s ?? '').trim()).filter(Boolean).join(', ');

export function mapEvent(e, base = API_URL) {
  const d = e.details;
  const { venue, city } = splitLocation(d?.location ?? '');
  return {
    id: e.id, title: d?.title ?? `Event #${e.id}`, category: d?.category ?? '', description: d?.description ?? '',
    date: new Date(Number(e.eventTime) * 1000).toISOString(), venue, city, price: weiToEth(e.ticketPrice),
    capacity: e.maxSupply, sold: e.sold, checkedIn: e.checkedIn, status: e.status === 'canceled' ? 'cancelled' : 'live',
    organizer: e.organizer, checkers: e.gateCheckers ?? [], ticketPriceWei: e.ticketPrice, saleStart: Number(e.saleStart), saleEnd: Number(e.saleEnd),
    eventTime: Number(e.eventTime), maxPerWallet: e.maxPerWallet, resaleCapBps: e.resaleCapBps, posterUrl: d?.posterUrl ? `${base}${d.posterUrl}` : null,
    detailsComplete: Boolean(d), hashStatus: d?.hashStatus ?? 'missing', computedHash: d?.computedHash ?? null, onchainHash: e.detailsHash,
  };
}

export function mapTicket(t, listing = null) {
  const status = listing ? 'listed' : t.status === 'valid' ? 'active' : t.status;
  return { id: t.tokenId, eventId: t.eventId, owner: t.owner, facePrice: weiToEth(t.originalPrice), status,
    ...(listing ? { resalePrice: weiToEth(listing.price) } : {}) };
}

export function browserWallet(injected = globalThis.window?.ethereum, address) {
  if (!injected?.request) throw Error('MetaMask belum ditemukan.');
  return { address, signMessage: async (message) => (await new BrowserProvider(injected).getSigner(address)).signMessage(message) };
}

export function createApiClient({ baseUrl = API_URL, fetchImpl = (...a) => globalThis.fetch(...a), wallet = null, now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (!baseUrl) throw Error('VITE_API_URL belum diisi.');
  let authMode = null;

  async function authHeaders(method, path, payload, file) {
    if (!wallet) throw Error('Hubungkan wallet terlebih dahulu.');
    authMode ??= (await request('GET', '/api/status')).authMode;
    if (authMode === 'dev') return { 'x-wallet-address': wallet.address };   // backend lokal tanpa tanda tangan
    const signedPath = new URL(`${baseUrl}${path}`).pathname;
    const contentSha256 = file ? sha256Hex(new Uint8Array(await file.arrayBuffer())) : typeof payload === 'string' ? sha256Hex(payload) : '';
    const timestamp = now();
    const signature = await wallet.signMessage(authMessage({ method, path: signedPath, timestamp, contentSha256 }));
    return { authorization: `AntiCalo ${wallet.address}:${timestamp}:${signature}`, ...(contentSha256 ? { 'x-content-sha256': contentSha256 } : {}) };
  }

  async function request(method, path, { body, file, auth = false, query } = {}) {
    const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
    const headers = {};
    let payload;
    if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    if (file) { payload = new FormData(); payload.append('poster', file, file.name || 'poster'); }
    if (auth) Object.assign(headers, await authHeaders(method, path, typeof payload === 'string' ? payload : undefined, file));
    let res;
    try { res = await fetchImpl(`${baseUrl}${path}${qs ? `?${qs}` : ''}`, { method, headers, body: payload }); }
    catch { throw Error('Backend tidak dapat dijangkau. Periksa VITE_API_URL, server backend, dan CORS_ORIGINS.'); }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? `Permintaan gagal (HTTP ${res.status}).`);
    return data;
  }

  return {
    status: () => request('GET', '/api/status'),
    config: () => request('GET', '/api/config'),
    roles: (address) => request('GET', `/api/roles/${address}`),
    events: async (query = { limit: 100 }) => (await request('GET', '/api/events', { query })).items.map((e) => mapEvent(e, baseUrl)),
    tickets: async (owner) => (await request('GET', '/api/tickets', { query: { owner, limit: 100 } })).items,
    listings: async (query = {}) => (await request('GET', '/api/listings', { query: { buyable: 1, limit: 100, ...query } })).items,
    hashFor: (details) => request('POST', '/api/details/hash', { body: details }),
    saveDetails: (eventId, details, exists) => request(exists ? 'PUT' : 'POST', `/api/events/${eventId}/details`, { body: details, auth: true }),
    deleteDetails: (eventId) => request('DELETE', `/api/events/${eventId}/details`, { auth: true }),
    uploadPoster: (eventId, file) => request('POST', `/api/events/${eventId}/poster`, { file, auth: true }),
  };
}
