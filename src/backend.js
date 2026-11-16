import { sameAddress } from './model.js';
import { connectInjectedWallet } from './chain.js';
import { API_URL, CATEGORIES, createApiClient, browserWallet, joinLocation, splitLocation, mapTicket } from './api.js';
import { createOnchain, signerFor, switchChain, waitForIndexer, explorerTxUrl } from './onchain.js';
import { eventActions, ticketActions, listingActions, createEventPanel, gatePanel, adminPanel, proceedsPanel } from './backend-actions.js';
import { el, icon, badge, button, link, field, shortAddress, toast, dateText, timeText, money, statusBadge } from './ui.js';

const HASH_BADGE = {
  match: ['Cocok dengan komitmen on-chain', 'green'],
  mismatch: ['Tidak cocok dengan hash on-chain', 'red'],
  unset: ['Hash on-chain kosong', 'amber'],
  missing: ['Detail belum diisi', 'neutral'],
};



export function createBackendPage({ initialWallet = null, onWalletConnected = () => {}, injected = globalThis.window?.ethereum,
  onRolesChanged = () => {}, baseUrl = API_URL, createClient, makeOnchain, chain = {}, mode = 'lab', now = () => Math.floor(Date.now() / 1000) } = {}) {
  const connect = chain.connectInjectedWallet ?? connectInjectedWallet;
  const makeClient = createClient ?? ((wallet) => createApiClient({ baseUrl, wallet: wallet ? browserWallet(injected, wallet.address) : null }));
  let wallet = initialWallet, client = null, accountProfile = null, roles = null, events = [], tickets = [], listings = [], editing = null, disposed = false, epoch = 0;
  let statusInfo = null, loadError = '', lastHash = null, cfg = null, txBusy = false, pendingEdit = null, pendingDetails = null, pendingEditDraft = null, txInfo = null;

  const status = el('div', { class: 'backend-status', 'data-testid': 'backend-status', role: 'status', 'aria-live': 'polite' });
  const walletBox = el('div', { class: 'backend-wallet', 'data-testid': 'backend-wallet' });
  const error = el('p', { class: 'form-error', role: 'alert', 'data-testid': 'backend-error' });
  const eventsBox = el('div', { class: 'backend-events', 'data-testid': 'backend-events' });
  const editorBox = el('div', { 'data-testid': 'backend-editor' });
  const ticketsBox = el('div', { 'data-testid': 'backend-tickets' });
  const listingsBox = el('div', { 'data-testid': 'backend-listings' });
  const actionsBox = el('div', { 'data-testid': 'backend-actions' });
  const txBox = el('div', { class: 'backend-tx', 'data-testid': 'backend-tx', role: 'status', 'aria-live': 'polite' });

  const fail = (e) => { error.textContent = e?.message ?? 'Tindakan belum berhasil.'; };
  const canEdit = (ev) => Boolean(accountRegistered() && wallet && roles?.organizer && sameAddress(ev.organizer, wallet.address));

  async function refresh() {
    const mine = ++epoch;
    error.textContent = ''; loadError = '';
    try {
      client = makeClient(wallet);
      const [s, evs, ls, r, ts, c] = await Promise.all([
        client.status(), client.events(wallet && mode === 'organizer' ? { organizer: wallet.address, limit: 100 } : { limit: 100 }), client.listings(),
        wallet ? client.roles(wallet.address) : null, wallet ? client.tickets(wallet.address) : [],
        client.config ? client.config().catch(() => null) : null,
      ]);
      if (disposed || mine !== epoch) return;
      statusInfo = s; events = evs; listings = ls; roles = r; tickets = ts; cfg = c;
      accountProfile = wallet && client.account
        ? await client.account(wallet.address).catch((e) => { if (e.status === 404) return null; throw e; })
        : null;
      onRolesChanged(roles);
      if (pendingEdit && events.some((e) => e.id === pendingEdit)) { editing = pendingEdit; pendingEdit = null; }
    } catch (e) { if (disposed || mine !== epoch) return; statusInfo = null; loadError = e.message; }
    draw();
    await savePendingDetails();
  }

  async function savePendingDetails() {
    if (!pendingDetails || !events.some((ev) => ev.id === pendingDetails.id)) return;
    const savedDetails = pendingDetails;
    pendingDetails = null;
    try {
      await client.saveDetails(savedDetails.id, savedDetails.details, false);
      pendingEditDraft = null;
      setTx('Event dan detail berhasil disimpan.', txInfo?.hash);
      toast('Detail event berhasil disimpan.');
      await refresh();
    } catch (e) {
      pendingEditDraft = savedDetails;
      error.textContent = `Event berhasil dibuat, tetapi detail belum tersimpan: ${e.message}`;
      draw();
    }
  }

  const chainOk = () => Boolean(wallet && cfg?.ticketAddress && cfg?.marketplaceAddress && Number(wallet.chainId) === Number(cfg.chainId));
  const accountRegistered = () => mode === 'lab' || !client?.account || Boolean(accountProfile);
  const ctx = () => ({ wallet, roles, cfg, chainOk: chainOk(), accountRegistered: accountRegistered(), now, run, sameAddress,
    hashFor: (details) => client.hashFor(details),
    created: (id, details) => { pendingEdit = id; pendingDetails = details ? { id, details } : null; } });

  function setTx(message, hash) { txInfo = message ? { message, hash } : null; drawTx(); }

  async function run(label, fn) {
    if (txBusy) { error.textContent = 'Masih ada transaksi yang berjalan. Tunggu sampai selesai.'; return; }
    txBusy = true; error.textContent = '';
    try {
      setTx(`${label}…`);
      const onStatus = (m) => setTx(`${label}: ${m}`);
      const chain = makeOnchain ? await makeOnchain({ onStatus }) : createOnchain({ signer: await signerFor(injected, wallet.address), ticketAddress: cfg.ticketAddress, marketplaceAddress: cfg.marketplaceAddress, onStatus });
      const result = await fn(chain);
      if (result?.blockNumber !== undefined) {
        setTx(`${label}: terkonfirmasi di blok ${result.blockNumber}. Menunggu indexer…`, result.hash);
        const synced = await waitForIndexer(client, result.blockNumber).catch(() => false);
        setTx(synced ? `${label}: berhasil.` : `${label}: berhasil di blockchain, tetapi indexer belum menyusul. Muat ulang beberapa saat lagi.`, result.hash);
        toast(`${label} berhasil.`);
      }
      await refresh();
    } catch (e) { setTx(''); fail(e); } finally { txBusy = false; }
  }
  function drawTx() {
    if (!txInfo) { txBox.replaceChildren(); return; }
    const url = txInfo.hash && cfg ? explorerTxUrl(cfg.chainId, txInfo.hash) : null;
    txBox.replaceChildren(el('span', {}, txInfo.message), txInfo.hash ? el('code', {}, txInfo.hash) : null, url ? link('Lihat di explorer', url, { kind: 'text', iconName: 'external', target: '_blank', rel: 'noopener noreferrer' }) : null);
  }
  function drawActions() {
    const c = ctx();
    const registration = wallet && statusInfo && !c.accountRegistered
      ? el('div', { class: 'notice', 'data-testid': 'backend-register-required' }, icon('info'),
          el('span', {}, 'Daftar atau masuk dengan wallet untuk mengaktifkan tindakan akun.'),
          link('Daftar / masuk', 'account.html', { kind: 'outline' }))
      : null;
    const needsRole = ['organizer', 'gate', 'admin'].includes(mode);
    const roleMissing = wallet && c.accountRegistered && c.chainOk && needsRole
      && (mode === 'organizer' && !roles?.organizer
        || mode === 'gate' && !roles?.gateCheckerEventIds?.length
        || mode === 'admin' && !roles?.admin);
    const access = !wallet && needsRole
      ? el('div', { class: 'notice' }, icon('info'), el('span', {}, 'Masuk dengan wallet yang memiliki akses untuk membuka halaman ini.'),
          link('Masuk', 'account.html', { kind: 'outline' }))
      : roleMissing
        ? el('div', { class: 'notice' }, icon('info'), el('span', {}, mode === 'organizer'
          ? 'Wallet ini belum memiliki role Organizer. Hubungi Admin.'
          : mode === 'gate'
            ? 'Wallet ini belum ditugaskan sebagai Gate Checker untuk event mana pun.'
            : 'Halaman ini hanya tersedia untuk wallet Admin.'))
        : null;
    const banner = !wallet || !statusInfo ? null
      : !c.accountRegistered ? null
      : !cfg?.ticketAddress || !cfg?.marketplaceAddress ? el('div', { class: 'notice', 'data-testid': 'backend-network' }, icon('info'), el('span', {}, 'Alamat kontrak belum dikonfigurasi di backend, jadi transaksi dinonaktifkan.'))
      : !c.chainOk ? el('div', { class: 'notice', 'data-testid': 'backend-network' }, icon('info'), el('span', {}, `Wallet berada di jaringan lain. Transaksi memerlukan Chain ID ${cfg.chainId}.`),
          button('Ganti jaringan', async () => { await switchChain(cfg.chainId, injected); wallet = await connect(injected); onWalletConnected(wallet); await refresh(); }, { kind: 'outline', 'data-testid': 'backend-switch' }))
      : null;
    const panels = mode === 'events' ? []
      : mode === 'marketplace' || mode === 'tickets' ? [proceedsPanel(c)]
        : mode === 'organizer' ? [createEventPanel(c)]
          : mode === 'gate' ? [gatePanel(c, events)]
            : mode === 'admin' ? [adminPanel(c)]
              : [createEventPanel(c), gatePanel(c, events), adminPanel(c), proceedsPanel(c)];
    actionsBox.replaceChildren(...[registration, registration ? null : access, registration || access ? null : banner,
      ...(registration || access ? [] : panels)].filter(Boolean));
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
      accountProfile?.display_name ? el('strong', {}, accountProfile.display_name) : null,
      roles?.admin ? badge('Admin', 'purple') : null, roles?.organizer ? badge('Organizer', 'green') : null,
      roles?.gateCheckerEventIds?.length ? badge('Gate Checker', 'amber') : null,
      roles && !roles.admin && !roles.organizer && !roles.gateCheckerEventIds.length ? badge('Pembeli', 'neutral') : null);
  }

  function eventContext() {
    const c = ctx();
    if (mode === 'events' || mode === 'gate') c.roles = null;
    else if (mode === 'organizer') c.roles = { ...roles, admin: false };
    else if (mode === 'admin') c.roles = { ...roles, organizer: false };
    return c;
  }

  function drawEvents() {
    if (!statusInfo) { eventsBox.replaceChildren(); return; }
    const visible = mode === 'events'
      ? events.filter((ev) => ev.status === 'live' && ev.eventTime > now())
      : mode === 'gate'
      ? roles ? events.filter((ev) => roles.gateCheckerEventIds?.includes(ev.id)) : []
      : mode === 'organizer'
        ? wallet && roles?.organizer ? events.filter((ev) => sameAddress(ev.organizer, wallet.address)) : []
        : events;
    if (!visible.length) {
      const message = mode === 'organizer' && !roles?.organizer
        ? 'Role Organizer tidak aktif. Event lama tetap mencatat alamat pembuatnya, tetapi tidak memberi akses Organizer.'
        : mode === 'events'
          ? 'Belum ada event aktif atau mendatang.'
          : 'Belum ada event yang tersedia. Pastikan indexer berjalan, START_BLOCK benar, dan wallet memiliki akses yang sesuai.';
      eventsBox.replaceChildren(el('p', { class: 'muted', 'data-testid': 'backend-no-events' }, message)); return;
    }
    eventsBox.replaceChildren(...visible.map((ev) => {
      const [hashText, hashKind] = HASH_BADGE[ev.hashStatus] ?? HASH_BADGE.missing;
      return el('article', { class: 'backend-event', 'data-testid': `backend-event-${ev.id}` },
        ev.posterUrl ? el('img', { src: ev.posterUrl, alt: `Poster ${ev.title}`, width: 120, height: 80, loading: 'lazy' }) : el('div', { class: 'backend-poster-empty' }, icon('ticket', 26)),
        el('div', {}, el('div', { class: 'backend-event-head' }, el('h3', {}, ev.title), statusBadge(ev.status), ev.category ? badge(ev.category) : null),
          el('p', { class: 'muted' }, `${dateText(ev.date, true)} · ${timeText(ev.date)} · ${[ev.venue, ev.city].filter(Boolean).join(', ') || 'Lokasi belum diisi'}`),
          el('p', {}, `${money(ev.price)} · terjual ${ev.sold}/${ev.capacity} · check-in ${ev.checkedIn}`),
          el('p', { class: 'field-hint' }, `Organizer ${shortAddress(ev.organizer)} · Event #${ev.id}`),
          badge(hashText, hashKind)),
        el('div', { class: 'backend-event-actions' },
          (mode === 'organizer' || mode === 'lab') && canEdit(ev) ? button(ev.detailsComplete ? 'Edit detail' : 'Isi detail', () => { editing = ev.id; lastHash = null; error.textContent = ''; draw(); }, { kind: 'outline', iconName: 'book', 'data-testid': `backend-edit-${ev.id}` }) : null,
          mode === 'gate' ? null : eventActions(ev, eventContext())));
    }));
  }

  function drawEditor() {
    const ev = events.find((e) => e.id === editing);
    if (!ev) { editorBox.replaceChildren(); return; }
    const draft = pendingEditDraft?.id === ev.id ? pendingEditDraft.details : null;
    const draftLocation = splitLocation(draft?.location ?? '');
    const inputs = {
      title: el('input', { value: draft?.title ?? (ev.title.startsWith('Event #') ? '' : ev.title), maxlength: 120, 'data-testid': 'backend-title' }),
      category: el('select', { 'data-testid': 'backend-category' }, ...CATEGORIES.map((c) => el('option', { value: c, selected: c === (draft?.category ?? ev.category) }, c))),
      venue: el('input', { value: draftLocation.venue || ev.venue, maxlength: 150, 'data-testid': 'backend-venue' }),
      city: el('input', { value: draftLocation.city || ev.city, maxlength: 50, 'data-testid': 'backend-city' }),
      description: el('textarea', { rows: 5, maxlength: 5000, 'data-testid': 'backend-description' }, draft?.description ?? ev.description),
      poster: el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'data-testid': 'backend-poster' }),
    };
    inputs.category.value = CATEGORIES.includes(draft?.category ?? ev.category) ? (draft?.category ?? ev.category) : CATEGORIES[0];
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
    ticketsBox.replaceChildren(...tickets.filter((t) => ['valid', 'used', 'revoked'].includes(t.status)).map((t) => {
      const m = mapTicket(t, listed.get(t.tokenId)), ev = events.find((e) => e.id === m.eventId);
      return el('div', { class: 'backend-row', 'data-testid': `backend-ticket-${m.id}` },
        el('strong', {}, `Tiket #${m.id}`), el('span', {}, ev?.title ?? `Event #${m.eventId}`), statusBadge(m.status),
        m.resalePrice ? el('span', {}, `Resale ${money(m.resalePrice)}`) : null,
        ticketActions(m, ev, listed.get(t.tokenId), ctx()));
    }));
  }

  function drawListings() {
    if (!listings.length) { listingsBox.replaceChildren(el('p', { class: 'muted', 'data-testid': 'backend-no-listings' }, 'Belum ada tiket resale yang dapat dibeli.')); return; }
    listingsBox.replaceChildren(...listings.map((l) => {
      const ev = events.find((e) => e.id === l.eventId);
      return el('div', { class: 'backend-row', 'data-testid': `backend-listing-${l.tokenId}` }, el('strong', {}, `Tiket #${l.tokenId}`),
        el('span', {}, ev?.title ?? `Event #${l.eventId}`), el('span', {}, `Resale ${money(mapTicket({ tokenId: l.tokenId, eventId: l.eventId, owner: l.seller, status: 'valid', originalPrice: l.price }).facePrice)}`),
        el('span', { class: 'muted' }, `Penjual ${shortAddress(l.seller)}`), listingActions(l, ctx()));
    }));
  }

  function draw() { if (disposed) return; drawStatus(); drawWallet(); drawActions(); drawEvents(); drawEditor(); drawTickets(); drawListings(); drawTx(); }

  const connectBtn = button('Hubungkan wallet', async () => {
    try { wallet = await connect(injected); onWalletConnected(wallet); await refresh(); } catch (e) { fail(e); }
  }, { kind: 'primary', iconName: 'wallet', 'data-testid': 'backend-connect' });
  const reloadBtn = button('Muat ulang', refresh, { kind: 'outline', iconName: 'refresh', 'data-testid': 'backend-refresh' });

  const walletChanged = (accounts) => { if (disposed) return; wallet = accounts?.length ? { address: accounts[0], chainId: wallet?.chainId ?? 0 } : null; editing = null; lastHash = null; roles = null; accountProfile = null; tickets = []; onWalletConnected(wallet); onRolesChanged(null); refresh(); };
  const chainChanged = (id) => { if (disposed || !wallet) return; wallet = { ...wallet, chainId: Number(id) }; onWalletConnected(wallet); draw(); };
  injected?.on?.('chainChanged', chainChanged);
  injected?.on?.('accountsChanged', walletChanged);

  const headings = {
    events: ['EVENT', 'Jelajahi event', 'Temukan event aktif dan beli tiket langsung dengan wallet Sepolia.'],
    marketplace: ['MARKETPLACE', 'Jual dan beli tiket resale', 'Listing aktif berasal dari Marketplace on-chain. Pemilik tiket juga dapat membuat listing sesuai batas harga kontrak.'],
    tickets: ['TIKET SAYA', 'Tiket milik wallet', 'Tiket dan statusnya dibaca dari blockchain melalui indexer.'],
    organizer: ['ORGANIZER', 'Kelola event', 'Buat event on-chain, lengkapi detailnya, dan tugaskan Gate Checker.'],
    gate: ['GATE CHECKER', 'Validasi tiket', 'Pilih event yang ditugaskan kepadamu dan check-in dengan ID tiket.'],
    admin: ['ADMIN', 'Kelola akses dan moderasi', 'Berikan atau cabut role Organizer dan lakukan tindakan admin yang didukung kontrak.'],
    lab: ['LAB BACKEND', 'Panel integrasi', 'Data event, tiket, dan listing dari indexer beserta panel tindakan berbasis role.'],
  };
  const [eyebrow, title, description] = headings[mode] ?? headings.lab;
  const main = el('main', { id: 'main', class: 'container integration-page backend-page' },
    el('div', { class: 'page-top' }, el('div', {}, el('div', { class: 'eyebrow' }, eyebrow),
      el('h1', {}, title), el('p', { class: 'muted' }, description))),
    el('div', { class: 'notice integration-notice' }, icon('info'), el('span', {}, mode === 'lab'
      ? 'Transaksi dikirim melalui wallet yang terhubung dan mengikuti role kontrak.'
      : 'Data dibaca dari backend/indexer; setiap transaksi perlu konfirmasi MetaMask dan Sepolia ETH.')),
    el('section', { class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Koneksi'), el('div', { class: 'integration-actions' }, connectBtn, reloadBtn)), status, walletBox, error, txBox),
    actionsBox,
    mode === 'events' || mode === 'organizer' || mode === 'admin' || mode === 'gate' || mode === 'lab'
      ? el('section', { id: 'events', class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, mode === 'events' ? 'Event yang sedang dijual dan akan datang' : 'Event on-chain')), eventsBox)
      : null,
    editorBox,
    mode === 'marketplace' || mode === 'tickets' || mode === 'lab'
      ? el('section', { id: 'tickets', class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Tiket di wallet ini')), ticketsBox)
      : null,
    mode === 'marketplace' || mode === 'lab'
      ? el('section', { id: 'listings', class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Listing aktif')), listingsBox)
      : null,
    el('p', { class: 'field-hint' }, 'Sumber data: backend anti-calo.'));

  draw(); refresh();
  return { main, cleanup() { disposed = true; injected?.removeListener?.('accountsChanged', walletChanged); injected?.removeListener?.('chainChanged', chainChanged); } };
}
