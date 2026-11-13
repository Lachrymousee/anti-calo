import { sameAddress } from './model.js';
import { connectInjectedWallet } from './chain.js';
import { API_URL, CATEGORIES, createApiClient, browserWallet, joinLocation, mapTicket } from './api.js';
import { el, icon, badge, button, link, field, shortAddress, toast, dateText, timeText, money, statusBadge } from './ui.js';

const HASH_BADGE = {
  match: ['Cocok dengan komitmen on-chain', 'green'],
  mismatch: ['Tidak cocok dengan hash on-chain', 'red'],
  unset: ['Hash on-chain kosong', 'amber'],
  missing: ['Detail belum diisi', 'neutral'],
};

// Halaman "Lab Backend": membaca event, tiket, dan listing dari backend (indexer) serta memungkinkan
// Organizer menyimpan detail off-chain. Pembelian dan check-in marketplace tetap mode demo.
export function createBackendPage({ initialWallet = null, onWalletConnected = () => {}, injected = globalThis.window?.ethereum,
  baseUrl = API_URL, createClient, chain = {} } = {}) {
  const connect = chain.connectInjectedWallet ?? connectInjectedWallet;
  const makeClient = createClient ?? ((wallet) => createApiClient({ baseUrl, wallet: wallet ? browserWallet(injected, wallet.address) : null }));
  let wallet = initialWallet, client = null, roles = null, events = [], tickets = [], listings = [], editing = null, disposed = false, epoch = 0;
  let statusInfo = null, loadError = '', lastHash = null;

  const status = el('div', { class: 'backend-status', 'data-testid': 'backend-status', role: 'status', 'aria-live': 'polite' });
  const walletBox = el('div', { class: 'backend-wallet', 'data-testid': 'backend-wallet' });
  const error = el('p', { class: 'form-error', role: 'alert', 'data-testid': 'backend-error' });
  const eventsBox = el('div', { class: 'backend-events', 'data-testid': 'backend-events' });
  const editorBox = el('div', { 'data-testid': 'backend-editor' });
  const ticketsBox = el('div', { 'data-testid': 'backend-tickets' });
  const listingsBox = el('div', { 'data-testid': 'backend-listings' });

  const fail = (e) => { error.textContent = e?.message ?? 'Tindakan belum berhasil.'; };
  const canEdit = (ev) => Boolean(wallet && roles?.organizer && sameAddress(ev.organizer, wallet.address));

  async function refresh() {
    const mine = ++epoch;
    error.textContent = ''; loadError = '';
    try {
      client = makeClient(wallet);
      const [s, evs, ls, r, ts] = await Promise.all([
        client.status(), client.events(), client.listings(),
        wallet ? client.roles(wallet.address) : null, wallet ? client.tickets(wallet.address) : [],
      ]);
      if (disposed || mine !== epoch) return;
      statusInfo = s; events = evs; listings = ls; roles = r; tickets = ts;
    } catch (e) { if (disposed || mine !== epoch) return; statusInfo = null; loadError = e.message; }
    draw();
  }

  function drawStatus() {
    if (loadError) { status.replaceChildren(badge('Backend belum terhubung', 'red'), el('span', {}, loadError)); return; }
    if (!statusInfo) { status.replaceChildren(el('span', { class: 'muted' }, 'Menghubungi backend…')); return; }
    const lag = statusInfo.lastBlock === null ? 'indexer belum membaca blok' : `blok terindeks ${statusInfo.lastBlock}${statusInfo.headBlock !== null ? ` dari ${statusInfo.headBlock}` : ''}`;
    status.replaceChildren(badge('Backend terhubung', 'green'), el('span', {}, `${lag} · autentikasi: ${statusInfo.authMode}`));
  }

  function drawWallet() {
    if (!wallet) { walletBox.replaceChildren(el('p', { class: 'muted' }, 'Hubungkan wallet untuk melihat tiket dan mengelola detail event.')); return; }
    walletBox.replaceChildren(el('code', {}, wallet.address),
      roles?.admin ? badge('Admin', 'purple') : null, roles?.organizer ? badge('Organizer', 'green') : null,
      roles?.gateCheckerEventIds?.length ? badge('Gate Checker', 'amber') : null,
      roles && !roles.admin && !roles.organizer && !roles.gateCheckerEventIds.length ? badge('Pembeli', 'neutral') : null);
  }

  function drawEvents() {
    if (!statusInfo) { eventsBox.replaceChildren(); return; }
    if (!events.length) { eventsBox.replaceChildren(el('p', { class: 'muted', 'data-testid': 'backend-no-events' }, 'Belum ada event terindeks. Pastikan indexer berjalan dan START_BLOCK benar.')); return; }
    eventsBox.replaceChildren(...events.map((ev) => {
      const [hashText, hashKind] = HASH_BADGE[ev.hashStatus] ?? HASH_BADGE.missing;
      return el('article', { class: 'backend-event', 'data-testid': `backend-event-${ev.id}` },
        ev.posterUrl ? el('img', { src: ev.posterUrl, alt: `Poster ${ev.title}`, width: 120, height: 80, loading: 'lazy' }) : el('div', { class: 'backend-poster-empty' }, icon('ticket', 26)),
        el('div', {}, el('div', { class: 'backend-event-head' }, el('h3', {}, ev.title), statusBadge(ev.status), ev.category ? badge(ev.category) : null),
          el('p', { class: 'muted' }, `${dateText(ev.date, true)} · ${timeText(ev.date)} · ${[ev.venue, ev.city].filter(Boolean).join(', ') || 'Lokasi belum diisi'}`),
          el('p', {}, `${money(ev.price)} · terjual ${ev.sold}/${ev.capacity} · check-in ${ev.checkedIn}`),
          el('p', { class: 'field-hint' }, `Organizer ${shortAddress(ev.organizer)} · Event #${ev.id}`),
          badge(hashText, hashKind)),
        el('div', { class: 'backend-event-actions' },
          canEdit(ev) ? button(ev.detailsComplete ? 'Edit detail' : 'Isi detail', () => { editing = ev.id; lastHash = null; error.textContent = ''; draw(); }, { kind: 'outline', iconName: 'book', 'data-testid': `backend-edit-${ev.id}` }) : null));
    }));
  }

  function drawEditor() {
    const ev = events.find((e) => e.id === editing);
    if (!ev) { editorBox.replaceChildren(); return; }
    const inputs = {
      title: el('input', { value: ev.title.startsWith('Event #') ? '' : ev.title, maxlength: 120, 'data-testid': 'backend-title' }),
      category: el('select', { 'data-testid': 'backend-category' }, ...CATEGORIES.map((c) => el('option', { value: c, selected: c === ev.category }, c))),
      venue: el('input', { value: ev.venue, maxlength: 150, 'data-testid': 'backend-venue' }),
      city: el('input', { value: ev.city, maxlength: 50, 'data-testid': 'backend-city' }),
      description: el('textarea', { rows: 5, maxlength: 5000, 'data-testid': 'backend-description' }, ev.description),
      poster: el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'data-testid': 'backend-poster' }),
    };
    inputs.category.value = CATEGORIES.includes(ev.category) ? ev.category : CATEGORIES[0];
    const hashBox = el('div', { class: 'backend-hash', 'data-testid': 'backend-hash' });
    const showHash = (d) => {
      hashBox.replaceChildren();
      if (!d?.computedHash) return;
      const [text, kind] = HASH_BADGE[d.hashStatus] ?? HASH_BADGE.missing;
      hashBox.append(badge(text, kind), el('p', { class: 'field-hint' }, d.hashStatus === 'match' ? 'Detail sudah sesuai komitmen on-chain.'
        : 'Kunci detail ini dengan memanggil updateEvent di kontrak memakai detailsHash berikut:'), d.hashStatus === 'match' ? null : el('code', {}, d.computedHash));
    };
    showHash(lastHash ?? { computedHash: ev.computedHash, hashStatus: ev.hashStatus });
    const run = (fn) => async () => { error.textContent = ''; try { await fn(); } catch (e) { fail(e); } };
    editorBox.replaceChildren(el('section', { class: 'panel backend-editor' },
      el('div', { class: 'panel-heading' }, el('h2', {}, `Detail off-chain · Event #${ev.id}`), button('Tutup', () => { editing = null; lastHash = null; draw(); }, { kind: 'text' })),
      el('div', { class: 'form-grid' }, field('Judul', inputs.title), field('Kategori', inputs.category), field('Venue', inputs.venue), field('Kota', inputs.city)),
      field('Deskripsi', inputs.description, 'Minimal 10 karakter. Ikut dalam hash yang dikomitmenkan on-chain.'),
      el('div', { class: 'integration-actions' },
        button('Simpan detail', run(async () => {
          const saved = await client.saveDetails(ev.id, { title: inputs.title.value, description: inputs.description.value, category: inputs.category.value,
            location: joinLocation({ venue: inputs.venue.value, city: inputs.city.value }) }, ev.detailsComplete);
          toast('Detail event disimpan.'); lastHash = saved; await refresh();
        }), { kind: 'primary', iconName: 'check', 'data-testid': 'backend-save' }),
        ev.detailsComplete ? button('Hapus detail', run(async () => { await client.deleteDetails(ev.id); toast('Detail event dihapus.'); editing = null; lastHash = null; await refresh(); }),
          { kind: 'outline', 'data-testid': 'backend-delete' }) : null),
      ev.detailsComplete ? el('div', { class: 'backend-poster-form' }, field('Poster (PNG, JPEG, atau WebP, maks 2 MB)', inputs.poster),
        button('Unggah poster', run(async () => {
          const file = inputs.poster.files?.[0];
          if (!file) throw Error('Pilih file poster terlebih dahulu.');
          const saved = await client.uploadPoster(ev.id, file);
          toast('Poster diunggah.'); lastHash = saved; await refresh();
        }), { kind: 'outline', iconName: 'plus', 'data-testid': 'backend-upload' })) : el('p', { class: 'field-hint' }, 'Simpan detail terlebih dahulu sebelum mengunggah poster.'),
      hashBox));
  }

  function drawTickets() {
    if (!wallet) { ticketsBox.replaceChildren(el('p', { class: 'muted' }, 'Hubungkan wallet untuk melihat tiket on-chain milikmu.')); return; }
    if (!tickets.length) { ticketsBox.replaceChildren(el('p', { class: 'muted', 'data-testid': 'backend-no-tickets' }, 'Wallet ini belum memiliki tiket on-chain.')); return; }
    const listed = new Map(listings.map((l) => [l.tokenId, l]));
    ticketsBox.replaceChildren(...tickets.filter((t) => ['valid', 'used'].includes(t.status)).map((t) => {
      const m = mapTicket(t, listed.get(t.tokenId)), ev = events.find((e) => e.id === m.eventId);
      return el('div', { class: 'backend-row', 'data-testid': `backend-ticket-${m.id}` },
        el('strong', {}, `Tiket #${m.id}`), el('span', {}, ev?.title ?? `Event #${m.eventId}`), statusBadge(m.status),
        m.resalePrice ? el('span', {}, `Resale ${money(m.resalePrice)}`) : null);
    }));
  }

  function drawListings() {
    if (!listings.length) { listingsBox.replaceChildren(el('p', { class: 'muted', 'data-testid': 'backend-no-listings' }, 'Belum ada tiket resale yang dapat dibeli.')); return; }
    listingsBox.replaceChildren(...listings.map((l) => {
      const ev = events.find((e) => e.id === l.eventId);
      return el('div', { class: 'backend-row', 'data-testid': `backend-listing-${l.tokenId}` }, el('strong', {}, `Tiket #${l.tokenId}`),
        el('span', {}, ev?.title ?? `Event #${l.eventId}`), el('span', {}, `Resale ${money(mapTicket({ tokenId: l.tokenId, eventId: l.eventId, owner: l.seller, status: 'valid', originalPrice: l.price }).facePrice)}`),
        el('span', { class: 'muted' }, `Penjual ${shortAddress(l.seller)}`));
    }));
  }

  function draw() { if (disposed) return; drawStatus(); drawWallet(); drawEvents(); drawEditor(); drawTickets(); drawListings(); }

  const connectBtn = button('Hubungkan wallet', async () => {
    try { wallet = await connect(injected); onWalletConnected(wallet); await refresh(); } catch (e) { fail(e); }
  }, { kind: 'primary', iconName: 'wallet', 'data-testid': 'backend-connect' });
  const reloadBtn = button('Muat ulang', refresh, { kind: 'outline', iconName: 'refresh', 'data-testid': 'backend-refresh' });

  const walletChanged = (accounts) => { if (disposed) return; wallet = accounts?.length ? { address: accounts[0], chainId: wallet?.chainId ?? 0 } : null; editing = null; lastHash = null; roles = null; tickets = []; onWalletConnected(wallet); refresh(); };
  injected?.on?.('accountsChanged', walletChanged);

  const main = el('main', { id: 'main', class: 'container integration-page backend-page' },
    el('div', { class: 'page-top' }, el('div', {}, el('div', { class: 'eyebrow' }, 'LAB BACKEND'), el('h1', {}, 'Data event dari indexer, bukan data demo.'),
      el('p', { class: 'muted' }, 'Halaman ini membaca event, tiket, dan listing resale dari backend yang mengindeks kontrak. Organizer dapat menyimpan detail dan poster off-chain.'))),
    el('div', { class: 'notice integration-notice' }, icon('info'), el('span', {}, 'Hanya pembacaan data dan detail off-chain yang tersambung ke backend. Pembelian, resale, dan check-in di halaman lain masih mode demo.')),
    el('section', { class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Koneksi'), el('div', { class: 'integration-actions' }, connectBtn, reloadBtn)), status, walletBox, error),
    el('section', { class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Event on-chain')), eventsBox), editorBox,
    el('div', { class: 'integration-columns' },
      el('section', { class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Tiket di wallet ini')), ticketsBox),
      el('section', { class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Resale yang dapat dibeli')), listingsBox)),
    el('p', { class: 'field-hint' }, 'Sumber data: backend anti-calo. Lihat docs/PANDUAN-DEPLOYMENT.md untuk menjalankannya.', ' ', link('Panduan', 'guide.html', { kind: 'text' })));

  draw(); refresh();
  return { main, cleanup() { disposed = true; injected?.removeListener?.('accountsChanged', walletChanged); } };
}
