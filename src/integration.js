import QRCode from 'qrcode';
import { CHAIN_ID, QR_TTL, sameAddress } from './model.js';
import { connectInjectedWallet, switchToSepolia, normalizeChainConfig, readOnchainTicket, signOnchainQR, verifyOnchainQR } from './chain.js';
import { el, icon, badge, button, link, field, shortAddress, toast } from './ui.js';

export const CHAIN_CONFIG_KEY = 'tiketra-chain-config-v1';
const defaultConfig = () => ({ contract: import.meta.env?.VITE_CONTRACT_ADDRESS ?? '', eventId: '1', tokenId: '' });
function safeStorage() { try { return globalThis.localStorage; } catch { return null; } }
function storedConfig(storage) {
  try {
    const raw = storage?.getItem(CHAIN_CONFIG_KEY);
    if (!raw || raw.length > 512) return defaultConfig();
    const c = JSON.parse(raw);
    if (c.version !== 1 || !['contract', 'eventId', 'tokenId'].every(k => typeof c[k] === 'string')) return defaultConfig();
    return { contract: c.contract.slice(0, 42), eventId: c.eventId.slice(0, 78), tokenId: c.tokenId.slice(0, 78) };
  } catch { return defaultConfig(); }
}
export function createIntegrationPage({ initialWallet = null, initialConfig, onWalletConnected = () => {}, onConfigChange = () => {}, injected = globalThis.window?.ethereum, storage = safeStorage(), api = {}, qrEncoder = QRCode } = {}) {
  const chain = { connectInjectedWallet, switchToSepolia, normalizeChainConfig, readOnchainTicket, signOnchainQR, verifyOnchainQR, ...api };
  const saved = initialConfig ?? storedConfig(storage);
  let wallet = initialWallet, ticket = null, signed = null, inspectedKey = '', busy = false, epoch = 0, disposed = false, connecting = false, timer;
  const pending = el('p', { class: 'integration-pending', role: 'status', 'aria-live': 'polite', hidden: true });
  const error = el('p', { class: 'form-error', role: 'alert', 'data-testid': 'integration-error' });
  const status = el('div', { class: 'integration-wallet-status', 'data-testid': 'integration-wallet-status' });
  const ownerResult = el('div', { class: 'integration-owner', 'data-testid': 'integration-owner', role: 'status', 'aria-live': 'polite' });
  const verifyResult = el('div', { class: 'integration-verify-result', 'data-testid': 'integration-verification', role: 'status', 'aria-live': 'polite' });
  const canvas = el('canvas', { hidden: true, 'aria-label': 'QR EIP-712 untuk NFT yang diperiksa' });
  const placeholder = el('div', { class: 'signed-qr-placeholder' }, icon('qr', 60), el('h3', {}, 'QR dari pemilik NFT'), el('p', {}, 'Periksa NFT, lalu tanda tangani menggunakan wallet pemilik.'));
  const countdown = el('strong', { 'data-testid': 'signed-countdown' }, '—');
  const qrState = el('p', { class: 'qr-state' });
  const progress = el('progress', { max: QR_TTL, value: 0 });
  const payload = el('textarea', { rows: 6, placeholder: 'Payload QR bertanda tangan akan muncul di sini. Kamu juga dapat menempel QR on-chain untuk diperiksa.', maxLength: 8192, 'aria-label': 'Payload QR on-chain', 'data-testid': 'signed-payload', oninput: () => verifyResult.replaceChildren() });
  const inputs = {
    contract: el('input', { type: 'text', value: saved.contract, placeholder: '0x… alamat kontrak NFT tim', maxLength: 42, autocomplete: 'off', 'data-testid': 'integration-contract' }),
    eventId: el('input', { type: 'text', inputMode: 'numeric', value: saved.eventId, maxLength: 78, autocomplete: 'off', 'data-testid': 'integration-event' }),
    tokenId: el('input', { type: 'text', inputMode: 'numeric', value: saved.tokenId, placeholder: 'Token ID on-chain', maxLength: 78, autocomplete: 'off', 'data-testid': 'integration-token' }),
  };
  const config = () => Object.fromEntries(Object.entries(inputs).map(([k, input]) => [k, input.value.trim()]));
  const contextKey = c => JSON.stringify([c.contract.toLowerCase(), String(c.eventId), String(c.tokenId)]);
  function control(label, action, kind, testId, symbol) {
    return el('button', { type: 'button', class: `btn btn-${kind}`, 'data-testid': testId, onclick: action }, symbol ? icon(symbol) : null, label);
  }
  async function perform(task, message = 'Menunggu respons wallet atau jaringan Sepolia…') {
    if (busy || disposed) return;
    const operation = ++epoch; busy = true; error.textContent = ''; pending.textContent = message; update();
    const current = () => !disposed && epoch === operation;
    try { await task(current); }
    catch (e) { if (current()) error.textContent = e.code === 4001 || e.code === 'ACTION_REJECTED' || e.info?.error?.code === 4001 ? 'Permintaan wallet dibatalkan. Kamu dapat mencobanya lagi.' : (e.shortMessage ?? e.message ?? 'Permintaan belum berhasil. Coba ulang.'); }
    finally { if (current()) { busy = false; update(); } }
  }
  function clearProof() {
    signed = null; clearInterval(timer); canvas.hidden = true; placeholder.hidden = false; canvas.classList.remove('expired'); countdown.textContent = '—'; progress.value = 0; qrState.textContent = ''; verifyResult.replaceChildren();
  }
  function invalidate() {
    epoch++; busy = false; ticket = null; inspectedKey = ''; ownerResult.replaceChildren(); clearProof(); update();
  }
  for (const input of Object.values(inputs)) input.addEventListener('input', () => { onConfigChange(config()); error.textContent = ''; invalidate(); });
  const connect = control('Hubungkan MetaMask', () => perform(async current => {
    ticket = null; inspectedKey = ''; clearProof(); ownerResult.replaceChildren(); connecting = true;
    try {
      const result = await chain.connectInjectedWallet(injected); if (!current()) return;
      wallet = result; onWalletConnected(wallet);
    } finally { connecting = false; }
  }), 'primary', 'integration-connect', 'wallet');
  const switchNetwork = control('Ganti ke Sepolia', () => perform(async current => {
    await chain.switchToSepolia(injected); if (!current()) return;
    wallet = await chain.connectInjectedWallet(injected); if (!current()) return; onWalletConnected(wallet);
  }), 'outline', 'integration-switch', 'refresh');
  const save = control('Simpan konfigurasi', () => {
    try {
      const c = chain.normalizeChainConfig(config());
      for (const [key, value] of Object.entries(c)) inputs[key].value = value;
      onConfigChange(c); invalidate();
      if (!storage) throw Error('Penyimpanan browser tidak tersedia. Konfigurasi hanya digunakan pada halaman ini.');
      storage.setItem(CHAIN_CONFIG_KEY, JSON.stringify({ version: 1, ...c }));
      toast('Konfigurasi publik disimpan. Tidak ada private key yang disimpan.'); error.textContent = '';
    } catch (e) { error.textContent = e.message; }
  }, 'outline', 'integration-save', 'check');
  const inspect = control('Periksa pemilik NFT', () => perform(async current => {
    ticket = null; inspectedKey = ''; ownerResult.replaceChildren(); clearProof();
    const c = chain.normalizeChainConfig(config()), result = await chain.readOnchainTicket({ ...c, injected });
    if (!current()) return;
    ticket = result; inspectedKey = contextKey(c);
    ownerResult.append(el('div', { class: 'integration-result-heading' }, icon('check', 19), el('strong', {}, 'NFT ditemukan di Sepolia')),
      el('dl', {}, el('dt', {}, 'Pemilik saat diperiksa'), el('dd', {}, el('code', {}, result.owner)), el('dt', {}, 'Token ID'), el('dd', {}, result.tokenId), el('dt', {}, 'Blok pemeriksaan'), el('dd', {}, result.blockNumber)),
      badge(sameAddress(wallet?.address, result.owner) ? 'Wallet ini pemiliknya' : 'Wallet ini bukan pemiliknya', sameAddress(wallet?.address, result.owner) ? 'green' : 'amber'),
      link('Lihat kontrak di explorer', `https://sepolia.etherscan.io/address/${result.contract}`, { kind: 'text', iconName: 'external', target: '_blank', rel: 'noopener noreferrer' }));
  }), 'primary', 'integration-inspect', 'search');
  const sign = control('Tanda tangani & buat QR', () => perform(async current => {
    clearProof(); const c = chain.normalizeChainConfig(config());
    if (!ticket || inspectedKey !== contextKey(c) || !sameAddress(wallet?.address, ticket.owner)) throw Error('Periksa NFT milik wallet ini sebelum membuat QR.');
    const result = await chain.signOnchainQR({ ...c, injected }); if (!current()) return;
    const raw = JSON.stringify(result); await qrEncoder.toCanvas(canvas, raw, { width: 320, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#19201c', light: '#ffffff' } });
    if (!current()) return;
    signed = result; payload.value = raw; canvas.hidden = false; placeholder.hidden = true; updateCountdown(); timer = setInterval(updateCountdown, 1000);
  }), 'primary', 'integration-sign', 'qr');
  const verify = control('Periksa signature & pemilik', () => perform(async current => {
    verifyResult.replaceChildren(); const c = chain.normalizeChainConfig(config());
    const result = await chain.verifyOnchainQR({ input: payload.value, ...c, injected }); if (!current()) return;
    verifyResult.append(el('div', { class: 'verification-success' }, icon('shield'), el('div', {}, el('strong', {}, 'Signature dan pemilik NFT cocok'), el('p', {}, `Token #${result.tokenId} · blok ${result.blockNumber}`))),
      el('p', { class: 'field-hint' }, 'Hubungan token dengan event, status pemakaian, role, dan penugasan petugas belum diperiksa. Hasil ini belum memberi izin check-in.'));
  }), 'outline', 'integration-verify', 'shield');
  const copy = control('Salin payload', async () => {
    try { await navigator.clipboard.writeText(payload.value); toast('Payload QR on-chain disalin.'); }
    catch { payload.focus(); payload.select(); toast('Payload dipilih. Gunakan Ctrl+C untuk menyalin.'); }
  }, 'text', 'integration-copy', 'copy');
  function updateCountdown() {
    if (!signed || disposed) return;
    const left = Math.max(0, signed.message.expiresAt - Math.floor(Date.now() / 1000));
    countdown.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; progress.value = left;
    canvas.classList.toggle('expired', left === 0); qrState.textContent = left ? 'QR bertanda tangan · batas waktu aktif' : 'QR sudah kedaluwarsa · buat ulang'; qrState.className = `qr-state ${left ? 'valid' : 'invalid'}`;
    if (!left) { clearInterval(timer); verifyResult.replaceChildren(); }
  }
  function update() {
    status.replaceChildren(wallet ? el('div', {}, badge(wallet.chainId === CHAIN_ID ? 'Sepolia terhubung' : 'Jaringan belum Sepolia', wallet.chainId === CHAIN_ID ? 'green' : 'amber'), el('code', {}, wallet.address)) : el('p', { class: 'muted' }, 'Hubungkan wallet ekstensi untuk membaca NFT milikmu. Akun demo tidak digunakan di halaman ini.'));
    const wrongNetwork = !wallet || wallet.chainId !== CHAIN_ID;
    pending.hidden = !busy; connect.disabled = busy; switchNetwork.hidden = !wallet || !wrongNetwork; switchNetwork.disabled = busy;
    inspect.disabled = busy || wrongNetwork; sign.disabled = busy || wrongNetwork || !ticket || !sameAddress(wallet?.address, ticket.owner); verify.disabled = busy || wrongNetwork; copy.disabled = !payload.value;
    save.disabled = busy; payload.disabled = busy; Object.values(inputs).forEach(input => input.disabled = busy);
    inspect.setAttribute('aria-busy', String(busy)); sign.setAttribute('aria-busy', String(busy));
  }
  payload.addEventListener('input', () => { copy.disabled = !payload.value; });
  function walletChanged(accounts) {
    if (disposed || connecting) return;
    wallet = accounts?.length ? { address: accounts[0], chainId: wallet?.chainId ?? 0 } : null;
    invalidate(); onWalletConnected(wallet);
  }
  function networkChanged(chainId) {
    if (disposed || connecting) return; if (wallet) wallet = { ...wallet, chainId: Number(chainId) }; invalidate(); onWalletConnected(wallet);
  }
  injected?.on?.('accountsChanged', walletChanged); injected?.on?.('chainChanged', networkChanged);
  const main = el('main', { id: 'main', class: 'container integration-page' },
    el('div', { class: 'page-top' }, el('div', {}, el('div', { class: 'eyebrow' }, 'LAB INTEGRASI BLOCKCHAIN'), el('h1', {}, 'Dari wallet ke bukti kepemilikan.'), el('p', { class: 'muted' }, 'Baca NFT pada Sepolia dan coba QR EIP-712 dengan tanda tangan pemilik.')), link('Kembali ke panduan', 'guide.html', { kind: 'outline', iconName: 'book' })),
    el('div', { class: 'notice integration-notice' }, icon('info'), el('span', {}, 'Pembacaan NFT dan tanda tangan pada halaman ini menggunakan wallet asli di Sepolia. Pembelian serta check-in marketplace tetap dalam mode demo.')),
    pending, el('div', { class: 'integration-columns' },
      el('div', {}, el('section', { class: 'panel integration-wallet-panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, '1. Hubungkan wallet'), badge('Ethereum Sepolia', 'purple')), status, el('div', { class: 'integration-actions' }, connect, switchNetwork)),
        el('section', { class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, '2. Tentukan NFT & event'), badge('Konfigurasi publik')),
          field('Alamat kontrak NFT Sepolia', inputs.contract, 'Gunakan alamat deployment dari tim, bukan alamat akun wallet.'),
          el('div', { class: 'form-grid' }, field('Event ID on-chain', inputs.eventId, 'Referensi uint256 yang disepakati tim.'), field('Token ID NFT', inputs.tokenId, 'Token harus sudah dibuat pada kontrak ini.')),
          el('div', { class: 'integration-actions' }, save, inspect), ownerResult, error,
          el('p', { class: 'field-hint' }, 'Pemeriksaan memakai fungsi ERC-721 standar. Jika kontrak tim memiliki bentuk lain, diperlukan adapter ABI. Event ID belum dipetakan ke token oleh kontrak pada halaman ini.'))),
      el('div', {}, el('section', { class: 'panel signed-qr-panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, '3. Buat QR pemilik'), badge('EIP-712', 'green')),
        el('div', { class: 'signed-qr-frame' }, placeholder, canvas), qrState,
        el('div', { class: 'qr-timer' }, icon('clock', 17), el('span', {}, 'Berakhir dalam'), countdown), progress, sign,
        el('p', { class: 'field-hint' }, 'Wallet menandatangani data CheckIn, tanpa mengirim transaksi atau ETH. Skema domain AntiCaloCheckIn v1 perlu disamakan dengan kontrak tim.')),
        el('section', { class: 'panel' }, el('h2', {}, '4. Periksa bukti QR'), el('p', { class: 'muted integration-intro' }, 'Tempel payload bertanda tangan dari pemilik. Pemeriksaan membaca ulang ownerOf pada Sepolia.'), payload,
          el('div', { class: 'integration-actions' }, verify, copy), verifyResult,
          el('p', { class: 'field-hint' }, 'Tanda tangan yang valid masih memerlukan transaksi check-in dari petugas berizin. Kontrak harus mencegah pemakaian ulang.')))),
    el('section', { class: 'integration-next' }, el('span', { class: 'rule-icon' }, icon('shield', 25)), el('div', {}, el('h2', {}, 'Langkah berikutnya bersama tim kontrak'), el('p', {}, 'Hubungkan ABI marketplace untuk pembelian, resale, role, event, dan check-in atomik. QR dari lab ini tidak menandai tiket sebagai terpakai.'), link('Baca kebutuhan integrasi', 'docs.html#docs-yang-dibutuhkan-dari-tim-smart-contract', { kind: 'text', iconName: 'arrow' }))));
  update();
  return { main, cleanup: () => { disposed = true; epoch++; clearInterval(timer); injected?.removeListener?.('accountsChanged', walletChanged); injected?.removeListener?.('chainChanged', networkChanged); } };
}
