import { el, badge, button, field, money } from './ui.js';
import { toUnix } from './onchain.js';
import { weiToEth } from './api.js';

// Kontrol transaksi on-chain untuk halaman Lab Backend. Semua kontrol memanggil ctx.run(label, (chain) => ...),
// yang menangani status transaksi, galat, dan menunggu indexer. Kontrak tetap menjadi penentu akhir izin;
// pengecekan di sini hanya menyembunyikan tombol yang pasti ditolak agar tampilan tidak menyesatkan.
const row = (...children) => el('div', { class: 'backend-actions' }, ...children);

export function localInput(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function eventActions(ev, ctx) {
  if (!ctx.wallet || !ctx.chainOk) return null;
  const t = ctx.now(), items = [];
  const saleOpen = ev.status === 'live' && t >= ev.saleStart && t <= ev.saleEnd && ev.sold < ev.capacity;
  if (saleOpen) {
    const qty = el('select', { 'aria-label': 'Jumlah tiket', 'data-testid': `backend-qty-${ev.id}` },
      ...Array.from({ length: Math.min(ev.maxPerWallet, 10) }, (_, i) => el('option', { value: i + 1 }, `${i + 1} tiket`)));
    items.push(row(qty, button('Beli tiket', () => ctx.run('Pembelian tiket', (c) => c.buyTicket(ev.id, qty.value)), { kind: 'primary', 'data-testid': `backend-buy-${ev.id}` })));
  } else if (ev.status === 'live' && ev.sold >= ev.capacity) items.push(badge('Habis', 'amber'));
  const owner = ctx.roles?.organizer && ctx.sameAddress(ev.organizer, ctx.wallet.address);
  const live = ev.status === 'live' && t < ev.eventTime;
  if ((owner || ctx.roles?.admin) && live) items.push(button('Batalkan event', () => ctx.run('Pembatalan event', (c) => c.cancelEvent(ev.id)), { kind: 'outline', 'data-testid': `backend-cancel-${ev.id}` }));
  if (owner) {
    items.push(button('Tarik dana', () => ctx.run('Penarikan dana event', (c) => c.withdraw(ev.id)), { kind: 'outline', 'data-testid': `backend-withdraw-${ev.id}` }));
    if (ev.computedHash && ev.hashStatus !== 'match' && ev.status === 'live') {
      items.push(button('Kunci hash on-chain', () => ctx.run('Pembaruan hash detail', (c) => c.updateEventHash(ev.id, ev.computedHash)), { kind: 'outline', 'data-testid': `backend-lockhash-${ev.id}` }));
    }
  }
  if (owner || ctx.roles?.admin) {
    const who = el('input', { placeholder: 'Alamat Gate Checker 0x…', 'aria-label': `Alamat Gate Checker event ${ev.id}`, 'data-testid': `backend-checker-${ev.id}` });
    items.push(row(who, button('Tugaskan', () => ctx.run('Penugasan Gate Checker', (c) => c.assignGateChecker(ev.id, who.value)), { kind: 'outline', 'data-testid': `backend-assign-${ev.id}` }),
      button('Cabut', () => ctx.run('Pencabutan Gate Checker', (c) => c.removeGateChecker(ev.id, who.value)), { kind: 'text', 'data-testid': `backend-unassign-${ev.id}` })));
  }
  return items.length ? el('div', { class: 'backend-action-group' }, ...items) : null;
}

export function ticketActions(ticket, ev, listing, ctx) {
  if (!ctx.wallet || !ctx.chainOk) return null;
  const items = [];
  if (listing) items.push(button('Batalkan listing', () => ctx.run('Pembatalan listing', (c) => c.cancelListing(ticket.id)), { kind: 'outline', 'data-testid': `backend-unlist-${ticket.id}` }));
  else if (ticket.status === 'active' && ev?.status === 'live') {
    const cap = ev ? (BigInt(ev.ticketPriceWei) * BigInt(ev.resaleCapBps)) / 10000n : 0n;
    const price = el('input', { value: weiToEth(cap || '0'), inputmode: 'decimal', 'aria-label': `Harga resale tiket ${ticket.id}`, 'data-testid': `backend-price-${ticket.id}`, size: 8 });
    items.push(row(price, button('Jual kembali', () => ctx.run('Listing resale', (c) => c.listTicket(ticket.id, price.value)), { kind: 'outline', 'data-testid': `backend-list-${ticket.id}` }),
      el('span', { class: 'field-hint' }, `Batas ${money(weiToEth(cap))}`)));
  }
  if (ticket.status === 'revoked' || (ticket.status === 'active' && ev?.status === 'cancelled')) {
    items.push(button('Klaim refund', () => ctx.run('Klaim refund', (c) => c.claimRefund(ticket.id)), { kind: 'primary', 'data-testid': `backend-refund-${ticket.id}` }));
  }
  return items.length ? el('div', { class: 'backend-action-group' }, ...items) : null;
}

export function listingActions(listing, ctx) {
  if (!ctx.wallet || !ctx.chainOk || ctx.sameAddress(listing.seller, ctx.wallet.address)) return null;
  return button('Beli', () => ctx.run('Pembelian resale', (c) => c.buyListing(listing.tokenId)), { kind: 'primary', 'data-testid': `backend-buylisting-${listing.tokenId}` });
}

export function createEventPanel(ctx) {
  if (!ctx.wallet || !ctx.chainOk || !ctx.roles?.organizer) return null;
  const d = (days) => localInput(new Date(Date.now() + days * 86_400_000));
  const f = {
    priceEth: el('input', { value: '0.01', inputmode: 'decimal', 'data-testid': 'backend-new-price' }),
    maxSupply: el('input', { type: 'number', min: 1, value: 100, 'data-testid': 'backend-new-supply' }),
    maxPerWallet: el('input', { type: 'number', min: 1, max: 10, value: 4, 'data-testid': 'backend-new-perwallet' }),
    saleStart: el('input', { type: 'datetime-local', value: d(0), 'data-testid': 'backend-new-salestart' }),
    saleEnd: el('input', { type: 'datetime-local', value: d(14), 'data-testid': 'backend-new-saleend' }),
    eventTime: el('input', { type: 'datetime-local', value: d(15), 'data-testid': 'backend-new-eventtime' }),
    resalePercent: el('input', { type: 'number', min: 100, max: 150, value: 110, 'data-testid': 'backend-new-cap' }),
  };
  return el('section', { class: 'panel', 'data-testid': 'backend-create-panel' },
    el('div', { class: 'panel-heading' }, el('h2', {}, 'Buat event baru (on-chain)')),
    el('div', { class: 'form-grid' }, field('Harga tiket (ETH)', f.priceEth), field('Kapasitas', f.maxSupply), field('Maks. per wallet (1–10)', f.maxPerWallet),
      field('Batas harga resale (%)', f.resalePercent, '100–150% dari harga awal.'), field('Penjualan mulai', f.saleStart), field('Penjualan selesai', f.saleEnd), field('Waktu event', f.eventTime)),
    el('p', { class: 'field-hint' }, 'Setelah terkonfirmasi, isi detail event (judul, poster) lalu kunci hash-nya on-chain.'),
    button('Buat event', () => ctx.run('Pembuatan event', async (c) => {
      const r = await c.createEvent({ priceEth: f.priceEth.value, maxSupply: f.maxSupply.value, maxPerWallet: f.maxPerWallet.value, saleStart: toUnix(f.saleStart.value),
        saleEnd: toUnix(f.saleEnd.value), eventTime: toUnix(f.eventTime.value), resaleCapBps: Math.round(Number(f.resalePercent.value) * 100) });
      ctx.created(r.eventId);
      return r;
    }), { kind: 'primary', iconName: 'plus', 'data-testid': 'backend-create-submit' }));
}

export function gatePanel(ctx, events) {
  const mine = new Set(ctx.roles?.gateCheckerEventIds ?? []);
  if (!ctx.wallet || !ctx.chainOk || !mine.size) return null;
  const pick = el('select', { 'aria-label': 'Event', 'data-testid': 'backend-gate-event' }, ...events.filter((e) => mine.has(e.id)).map((e) => el('option', { value: e.id }, `#${e.id} · ${e.title}`)));
  const token = el('input', { inputmode: 'numeric', placeholder: 'ID tiket', 'data-testid': 'backend-gate-token' });
  return el('section', { class: 'panel', 'data-testid': 'backend-gate-panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Check-in (Gate Checker)')),
    el('div', { class: 'form-grid' }, field('Event', pick), field('ID tiket', token, 'Sementara dimasukkan manual. Verifikasi QR ada di Lab Integrasi.')),
    button('Check-in tiket', () => ctx.run('Check-in', (c) => c.checkIn(pick.value, token.value)), { kind: 'primary', iconName: 'check', 'data-testid': 'backend-gate-submit' }));
}

