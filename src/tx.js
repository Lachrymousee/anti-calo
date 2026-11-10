// Pelacak status transaksi on-chain untuk UI anti-calo.
//
// Memenuhi kebutuhan "Melihat status transaksi: menunggu persetujuan wallet,
// menunggu konfirmasi, berhasil, atau gagal." Modul ini murni logika + komponen
// DOM kecil, tidak bergantung pada ethers sehingga mudah diuji dengan mock.
import { el, icon, button } from './ui.js';

export const TX_STATES = {
  approving: { label: 'Menunggu persetujuan wallet', kind: 'amber', icon: 'wallet' },
  pending: { label: 'Menunggu konfirmasi jaringan', kind: 'amber', icon: 'clock' },
  success: { label: 'Transaksi berhasil', kind: 'green', icon: 'check' },
  failed: { label: 'Transaksi gagal', kind: 'red', icon: 'info' },
};

// Normalisasi error wallet/ethers menjadi pesan yang ramah pengguna Indonesia.
export function describeTxError(err) {
  const code = err?.code ?? err?.info?.error?.code;
  if (code === 4001 || code === 'ACTION_REJECTED') {
    return 'Permintaan di wallet dibatalkan. Kamu dapat mencoba lagi.';
  }
  if (code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(err?.message ?? '')) {
    return 'Saldo ETH tidak cukup untuk membayar tiket dan biaya jaringan.';
  }
  if (err?.reason) return err.reason;
  if (err?.shortMessage) return err.shortMessage;
  return err?.message ?? 'Transaksi belum berhasil. Coba ulang.';
}

// Jalankan satu transaksi dengan pelacakan status lewat callback onState.
// sendTx() harus mengembalikan objek transaksi ethers (punya .wait() & .hash).
// Mengembalikan receipt bila sukses, melempar error bila gagal/dibatalkan.
export async function runTransaction(sendTx, { onState = () => {} } = {}) {
  onState({ state: 'approving', ...TX_STATES.approving });
  let tx;
  try {
    tx = await sendTx();
  } catch (err) {
    onState({ state: 'failed', ...TX_STATES.failed, message: describeTxError(err) });
    throw err;
  }
  onState({ state: 'pending', ...TX_STATES.pending, hash: tx?.hash });
  try {
    const receipt = await tx.wait();
    if (receipt && receipt.status === 0) {
      const err = Error('Transaksi ditolak oleh kontrak (reverted).');
      onState({ state: 'failed', ...TX_STATES.failed, message: err.message, hash: tx?.hash });
      throw err;
    }
    onState({ state: 'success', ...TX_STATES.success, hash: tx?.hash, receipt });
    return receipt;
  } catch (err) {
    onState({ state: 'failed', ...TX_STATES.failed, message: describeTxError(err), hash: tx?.hash });
    throw err;
  }
}

const EXPLORER = 'https://sepolia.etherscan.io/tx/';

// Komponen panel status yang bisa di-update in-place saat state berubah.
export function createTxStatusPanel() {
  const row = el('div', { class: 'tx-status', 'data-testid': 'tx-status', role: 'status', 'aria-live': 'polite' });
  const symbol = el('span', { class: 'tx-status-icon' });
  const label = el('strong', { class: 'tx-status-label' });
  const detail = el('p', { class: 'tx-status-detail' });
  const linkWrap = el('div', { class: 'tx-status-link' });
  row.append(symbol, el('div', {}, label, detail, linkWrap));

  function render({ state, label: text, icon: iconName, message, hash }) {
    row.className = `tx-status tx-${state}`;
    row.dataset.state = state;
    symbol.replaceChildren(icon(iconName ?? 'info', 20));
    label.textContent = text ?? '';
    detail.textContent =
      message ??
      (state === 'approving'
        ? 'Konfirmasi permintaan pada ekstensi wallet kamu.'
        : state === 'pending'
          ? 'Transaksi dikirim. Menunggu blok konfirmasi di Sepolia.'
          : '');
    linkWrap.replaceChildren();
    if (hash) {
      linkWrap.append(
        el(
          'a',
          { href: `${EXPLORER}${hash}`, target: '_blank', rel: 'noopener noreferrer', class: 'btn btn-text' },
          icon('external', 15),
          'Lihat di Etherscan',
        ),
      );
    }
  }

  return { node: row, update: render };
}

// Bungkus runTransaction dengan tampilan modal status lengkap.
// openModal & onDone disuntik agar modul ini tidak terikat ke main.js.
export async function runTransactionWithModal(
  sendTx,
  { openModal, title = 'Mengirim transaksi', onSuccess, successView } = {},
) {
  const panel = createTxStatusPanel();
  const retryWrap = el('div', { class: 'tx-status-actions' });
  const body = el('div', { class: 'tx-modal-body' }, panel.node, retryWrap);
  openModal?.(title, body);

  try {
    const receipt = await runTransaction(sendTx, { onState: panel.update });
    if (successView) {
      body.replaceChildren(successView(receipt));
    }
    onSuccess?.(receipt);
    return receipt;
  } catch (err) {
    retryWrap.replaceChildren(
      button('Tutup', () => document.getElementById('modal')?.close(), { kind: 'outline' }),
    );
    throw err;
  }
}
