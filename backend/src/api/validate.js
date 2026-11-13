import { id as keccakId, toUtf8Bytes, keccak256 } from 'ethers';
import { bad } from './errors.js';

// Samakan dengan CATEGORIES di src/model.js (tanpa 'Semua').
export const CATEGORIES = ['Musik', 'Seni & budaya', 'Teknologi', 'Lifestyle'];
const FIELDS = ['title', 'description', 'category', 'location'];
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function parseId(value, label = 'ID') {
  if (!/^\d{1,20}$/.test(String(value))) throw bad(`${label} tidak valid.`);
  return String(BigInt(value));
}

export function parseDetails(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Body harus berupa objek JSON.');
  const extra = Object.keys(body).filter((k) => !FIELDS.includes(k));
  if (extra.length) throw bad(`Field tidak dikenal: ${extra.join(', ')}.`);
  const out = {};
  for (const f of FIELDS) {
    if (typeof body[f] !== 'string') throw bad(`Field ${f} wajib berupa teks.`);
    out[f] = body[f].trim();
    if (CONTROL.test(out[f])) throw bad(`Field ${f} memuat karakter yang tidak diizinkan.`);
  }
  if (out.title.length < 3 || out.title.length > 120) throw bad('Judul harus 3–120 karakter.');
  if (out.description.length < 10 || out.description.length > 5000) throw bad('Deskripsi harus 10–5000 karakter.');
  if (!CATEGORIES.includes(out.category)) throw bad(`Kategori harus salah satu dari: ${CATEGORIES.join(', ')}.`);
  if (out.location.length < 3 || out.location.length > 200) throw bad('Lokasi harus 3–200 karakter.');
  return out;
}

// Hash komitmen yang disimpan organizer di EventParams.detailsHash (on-chain).
// keccak256(JSON dengan urutan key tetap). Poster diwakili sha256 isi file agar tidak bisa
// ditukar diam-diam. Jika belum ada poster, posterSha256 = "".
export function computeDetailsHash(d, posterSha256 = '') {
  const canonical = JSON.stringify({ v: 1, title: d.title, description: d.description, category: d.category,
    location: d.location, posterSha256: posterSha256 || '' });
  return keccak256(toUtf8Bytes(canonical));
}
export { keccakId };

export const ZERO_HASH = `0x${'00'.repeat(32)}`;
export function hashStatus(onchain, computed) {
  if (!onchain || onchain === ZERO_HASH) return 'unset';
  return onchain.toLowerCase() === computed.toLowerCase() ? 'match' : 'mismatch';
}