export function adminPanel(ctx) {
  if (!ctx.wallet || !ctx.chainOk || !ctx.roles?.admin) return null;
  const who = el('input', { placeholder: '0x…', 'data-testid': 'backend-role-address' });
  const token = el('input', { inputmode: 'numeric', placeholder: 'ID tiket', 'data-testid': 'backend-revoke-token' });
  return el('section', { class: 'panel', 'data-testid': 'backend-admin-panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Admin')),
    el('div', { class: 'form-grid' }, field('Alamat wallet', who)),
    row(button('Beri role Organizer', () => ctx.run('Pemberian role', (c) => c.grantOrganizer(who.value)), { kind: 'primary', 'data-testid': 'backend-grant' }),
      button('Cabut role Organizer', () => ctx.run('Pencabutan role', (c) => c.revokeOrganizer(who.value)), { kind: 'outline', 'data-testid': 'backend-revoke' })),
    el('div', { class: 'form-grid' }, field('Cabut tiket (ID tiket)', token, 'Pemilik tiket lalu dapat mengklaim refund.')),
    button('Cabut tiket', () => ctx.run('Pencabutan tiket', (c) => c.revokeTicket(token.value)), { kind: 'outline', 'data-testid': 'backend-revoketicket' }));
}

export function proceedsPanel(ctx) {
  if (!ctx.wallet || !ctx.chainOk) return null;
  return el('section', { class: 'panel', 'data-testid': 'backend-proceeds-panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Hasil penjualan resale')),
    el('p', { class: 'field-hint' }, 'Hasil resale tiketmu dapat ditarik setelah pembeli membayar. Biaya organizer dipotong otomatis oleh kontrak.'),
    button('Tarik hasil resale', () => ctx.run('Penarikan hasil resale', (c) => c.withdrawProceeds()), { kind: 'outline', 'data-testid': 'backend-withdraw-proceeds' }));
}

