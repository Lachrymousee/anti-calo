import { keccak256, toUtf8Bytes, Wallet } from 'ethers';
import { loadInterface } from '../../src/indexer/decode.js';
import { ADMIN_ROLE } from '../../src/indexer/handlers.js';
import { ORGANIZER_ROLE } from '../../src/api/auth.js';

export const ticketIface = loadInterface('TicketNFT');
export const marketIface = loadInterface('Marketplace');
export const TICKET = '0x00000000000000000000000000000000000000a1';
export const MARKET = '0x00000000000000000000000000000000000000b2';
export const interfaces = { [TICKET]: ticketIface, [MARKET]: marketIface };
export { ADMIN_ROLE, ORGANIZER_ROLE };

export const wallets = {
  admin: Wallet.createRandom(), organizer: Wallet.createRandom(), other: Wallet.createRandom(),
  buyer: Wallet.createRandom(), buyer2: Wallet.createRandom(), gate: Wallet.createRandom(),
};
export const addr = (k) => wallets[k].address.toLowerCase();

// Provider tiruan: menyimpan log per blok dan meniru reorg lewat "fork".
export class FakeChain {
  constructor() { this.logs = []; this.head = 0; this.fork = 0; this.counter = 0; }
  hashFor(n) { return keccak256(toUtf8Bytes(`block:${n}:fork:${this.fork}`)); }
  emit(address, name, values, block) {
    const iface = interfaces[address];
    const { topics, data } = iface.encodeEventLog(iface.getEvent(name), values);
    this.counter += 1;
    this.logs.push({ address, topics, data, blockNumber: block, index: this.counter,
      transactionHash: keccak256(toUtf8Bytes(`tx:${this.counter}:${this.fork}`)), removed: false });
    this.head = Math.max(this.head, block);
  }
  reorgFrom(block) { this.fork += 1; this.logs = this.logs.filter((l) => l.blockNumber < block); }
  async getBlockNumber() { return this.head; }
  async getBlock(n) { return n > this.head ? null : { number: n, hash: this.hashFor(n) }; }
  async getLogs({ address, fromBlock, toBlock }) {
    const set = new Set([].concat(address).map((a) => a.toLowerCase()));
    return this.logs.filter((l) => set.has(l.address) && l.blockNumber >= fromBlock && l.blockNumber <= toBlock)
      .map((l) => ({ ...l, blockHash: this.hashFor(l.blockNumber) }));
  }
}

export const params = (over = {}) => ({ ticketPrice: 1000n, maxSupply: 100n, maxPerWallet: 4n, saleStart: 1000n,
  saleEnd: 2000n, eventTime: 3000n, resaleCapBps: 11000n, detailsHash: `0x${'00'.repeat(32)}`, ...over });
const P = (p) => [p.ticketPrice, p.maxSupply, p.maxPerWallet, p.saleStart, p.saleEnd, p.eventTime, p.resaleCapBps, p.detailsHash];

export const emit = {
  admin: (c, b) => c.emit(TICKET, 'RoleGranted', [ADMIN_ROLE, wallets.admin.address, wallets.admin.address], b),
  organizerRole: (c, b) => c.emit(TICKET, 'RoleGranted', [ORGANIZER_ROLE, wallets.organizer.address, wallets.admin.address], b),
  eventCreated: (c, b, id = 1n, p = params()) => c.emit(TICKET, 'EventCreated', [id, wallets.organizer.address, P(p)], b),
  purchased: (c, b, id, first, qty, buyer = 'buyer') => c.emit(TICKET, 'TicketPurchased', [id, wallets[buyer].address, first, qty, 1000n * qty], b),
  assigned: (c, b, id = 1n) => c.emit(TICKET, 'GateCheckerAssigned', [id, wallets.gate.address, wallets.organizer.address], b),
  checkedIn: (c, b, token, id = 1n) => c.emit(TICKET, 'TicketCheckedIn', [token, id, wallets.gate.address, wallets.buyer.address], b),
  listed: (c, b, token, price, id = 1n, seller = 'buyer') => c.emit(MARKET, 'Listed', [token, id, wallets[seller].address, price], b),
  sold: (c, b, token, price, fee, id = 1n, buyer = 'buyer2', seller = 'buyer') =>
    c.emit(MARKET, 'Sold', [token, id, wallets[buyer].address, wallets[seller].address, price, fee], b),
};
