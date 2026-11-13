import crypto from 'node:crypto';
import { verifyMessage, isAddress } from 'ethers';
import { unauthorized, forbidden, bad } from './errors.js';
import { ADMIN_ROLE } from '../indexer/handlers.js';
import { id as keccakId } from 'ethers';

export const ORGANIZER_ROLE = keccakId('ORGANIZER_ROLE');

export const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const clean = (h) => String(h ?? '').trim().toLowerCase().replace(/^0x/, '');

// Pesan yang ditandatangani wallet untuk setiap request bertanda tangan.
// Header: Authorization: AntiCalo <address>:<timestamp>:<signature>
//         x-content-sha256: sha256 hex dari body JSON / file (wajib untuk POST/PUT).
export function authMessage({ method, path, timestamp, contentSha256 }) {
  return `anti-calo-auth\nmethod:${method.toUpperCase()}\npath:${path}\ntimestamp:${timestamp}\ncontent-sha256:${contentSha256 || '-'}`;
}

export function createAuth(config) {
  const seen = new Map(); // signature -> kedaluwarsa (anti replay dalam jendela TTL; per proses)

  function sweep(now) {
    for (const [k, exp] of seen) if (exp <= now) seen.delete(k);
  }

  return function authenticate(req, _res, next) {
    req.wallet = null;
    try {
      if (config.authMode === 'dev') {
        const w = req.get('x-wallet-address');
        if (w) {
          if (!isAddress(w)) throw bad('x-wallet-address bukan alamat yang valid.');
          req.wallet = w.toLowerCase();
        }
        return next();
      }
      const header = req.get('authorization');
      if (!header) return next();
      const m = /^AntiCalo (0x[0-9a-fA-F]{40}):(\d{1,12}):(0x[0-9a-fA-F]+)$/.exec(header);
      if (!m) throw unauthorized('Format Authorization tidak valid.');
      const [, address, ts, signature] = m;
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - Number(ts)) > config.authTtlSeconds) throw unauthorized('Tanda tangan kedaluwarsa. Buat yang baru.');

      const contentSha256 = clean(req.get('x-content-sha256'));
      const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
      if (hasBody && !contentSha256) throw unauthorized('Header x-content-sha256 wajib untuk request yang mengirim data.');
      if (req.rawBody?.length && sha256Hex(req.rawBody) !== contentSha256) {
        throw unauthorized('x-content-sha256 tidak cocok dengan isi request.');
      }
      const path = req.originalUrl.split('?')[0];
      let recovered;
      try {
        recovered = verifyMessage(authMessage({ method: req.method, path, timestamp: ts, contentSha256 }), signature);
      } catch {
        throw unauthorized('Tanda tangan tidak valid.');
      }
      if (recovered.toLowerCase() !== address.toLowerCase()) throw unauthorized('Tanda tangan tidak cocok dengan alamat.');
      sweep(now);
      if (seen.has(signature)) throw unauthorized('Tanda tangan sudah pernah dipakai.');
      seen.set(signature, now + config.authTtlSeconds * 2);
      req.wallet = address.toLowerCase();
      req.contentSha256 = contentSha256;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireWallet(req) {
  if (!req.wallet) throw unauthorized('Login dengan wallet diperlukan.');
  return req.wallet;
}

const hasRole = (db, role, account) =>
  !!db.prepare('SELECT 1 FROM roles WHERE role = ? AND account = ? AND active = 1').get(role, account);
export const isAdmin = (db, account) => hasRole(db, ADMIN_ROLE, account);
export const isOrganizerRole = (db, account) => hasRole(db, ORGANIZER_ROLE, account);

// Pemilik event = organizer yang tercatat on-chain DAN masih memegang ORGANIZER_ROLE
// (sama dengan aturan TicketNFT._requireEventOrganizer).
export function assertEventOrganizer(db, event, account) {
  if (event.organizer !== account || !isOrganizerRole(db, account)) {
    throw forbidden('Hanya organizer pemilik event ini yang dapat melakukan tindakan tersebut.');
  }
}
