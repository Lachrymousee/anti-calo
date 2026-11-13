import { BrowserProvider, Contract, Interface, parseEther, formatEther, isAddress, getAddress, id as keccakId, ZeroAddress } from 'ethers';
import ticketJson from '../shared/abi/TicketNFT.json' with { type: 'json' };
import marketJson from '../shared/abi/Marketplace.json' with { type: 'json' };

// Transaksi ke TicketNFT dan Marketplace lewat wallet. Setiap transaksi disimulasikan lebih dulu (staticCall)
// agar penolakan kontrak muncul sebagai pesan yang jelas sebelum wallet meminta persetujuan.
export const TICKET_IFACE = new Interface(ticketJson.abi);
export const MARKET_IFACE = new Interface(marketJson.abi);
export const ORGANIZER_ROLE = keccakId('ORGANIZER_ROLE');
export const ZERO_HASH = `0x${'00'.repeat(32)}`;

const REASONS = {
  1: 'Harga tiket harus lebih dari 0.',
  2: 'Kapasitas tidak valid: harus lebih dari 0 dan tidak kurang dari tiket yang sudah terjual.',
  3: 'Batas tiket per wallet harus 1–10 dan tidak boleh melebihi kapasitas.',
  4: 'Jendela penjualan tidak valid: mulai harus sebelum selesai, dan selesai harus di masa depan.',
  5: 'Penjualan harus berakhir sebelum atau tepat saat event dimulai.',
  6: 'Batas harga resale harus antara 100% dan 150%.',
};
const eth = (wei) => formatEther(wei);
const ERRORS = {
  AccessControlUnauthorizedAccount: () => 'Wallet ini tidak memiliki role yang dibutuhkan untuk tindakan tersebut.',
  ApprovalsDisabled: () => 'Approval dinonaktifkan. Tiket hanya dapat dipindahkan lewat marketplace.',
  TransferNotAllowed: () => 'Tiket hanya dapat dipindahkan lewat marketplace resale.',
  EventAlreadyStarted: () => 'Event sudah dimulai.',
  EventNotActive: () => 'Event tidak aktif (sudah dibatalkan).',
  EventNotFound: ([id]) => `Event #${id} tidak ditemukan di kontrak.`,
  FieldLocked: () => 'Setelah ada tiket terjual, harga, kapasitas, batas resale, dan waktu event tidak boleh diubah.',
  GateCheckerAlreadyAssigned: () => 'Alamat ini sudah menjadi Gate Checker untuk event tersebut.',
  GateCheckerNotAssigned: () => 'Alamat ini bukan Gate Checker untuk event tersebut.',
  IncorrectPayment: ([expected]) => `Jumlah pembayaran tidak sesuai. Dibutuhkan ${eth(expected)} ETH.`,
  InvalidEventParams: ([reason]) => REASONS[Number(reason)] ?? `Parameter event tidak valid (kode ${reason}).`,
  InvalidQuantity: () => 'Jumlah tiket tidak valid.',
  NotEventOrganizer: () => 'Hanya organizer pemilik event ini yang dapat melakukan tindakan tersebut.',
  NotGateChecker: () => 'Wallet ini bukan Gate Checker untuk event tersebut.',
  NotOrganizerOrAdmin: () => 'Hanya organizer pemilik event atau Admin yang dapat melakukan tindakan tersebut.',
  NotTicketHolder: () => 'Wallet ini bukan pemilik tiket tersebut.',
  NothingToWithdraw: () => 'Tidak ada dana yang dapat ditarik.',
  RefundNotAllowed: () => 'Refund hanya untuk tiket yang dicabut atau untuk event yang dibatalkan.',
  SaleNotOpen: () => 'Penjualan belum dibuka atau sudah ditutup.',
  SoldOut: () => 'Tiket sudah habis.',
  TicketNotFound: ([id]) => `Tiket #${id} tidak ditemukan di kontrak.`,
  TicketNotTransferable: () => 'Tiket ini tidak dapat dipindahkan (sudah dipakai, dicabut, atau event tidak aktif).',
  TicketNotValid: () => 'Tiket tidak valid (sudah dipakai atau dicabut).',
  WalletLimitExceeded: () => 'Pembelian melebihi batas per wallet untuk event ini.',
  WithdrawNotAllowed: () => 'Dana event baru dapat ditarik setelah event dimulai atau dibatalkan.',
  WrongEvent: () => 'Tiket ini bukan untuk event tersebut.',
  ZeroAddress: () => 'Alamat tidak boleh kosong.',
  ZeroValue: () => 'Nilai tidak boleh nol.',
  AlreadyListed: () => 'Tiket ini sudah dilisting.',
  CannotBuyOwnListing: () => 'Kamu tidak dapat membeli listing milikmu sendiri.',
  NotListed: () => 'Tiket ini tidak sedang dijual.',
  NotSeller: () => 'Hanya penjual yang dapat membatalkan listing ini.',
  PriceAboveCap: ([, price, cap]) => `Harga resale ${eth(price)} ETH melebihi batas ${eth(cap)} ETH.`,
  StaleListing: () => 'Listing sudah tidak berlaku (tiket tidak valid atau event dibatalkan).',
  ZeroPrice: () => 'Harga harus lebih dari 0.',
  NoProceeds: () => 'Tidak ada hasil penjualan yang dapat ditarik.',
  EthTransferFailed: () => 'Pengiriman ETH gagal.',
  ReentrancyGuardReentrantCall: () => 'Panggilan ditolak oleh perlindungan reentrancy.',
};

