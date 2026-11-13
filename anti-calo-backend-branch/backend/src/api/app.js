import path from 'node:path';
import express from 'express';
import { isAddress } from 'ethers';
import { HttpError, bad, conflict, notFound } from './errors.js';
import { createAuth, requireWallet, isAdmin, isOrganizerRole, assertEventOrganizer, sha256Hex } from './auth.js';
import { parseDetails, parseId, computeDetailsHash, hashStatus, CATEGORIES } from './validate.js';
import { createPosterUpload, sniffImage, savePoster, removePoster } from './upload.js';
import { getState } from '../db.js';

const lowAddr = (v, label = 'Alamat') => {
  if (!isAddress(String(v))) throw bad(`${label} bukan alamat yang valid.`);
  return String(v).toLowerCase();
};
const paging = (q) => {
  const limit = Math.min(Math.max(Number.parseInt(q.limit ?? '20', 10) || 20, 1), 100);
  const page = Math.max(Number.parseInt(q.page ?? '1', 10) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
};

export function createApp({ db, config, now = () => Math.floor(Date.now() / 1000) }) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    const origin = req.get('origin');
    if (origin && config.corsOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-content-sha256, x-wallet-address');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.use('/uploads', (_req, res, next) => { res.set('Cross-Origin-Resource-Policy', 'cross-origin'); next(); },
    express.static(path.resolve(config.uploadDir), { index: false, dotfiles: 'deny', fallthrough: false, maxAge: '1h' }));

  app.use(express.json({ limit: '64kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(createAuth(config));

  // ---------- helpers data ----------
  const eventRow = (id) => db.prepare('SELECT * FROM events WHERE event_id = ?').get(id);
  const needEvent = (id) => { const e = eventRow(id); if (!e) throw notFound('Event tidak ditemukan atau belum terindeks.'); return e; };
  const detailsRow = (id) => db.prepare('SELECT * FROM event_details WHERE event_id = ?').get(id);

  const serializeDetails = (ev, d) => {
    if (!d || d.deleted_at) return null;
    const computed = computeDetailsHash(d, d.poster_sha256 ?? '');
    return {
      title: d.title, description: d.description, category: d.category, location: d.location,
      posterUrl: d.poster_file ? `/uploads/${d.poster_file}` : null,
      updatedAt: d.updated_at, computedHash: computed, hashStatus: hashStatus(ev.details_hash, computed),
    };
  };
  const serializeEvent = (ev, d) => ({
    id: ev.event_id, organizer: ev.organizer, status: ev.status, ticketPrice: ev.ticket_price,
    maxSupply: ev.max_supply, maxPerWallet: ev.max_per_wallet, sold: ev.sold, checkedIn: ev.checked_in,
    saleStart: ev.sale_start, saleEnd: ev.sale_end, eventTime: ev.event_time, resaleCapBps: ev.resale_cap_bps,
    detailsHash: ev.details_hash, details: serializeDetails(ev, d),
  });

  // ---------- umum ----------
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/status', (_req, res) => {
    const last = getState(db, 'last_block');
    const head = getState(db, 'head_block');
    res.json({ lastBlock: last === null ? null : Number(last), headBlock: head === null ? null : Number(head),
      updatedAt: getState(db, 'updated_at'), authMode: config.authMode });
  });

  app.get('/api/categories', (_req, res) => res.json({ categories: CATEGORIES }));

  app.get('/api/roles/:address', (req, res) => {
    const a = lowAddr(req.params.address);
    res.json({
      address: a, admin: isAdmin(db, a), organizer: isOrganizerRole(db, a),
      organizerEventIds: db.prepare('SELECT event_id FROM events WHERE organizer = ? ORDER BY CAST(event_id AS INTEGER)').all(a).map((r) => r.event_id),
      gateCheckerEventIds: db.prepare('SELECT event_id FROM gate_checkers WHERE checker = ? AND active = 1 ORDER BY CAST(event_id AS INTEGER)').all(a).map((r) => r.event_id),
    });
  });

  // Hitung detailsHash sebelum createEvent on-chain (tanpa login; fungsi murni).
  app.post('/api/details/hash', (req, res) => {
    const d = parseDetails(req.body);
    res.json({ detailsHash: computeDetailsHash(d, ''), note: 'Hash tanpa poster. Setelah upload poster, hash berubah; panggil updateEvent dengan computedHash terbaru.' });
  });

  // ---------- event (data on-chain terindeks + detail off-chain) ----------
  app.get('/api/events', (req, res) => {
    const { limit, offset, page } = paging(req.query);
    const where = []; const args = [];
    if (req.query.category) { where.push('d.category = ?'); args.push(String(req.query.category)); }
    if (req.query.status) { where.push('e.status = ?'); args.push(String(req.query.status)); }
    if (req.query.organizer) { where.push('e.organizer = ?'); args.push(lowAddr(req.query.organizer, 'organizer')); }
    if (req.query.q) {
      const like = `%${String(req.query.q).replace(/[\\%_]/g, '\\$&')}%`;
      where.push("(d.title LIKE ? ESCAPE '\\' OR d.location LIKE ? ESCAPE '\\')"); args.push(like, like);
    }
    const from = `FROM events e LEFT JOIN event_details d ON d.event_id = e.event_id AND d.deleted_at IS NULL
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...args).n;
    const rows = db.prepare(`SELECT e.*, d.title, d.description, d.category, d.location, d.poster_file, d.poster_sha256,
      d.updated_at, d.deleted_at, d.event_id AS d_id ${from} ORDER BY e.event_time ASC, CAST(e.event_id AS INTEGER) ASC LIMIT ? OFFSET ?`)
      .all(...args, limit, offset);
    res.json({ page, limit, total, items: rows.map((r) => serializeEvent(r, r.d_id ? r : null)) });
  });

  app.get('/api/events/:id', (req, res) => {
    const id = parseId(req.params.id, 'ID event');
    const ev = needEvent(id);
    const checkers = db.prepare('SELECT checker FROM gate_checkers WHERE event_id = ? AND active = 1 ORDER BY checker').all(id).map((r) => r.checker);
    res.json({ ...serializeEvent(ev, detailsRow(id)), gateCheckers: checkers });
  });

  // ---------- CRUD detail event (off-chain) ----------
  app.get('/api/events/:id/details', (req, res) => {
    const id = parseId(req.params.id, 'ID event');
    const ev = needEvent(id);
    const d = serializeDetails(ev, detailsRow(id));
    if (!d) throw notFound('Detail event belum dibuat atau sudah dihapus.');
    res.json(d);
  });

  app.post('/api/events/:id/details', (req, res) => {
    const wallet = requireWallet(req);
    const id = parseId(req.params.id, 'ID event');
    const ev = needEvent(id);
    assertEventOrganizer(db, ev, wallet);
    const existing = detailsRow(id);
    if (existing && !existing.deleted_at) throw conflict('Detail event sudah ada. Gunakan PUT untuk mengubahnya.');
    const d = parseDetails(req.body);
    removePoster(config, existing?.poster_file);
    const ts = new Date().toISOString();
    db.prepare(`INSERT INTO event_details (event_id, title, description, category, location, poster_file, poster_sha256, created_by, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL)
      ON CONFLICT(event_id) DO UPDATE SET title=excluded.title, description=excluded.description, category=excluded.category,
      location=excluded.location, poster_file=NULL, poster_sha256=NULL, created_by=excluded.created_by, created_at=excluded.created_at,
      updated_at=excluded.updated_at, deleted_at=NULL`).run(id, d.title, d.description, d.category, d.location, wallet, ts, ts);
    res.status(201).json(serializeDetails(ev, detailsRow(id)));
  });

  app.put('/api/events/:id/details', (req, res) => {
    const wallet = requireWallet(req);
    const id = parseId(req.params.id, 'ID event');
    const ev = needEvent(id);
    assertEventOrganizer(db, ev, wallet);
    const existing = detailsRow(id);
    if (!existing || existing.deleted_at) throw notFound('Detail event belum dibuat. Gunakan POST.');
    const d = parseDetails(req.body);
    db.prepare('UPDATE event_details SET title=?, description=?, category=?, location=?, updated_at=? WHERE event_id=?')
      .run(d.title, d.description, d.category, d.location, new Date().toISOString(), id);
    res.json(serializeDetails(ev, detailsRow(id)));
  });

  // Soft delete. Organizer pemilik event atau Admin (moderasi). Riwayat blockchain tidak terpengaruh.
  app.delete('/api/events/:id/details', (req, res) => {
    const wallet = requireWallet(req);
    const id = parseId(req.params.id, 'ID event');
    const ev = needEvent(id);
    if (!isAdmin(db, wallet)) assertEventOrganizer(db, ev, wallet);
    const existing = detailsRow(id);
    if (!existing || existing.deleted_at) throw notFound('Detail event tidak ditemukan.');
    db.prepare('UPDATE event_details SET deleted_at = ? WHERE event_id = ?').run(new Date().toISOString(), id);
    res.status(204).end();
  });

  const posterUpload = createPosterUpload(config);
  app.post('/api/events/:id/poster',
    (req, _res, next) => {
      try {
        const wallet = requireWallet(req);
        const ev = needEvent(parseId(req.params.id, 'ID event'));
        assertEventOrganizer(db, ev, wallet);
        const d = detailsRow(ev.event_id);
        if (!d || d.deleted_at) throw notFound('Buat detail event terlebih dahulu sebelum mengunggah poster.');
        next();
      } catch (err) { next(err); }
    },
    posterUpload,
    (req, res) => {
      const id = parseId(req.params.id, 'ID event');
      const ev = needEvent(id);
      if (!req.file) throw bad('File poster wajib dikirim pada field "poster".');
      const kind = sniffImage(req.file.buffer);
      if (!kind) throw bad('Poster harus berupa gambar PNG, JPEG, atau WebP.', 'unsupported_type');
      const sha = sha256Hex(req.file.buffer);
      if (config.authMode === 'signature' && req.contentSha256 !== sha) throw bad('x-content-sha256 tidak cocok dengan file poster.');
      const old = detailsRow(id).poster_file;
      const file = savePoster(config, id, req.file.buffer, sha, kind.ext);
      db.prepare('UPDATE event_details SET poster_file = ?, poster_sha256 = ?, updated_at = ? WHERE event_id = ?')
        .run(file, sha, new Date().toISOString(), id);
      if (old && old !== file) removePoster(config, old);
      res.status(201).json(serializeDetails(ev, detailsRow(id)));
    });

  // ---------- tiket, listing, laporan (proyeksi on-chain, baca-saja) ----------
  const serializeTicket = (t) => ({ tokenId: t.token_id, eventId: t.event_id, owner: t.owner, status: t.status,
    originalPrice: t.original_price, checkedInBy: t.checked_in_by, checkedInBlock: t.checked_in_block });

  app.get('/api/tickets', (req, res) => {
    const { limit, offset, page } = paging(req.query);
    const where = []; const args = [];
    if (req.query.owner) { where.push('owner = ?'); args.push(lowAddr(req.query.owner, 'owner')); }
    if (req.query.eventId) { where.push('event_id = ?'); args.push(parseId(req.query.eventId, 'eventId')); }
    if (req.query.status) { where.push('status = ?'); args.push(String(req.query.status)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS n FROM tickets ${w}`).get(...args).n;
    const rows = db.prepare(`SELECT * FROM tickets ${w} ORDER BY CAST(token_id AS INTEGER) LIMIT ? OFFSET ?`).all(...args, limit, offset);
    res.json({ page, limit, total, items: rows.map(serializeTicket) });
  });

  app.get('/api/tickets/:tokenId', (req, res) => {
    const id = parseId(req.params.tokenId, 'Token ID');
    const t = db.prepare('SELECT * FROM tickets WHERE token_id = ?').get(id);
    if (!t) throw notFound('Tiket tidak ditemukan.');
    const l = db.prepare('SELECT * FROM listings WHERE token_id = ? AND active = 1').get(id);
    res.json({ ...serializeTicket(t), listing: l ? { seller: l.seller, price: l.price } : null });
  });

  app.get('/api/listings', (req, res) => {
    const { limit, offset, page } = paging(req.query);
    const where = ['l.active = 1']; const args = [];
    if (req.query.eventId) { where.push('l.event_id = ?'); args.push(parseId(req.query.eventId, 'eventId')); }
    if (req.query.seller) { where.push('l.seller = ?'); args.push(lowAddr(req.query.seller, 'seller')); }
    // buyable=1 menyaring listing basi: tiket tidak valid, event batal/mulai, atau pemilik berubah.
    if (req.query.buyable === '1') {
      where.push("t.status = 'valid' AND e.status = 'active' AND e.event_time > ? AND t.owner = l.seller");
      args.push(now());
    }
    const from = `FROM listings l JOIN tickets t ON t.token_id = l.token_id JOIN events e ON e.event_id = l.event_id WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...args).n;
    const rows = db.prepare(`SELECT l.*, t.status AS t_status, t.owner AS t_owner, t.original_price, e.status AS e_status, e.event_time, e.resale_cap_bps
      ${from} ORDER BY CAST(l.token_id AS INTEGER) LIMIT ? OFFSET ?`).all(...args, limit, offset);
    res.json({ page, limit, total, items: rows.map((r) => ({
      tokenId: r.token_id, eventId: r.event_id, seller: r.seller, price: r.price, originalPrice: r.original_price,
      stale: r.t_status !== 'valid' || r.e_status !== 'active' || r.event_time <= now() || r.t_owner !== r.seller,
    })) });
  });

  app.get('/api/events/:id/report', (req, res) => {
    const wallet = requireWallet(req);
    const id = parseId(req.params.id, 'ID event');
    const ev = needEvent(id);
    if (!isAdmin(db, wallet)) assertEventOrganizer(db, ev, wallet);
    const sum = (rows, key) => rows.reduce((acc, r) => acc + BigInt(r[key]), 0n).toString();
    const purchases = db.prepare('SELECT total_paid FROM purchases WHERE event_id = ?').all(id);
    const sales = db.prepare('SELECT price, fee FROM sales WHERE event_id = ?').all(id);
    const byStatus = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM tickets WHERE event_id = ? GROUP BY status').all(id).map((r) => [r.status, r.n]));
    res.json({
      eventId: id, status: ev.status, sold: ev.sold, maxSupply: ev.max_supply, checkedIn: ev.checked_in,
      ticketsByStatus: byStatus, primaryRevenueWei: sum(purchases, 'total_paid'),
      resale: { count: sales.length, volumeWei: sum(sales, 'price'), organizerFeesWei: sum(sales, 'fee') },
      activeListings: db.prepare('SELECT COUNT(*) AS n FROM listings WHERE event_id = ? AND active = 1').get(id).n,
    });
  });

  // ---------- error handling ----------
  app.use('/api', (_req, _res, next) => next(notFound('Endpoint tidak ditemukan.')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_request', message: 'JSON tidak valid.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'Body terlalu besar.' });
    if (err?.status === 404 && err?.code === 'ENOENT') return res.status(404).json({ error: 'not_found', message: 'File tidak ditemukan.' });
    console.error(err);
    res.status(500).json({ error: 'internal', message: 'Terjadi kesalahan pada server.' });
  });

  return app;
}