export class OnchainError extends Error {
  constructor(message, cause) { super(message); this.name = 'OnchainError'; this.cause = cause; }
}

function revertData(err) {
  for (const c of [err?.data, err?.error?.data, err?.info?.error?.data, err?.info?.error?.error?.data]) if (typeof c === 'string' && c.startsWith('0x') && c.length >= 10) return c;
  return null;
}

// Mengubah galat ethers/wallet menjadi pesan Indonesia yang dapat dipahami pengguna.
export function explainError(err) {
  if (err instanceof OnchainError) return err.message;
  const code = err?.code ?? err?.info?.error?.code;
  if (code === 'ACTION_REJECTED' || code === 4001) return 'Transaksi dibatalkan di wallet.';
  const data = revertData(err);
  if (data) for (const iface of [TICKET_IFACE, MARKET_IFACE]) {
    const parsed = iface.parseError(data);
    if (parsed && ERRORS[parsed.name]) return ERRORS[parsed.name](parsed.args);
  }
  if (code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(err?.message ?? '')) return 'Saldo ETH tidak cukup untuk harga dan biaya gas.';
  if (code === 'NETWORK_ERROR' || code === 'SERVER_ERROR') return 'Tidak dapat terhubung ke jaringan. Periksa RPC dan koneksi wallet.';
  return `Transaksi gagal: ${err?.shortMessage ?? err?.message ?? 'galat tidak diketahui'}.`;
}

export function parseEth(value, label = 'Harga') {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,18})?$/.test(text)) throw new OnchainError(`${label} harus berupa angka ETH, misalnya 0.01.`);
  const wei = parseEther(text);
  if (wei <= 0n) throw new OnchainError(`${label} harus lebih dari 0.`);
  return wei;
}

export function toUnix(local) {
  const ms = new Date(local).getTime();
  if (!local || Number.isNaN(ms)) throw new OnchainError('Tanggal dan waktu tidak valid.');
  return Math.floor(ms / 1000);
}

const wholeNumber = (value, label, min, max) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new OnchainError(`${label} harus berupa bilangan bulat ${min}–${max}.`);
  return n;
};
const addr = (value, label = 'Alamat') => {
  if (!isAddress(String(value ?? '').trim())) throw new OnchainError(`${label} bukan alamat wallet yang valid.`);
  return getAddress(String(value).trim());
};
const tokenArg = (value, label = 'ID') => {
  if (!/^\d{1,30}$/.test(String(value ?? '').trim())) throw new OnchainError(`${label} harus berupa angka.`);
  return BigInt(String(value).trim());
};

export const explorerTxUrl = (chainId, hash) => (Number(chainId) === 11155111 ? `https://sepolia.etherscan.io/tx/${hash}` : null);

export async function signerFor(injected = globalThis.window?.ethereum, address) {
  if (!injected?.request) throw Error('MetaMask belum ditemukan.');
  return new BrowserProvider(injected).getSigner(address);
}

export async function switchChain(chainId, injected = globalThis.window?.ethereum) {
  if (!injected?.request) throw Error('MetaMask belum ditemukan.');
  try { await injected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${Number(chainId).toString(16)}` }] }); }
  catch (err) {
    if (err?.code === 4902 || err?.code === -32603) throw Error(`Jaringan dengan Chain ID ${chainId} belum ada di wallet. Tambahkan dulu secara manual.`);
    throw err;
  }
}

// Menunggu indexer backend menyusul sampai blok transaksi (atau habis waktu). Mengembalikan true bila sudah menyusul.
export async function waitForIndexer(client, blockNumber, { timeoutMs = 60_000, intervalMs = 1_500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const s = await client.status();
    if (s.lastBlock !== null && s.lastBlock >= blockNumber) return true;
    if (Date.now() >= deadline) return false;
    await sleep(intervalMs);
  }
}

export function createOnchain({ signer, ticketAddress, marketplaceAddress, onStatus = () => {} }) {
  if (!isAddress(ticketAddress ?? '') || !isAddress(marketplaceAddress ?? '')) throw new OnchainError('Alamat kontrak belum dikonfigurasi di backend (TICKET_NFT_ADDRESS dan MARKETPLACE_ADDRESS).');
  const ticket = new Contract(ticketAddress, TICKET_IFACE, signer);
  const market = new Contract(marketplaceAddress, MARKET_IFACE, signer);

  async function send(contract, method, args = [], overrides = {}) {
    try {
      onStatus('Memeriksa transaksi…');
      await contract[method].staticCall(...args, overrides);
      onStatus('Menunggu persetujuan di wallet…');
      const tx = await contract[method](...args, overrides);
      onStatus(`Transaksi dikirim. Menunggu konfirmasi… (${tx.hash})`);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new OnchainError('Transaksi gagal di blockchain.');
      onStatus('Transaksi terkonfirmasi.');
      return { hash: tx.hash, blockNumber: receipt.blockNumber, receipt };
    } catch (err) { throw err instanceof OnchainError ? err : new OnchainError(explainError(err), err); }
  }
  // Kontrak punya fungsi getEvent(uint256) yang bentrok dengan Contract.getEvent bawaan ethers; panggil lewat getFunction.
  const getEventInfo = (id) => ticket.getFunction('getEvent')(id);
  const read = async (fn) => { try { return await fn(); } catch (err) { throw new OnchainError(explainError(err), err); } };

  const paramsFrom = (f) => ({
    ticketPrice: parseEth(f.priceEth, 'Harga tiket'), maxSupply: wholeNumber(f.maxSupply, 'Kapasitas', 1, 4_294_967_295),
    maxPerWallet: wholeNumber(f.maxPerWallet, 'Batas per wallet', 1, 10), saleStart: f.saleStart, saleEnd: f.saleEnd, eventTime: f.eventTime,
    resaleCapBps: wholeNumber(f.resaleCapBps, 'Batas resale (bps)', 10_000, 15_000), detailsHash: f.detailsHash ?? ZERO_HASH,
  });

  const actions = {
    async buyTicket(eventId, qty) {
      const id = tokenArg(eventId, 'ID event'), n = wholeNumber(qty, 'Jumlah tiket', 1, 10);
      const ev = await read(() => getEventInfo(id));
      return send(ticket, 'buyTicket', [id, n], { value: ev.ticketPrice * BigInt(n) });
    },
    async quoteResale(tokenId, priceEth) {
      const id = tokenArg(tokenId, 'ID tiket'), price = parseEth(priceEth, 'Harga resale');
      const [cap, quote] = await read(() => Promise.all([ticket.getResaleCap(id), market.quoteSale(price)]));
      return { capWei: cap, feeWei: quote.fee, sellerWei: quote.sellerAmount, withinCap: price <= cap };
    },
    listTicket: (tokenId, priceEth) => send(market, 'listTicket', [tokenArg(tokenId, 'ID tiket'), parseEth(priceEth, 'Harga resale')]),
    cancelListing: (tokenId) => send(market, 'cancelListing', [tokenArg(tokenId, 'ID tiket')]),
    async buyListing(tokenId) {
      const id = tokenArg(tokenId, 'ID tiket');
      const l = await read(() => market.getListing(id));
      if (l.seller === ZeroAddress) throw new OnchainError(ERRORS.NotListed());
      return send(market, 'buyListing', [id], { value: l.price });
    },
    claimRefund: (tokenId) => send(ticket, 'claimRefund', [tokenArg(tokenId, 'ID tiket')]),
    checkIn: (eventId, tokenId) => send(ticket, 'checkIn', [tokenArg(eventId, 'ID event'), tokenArg(tokenId, 'ID tiket')]),
    async createEvent(fields) {
      const result = await send(ticket, 'createEvent', [paramsFrom(fields)]);
      const log = result.receipt.logs.map((l) => { try { return TICKET_IFACE.parseLog(l); } catch { return null; } }).find((l) => l?.name === 'EventCreated');
      return { ...result, eventId: log ? String(log.args.eventId) : null };
    },
    async updateEventHash(eventId, detailsHash) {
      const id = tokenArg(eventId, 'ID event');
      if (!/^0x[0-9a-fA-F]{64}$/.test(detailsHash ?? '')) throw new OnchainError('detailsHash harus berupa 32 byte heksadesimal (0x…).');
      const ev = await read(() => getEventInfo(id));
      return send(ticket, 'updateEvent', [id, { ticketPrice: ev.ticketPrice, maxSupply: ev.maxSupply, maxPerWallet: ev.maxPerWallet, saleStart: ev.saleStart,
        saleEnd: ev.saleEnd, eventTime: ev.eventTime, resaleCapBps: ev.resaleCapBps, detailsHash }]);
    },
    cancelEvent: (eventId) => send(ticket, 'cancelEvent', [tokenArg(eventId, 'ID event')]),
    assignGateChecker: (eventId, checker) => send(ticket, 'assignGateChecker', [tokenArg(eventId, 'ID event'), addr(checker, 'Alamat Gate Checker')]),
    removeGateChecker: (eventId, checker) => send(ticket, 'removeGateChecker', [tokenArg(eventId, 'ID event'), addr(checker, 'Alamat Gate Checker')]),
    withdraw: (eventId) => send(ticket, 'withdraw', [tokenArg(eventId, 'ID event')]),
    withdrawProceeds: () => send(market, 'withdrawProceeds'),
    revokeTicket: (tokenId) => send(ticket, 'revokeTicket', [tokenArg(tokenId, 'ID tiket')]),
    grantOrganizer: (account) => send(ticket, 'grantRole', [ORGANIZER_ROLE, addr(account, 'Alamat organizer')]),
    revokeOrganizer: (account) => send(ticket, 'revokeRole', [ORGANIZER_ROLE, addr(account, 'Alamat organizer')]),
    async balances(eventId, account) {
      const id = tokenArg(eventId, 'ID event');
      const [b, proceeds] = await read(() => Promise.all([ticket.eventBalances(id), account ? market.pendingProceeds(account) : 0n]));
      return { revenueWei: b.revenue, resaleFeesWei: b.resaleFees, pendingProceedsWei: proceeds };
    },
  };
  // Semua aksi async: kesalahan validasi argumen selalu menjadi promise yang ditolak, bukan exception sinkron.
  return { ticket, market, ...Object.fromEntries(Object.entries(actions).map(([name, fn]) => [name, async (...args) => fn(...args)])) };
}
