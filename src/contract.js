// Lapisan integrasi kontrak anti-calo — disesuaikan dengan ABI FINAL tim.
//
// ABI diambil dari shared/abi/TicketNFT.json dan shared/abi/Marketplace.json
// (hasil export-abi.js Hardhat). Fungsi di sini adalah satu-satunya tempat
// nama fungsi on-chain dikodekan — UI tidak perlu tahu detailnya.
//
// Dua kontrak terpisah:
//   TicketNFT  — event, tiket ERC-721, role, check-in
//   Marketplace — listing resale, beli, withdraw proceeds
//
// Konfigurasi alamat disimpan di localStorage agar mudah diganti saat deploy.

import {
  BrowserProvider,
  Contract,
  getAddress,
  formatEther,
  parseEther,
  ZeroAddress,
} from 'ethers';
import { CHAIN_ID, sameAddress } from './model.js';
import { normalizeContract, normalizeUint256 } from './chain.js';

// ABI diinport dari src/abis.js (plain JS module) agar kompatibel dengan
// Node.js v22+ test runner (tidak perlu "type: json" import attribute) DAN Vite.
// File abis.js di-generate dari shared/abi/*.json via: node scripts/gen-abis.js
import { TICKET_NFT_ABI, MARKETPLACE_ABI } from './abis.js';

export { TICKET_NFT_ABI, MARKETPLACE_ABI };

// ----- Status mapping (sesuai ITicketNFT.sol) --------------------------------
// enum EventStatus  { Active, Canceled }
// enum TicketStatus { Valid, Used, Revoked }

export const EVENT_STATUS = ['active', 'canceled'];
export const TICKET_STATUS = ['valid', 'used', 'revoked'];

export function statusFromCode(list, code, fallback = 'unknown') {
  const n = Number(code);
  return list[n] ?? fallback;
}

// ----- Konfigurasi alamat kontrak -------------------------------------------

export const STORAGE_KEY_NFT = 'anticalo-contract-nft-v1';
export const STORAGE_KEY_MKT = 'anticalo-contract-marketplace-v1';

function safeStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

function readAddr(key, envKey, storage = safeStorage()) {
  const fromEnv = import.meta.env?.[envKey] ?? '';
  let value = fromEnv;
  try {
    const stored = storage?.getItem(key);
    if (stored) value = stored;
  } catch { /* noop */ }
  if (!value?.trim()) return null;
  try { return normalizeContract(value); } catch { return null; }
}

export function configuredNftContract(storage = safeStorage()) {
  return readAddr(STORAGE_KEY_NFT, 'VITE_NFT_CONTRACT', storage);
}
export function configuredMarketplaceContract(storage = safeStorage()) {
  return readAddr(STORAGE_KEY_MKT, 'VITE_MARKETPLACE_CONTRACT', storage);
}
export function setNftContract(address, storage = safeStorage()) {
  const a = normalizeContract(address);
  try { storage?.setItem(STORAGE_KEY_NFT, a); } catch { /* noop */ }
  return a;
}
export function setMarketplaceContract(address, storage = safeStorage()) {
  const a = normalizeContract(address);
  try { storage?.setItem(STORAGE_KEY_MKT, a); } catch { /* noop */ }
  return a;
}

// Alias backward-compat untuk main.js yang masih memakai isLiveMode / configuredContract
export const APP_CONTRACT_KEY = STORAGE_KEY_NFT;
export function configuredContract(storage = safeStorage()) {
  return configuredNftContract(storage);
}
export function setConfiguredContract(address, storage = safeStorage()) {
  return setNftContract(address, storage);
}
export function isLiveMode(storage = safeStorage()) {
  return configuredNftContract(storage) !== null;
}

// ----- Helpers provider/signer ----------------------------------------------

function injectedProvider(injected) {
  if (!injected?.request) {
    throw Error('MetaMask belum ditemukan. Pasang ekstensi wallet untuk transaksi on-chain.');
  }
  return new BrowserProvider(injected, 'any', { cacheTimeout: -1 });
}

async function requireSepolia(injected) {
  if (!injected?.request) throw Error('MetaMask belum ditemukan.');
  const chainId = Number(await injected.request({ method: 'eth_chainId' }));
  if (chainId !== CHAIN_ID) {
    throw Error('Pindahkan wallet ke Ethereum Sepolia sebelum mengirim transaksi.');
  }
  return chainId;
}

async function readNft({ nftAddress, injected = globalThis.window?.ethereum }) {
  const address = normalizeContract(nftAddress);
  await requireSepolia(injected);
  const provider = injectedProvider(injected);
  const code = await provider.getCode(address);
  if (code === '0x') {
    provider.destroy();
    throw Error('Tidak ada kontrak TicketNFT pada alamat ini di Sepolia.');
  }
  return { nft: new Contract(address, TICKET_NFT_ABI, provider), provider, address };
}

async function readMarket({ marketAddress, injected = globalThis.window?.ethereum }) {
  const address = normalizeContract(marketAddress);
  await requireSepolia(injected);
  const provider = injectedProvider(injected);
  const code = await provider.getCode(address);
  if (code === '0x') {
    provider.destroy();
    throw Error('Tidak ada kontrak Marketplace pada alamat ini di Sepolia.');
  }
  return { market: new Contract(address, MARKETPLACE_ABI, provider), provider, address };
}

async function writeNft({ nftAddress, injected = globalThis.window?.ethereum }) {
  const address = normalizeContract(nftAddress);
  await requireSepolia(injected);
  const provider = injectedProvider(injected);
  const signer = await provider.getSigner();
  return { nft: new Contract(address, TICKET_NFT_ABI, signer), provider, signer, address };
}

async function writeMarket({ marketAddress, injected = globalThis.window?.ethereum }) {
  const address = normalizeContract(marketAddress);
  await requireSepolia(injected);
  const provider = injectedProvider(injected);
  const signer = await provider.getSigner();
  return { market: new Contract(address, MARKETPLACE_ABI, signer), provider, signer, address };
}

// ----- READ: event list (TicketNFT) -----------------------------------------
//
// TicketNFT tidak menyimpan array event — ID dimulai dari 1 dan bertambah.
// totalEvents() memberikan jumlah event yang sudah dibuat.
// getEvent(eventId) mengembalikan EventInfo struct.

export async function readEvents({ nftAddress, injected = globalThis.window?.ethereum } = {}) {
  const addr = nftAddress ?? configuredNftContract();
  if (!addr) return [];
  const { nft, provider } = await readNft({ nftAddress: addr, injected });
  try {
    const total = Number(await nft.totalEvents());
    const events = [];
    for (let id = 1; id <= total; id++) {
      try {
        const ev = await nft.getEvent(id);
        events.push(normalizeEvent(id, ev));
      } catch { /* event tidak ada, skip */ }
    }
    return events;
  } finally {
    provider.destroy();
  }
}

export async function readEvent({ eventId, nftAddress, injected = globalThis.window?.ethereum }) {
  const addr = nftAddress ?? configuredNftContract();
  if (!addr) return null;
  const { nft, provider } = await readNft({ nftAddress: addr, injected });
  try {
    const ev = await nft.getEvent(normalizeUint256(eventId, 'Event ID'));
    return normalizeEvent(Number(eventId), ev);
  } finally {
    provider.destroy();
  }
}

function normalizeEvent(id, raw) {
  // EventInfo struct: organizer, saleStart, resaleCapBps, status, saleEnd, eventTime,
  //                   maxSupply, sold, maxPerWallet, ticketPrice, detailsHash
  return {
    id: String(id),
    organizer: getAddress(raw.organizer),
    ticketPrice: formatEther(raw.ticketPrice),        // ETH string
    ticketPriceWei: raw.ticketPrice.toString(),
    maxSupply: Number(raw.maxSupply),
    sold: Number(raw.sold),
    maxPerWallet: Number(raw.maxPerWallet),
    saleStart: Number(raw.saleStart),                 // unix timestamp
    saleEnd: Number(raw.saleEnd),
    eventTime: Number(raw.eventTime),
    resaleCapBps: Number(raw.resaleCapBps),           // e.g. 11000 = 110%
    detailsHash: raw.detailsHash,
    status: statusFromCode(EVENT_STATUS, raw.status, 'active'),
  };
}

// ----- READ: tiket milik wallet (TicketNFT) ---------------------------------
//
// TicketNFT tidak mempunyai tokenOfOwnerByIndex (bukan ERC721Enumerable).
// Strategi: query event Transfer dari address → address (mint = from ZeroAddress)
// lalu filter kepemilikan saat ini dengan ownerOf.

export async function readOwnedTickets({ owner, nftAddress, marketAddress, injected = globalThis.window?.ethereum }) {
  const nftAddr = nftAddress ?? configuredNftContract();
  if (!nftAddr) return [];
  const wallet = getAddress(owner);
  const { nft, provider } = await readNft({ nftAddress: nftAddr, injected });
  try {
    // Ambil semua token yang pernah ditransfer ke wallet (termasuk pembelian primer)
    const transferFilter = nft.filters.Transfer(null, wallet);
    const logs = await nft.queryFilter(transferFilter, 0, 'latest');
    const candidateIds = [...new Set(logs.map((l) => l.args.tokenId.toString()))];

    const mktAddr = marketAddress ?? configuredMarketplaceContract();
    let market = null;
    if (mktAddr) {
      try {
        const provider2 = injectedProvider(injected);
        market = new Contract(mktAddr, MARKETPLACE_ABI, provider2);
      } catch { /* marketplace belum dikonfigurasi */ }
    }

    const tickets = [];
    for (const tokenId of candidateIds) {
      try {
        const currentOwner = await nft.ownerOf(tokenId);
        if (!sameAddress(currentOwner, wallet)) continue; // sudah berpindah tangan

        const ticketInfo = await nft.getTicket(tokenId);
        const isTransferable = await nft.isTransferable(tokenId).catch(() => false);

        let listing = null;
        if (market) {
          try {
            listing = await market.getListing(tokenId);
          } catch { /* belum listed */ }
        }

        const isListed = listing && listing.seller !== ZeroAddress;

        tickets.push({
          id: tokenId,
          eventId: ticketInfo.eventId.toString(),
          owner: wallet,
          originalPrice: formatEther(ticketInfo.originalPrice),
          originalPriceWei: ticketInfo.originalPrice.toString(),
          status: isListed
            ? 'listed'
            : statusFromCode(TICKET_STATUS, ticketInfo.status, 'valid'),
          isTransferable,
          resalePrice: isListed ? formatEther(listing.price) : undefined,
          resaleSeller: isListed ? getAddress(listing.seller) : undefined,
        });
      } catch { /* token tidak ada atau dibakar, skip */ }
    }
    return tickets;
  } finally {
    provider.destroy();
  }
}

export async function readTicket({ tokenId, nftAddress, injected = globalThis.window?.ethereum }) {
  const addr = nftAddress ?? configuredNftContract();
  if (!addr) return null;
  const { nft, provider } = await readNft({ nftAddress: addr, injected });
  try {
    const id = normalizeUint256(tokenId, 'Token ID');
    const [info, owner, transferable] = await Promise.all([
      nft.getTicket(id),
      nft.ownerOf(id),
      nft.isTransferable(id).catch(() => false),
    ]);
    return {
      id: id.toString(),
      eventId: info.eventId.toString(),
      owner: getAddress(owner),
      originalPrice: formatEther(info.originalPrice),
      originalPriceWei: info.originalPrice.toString(),
      status: statusFromCode(TICKET_STATUS, info.status, 'valid'),
      isTransferable: transferable,
    };
  } finally {
    provider.destroy();
  }
}

// ----- READ: resale listings (Marketplace) ----------------------------------

export async function readResaleListings({ tokenIds = [], marketAddress, injected = globalThis.window?.ethereum }) {
  const addr = marketAddress ?? configuredMarketplaceContract();
  if (!addr) return [];
  const { market, provider } = await readMarket({ marketAddress: addr, injected });
  try {
    const out = [];
    for (const raw of tokenIds) {
      const tokenId = normalizeUint256(raw, 'Token ID');
      try {
        const listing = await market.getListing(tokenId);
        if (listing.seller !== ZeroAddress) {
          out.push({
            tokenId: tokenId.toString(),
            seller: getAddress(listing.seller),
            price: formatEther(listing.price),
            priceWei: listing.price.toString(),
          });
        }
      } catch { /* tidak listed */ }
    }
    return out;
  } finally {
    provider.destroy();
  }
}

// Baca semua listing aktif dari event Listed di Marketplace
export async function readAllResaleListings({ marketAddress, nftAddress, injected = globalThis.window?.ethereum } = {}) {
  const mktAddr = marketAddress ?? configuredMarketplaceContract();
  const nftAddr = nftAddress ?? configuredNftContract();
  if (!mktAddr) return [];

  const { market, provider } = await readMarket({ marketAddress: mktAddr, injected });
  try {
    const listedFilter = market.filters.Listed();
    const logs = await market.queryFilter(listedFilter, 0, 'latest');
    const candidateIds = [...new Set(logs.map((l) => l.args.tokenId.toString()))];

    const listings = [];
    for (const tokenId of candidateIds) {
      try {
        const listing = await market.getListing(tokenId);
        if (listing.seller === ZeroAddress) continue; // sudah dibeli/dibatalkan

        const entry = {
          tokenId,
          seller: getAddress(listing.seller),
          price: formatEther(listing.price),
          priceWei: listing.price.toString(),
          eventId: undefined,
        };

        // Coba ambil eventId dari TicketNFT
        if (nftAddr) {
          try {
            const provider2 = injectedProvider(injected);
            const nft = new Contract(nftAddr, TICKET_NFT_ABI, provider2);
            const info = await nft.getTicket(tokenId);
            entry.eventId = info.eventId.toString();
            provider2.destroy();
          } catch { /* noop */ }
        }

        listings.push(entry);
      } catch { /* skip */ }
    }
    return listings;
  } finally {
    provider.destroy();
  }
}

// ----- READ: allowance beli per wallet (TicketNFT) --------------------------

export async function purchaseAllowance({ eventId, wallet, nftAddress, injected = globalThis.window?.ethereum }) {
  const addr = nftAddress ?? configuredNftContract();
  if (!addr) return { max: 0, used: 0, allowed: true };
  const { nft, provider } = await readNft({ nftAddress: addr, injected });
  try {
    const id = normalizeUint256(eventId, 'Event ID');
    const walletAddr = getAddress(wallet);
    const [maxRaw, usedRaw] = await Promise.all([
      nft.MAX_PER_WALLET().catch(() => 0n),
      nft.purchasedCount(id, walletAddr).catch(() => 0n),
    ]);
    const max = Number(maxRaw);
    const used = Number(usedRaw);
    return { max, used, allowed: max === 0 || used < max };
  } finally {
    provider.destroy();
  }
}

// ----- READ: resale cap untuk sebuah tiket ----------------------------------

export async function readResaleCap({ tokenId, nftAddress, injected = globalThis.window?.ethereum }) {
  const addr = nftAddress ?? configuredNftContract();
  if (!addr) return null;
  const { nft, provider } = await readNft({ nftAddress: addr, injected });
  try {
    const cap = await nft.getResaleCap(normalizeUint256(tokenId, 'Token ID'));
    return { capWei: cap.toString(), capEth: formatEther(cap) };
  } finally {
    provider.destroy();
  }
}

// ----- READ: pending proceeds seller (Marketplace) --------------------------

export async function readPendingProceeds({ seller, marketAddress, injected = globalThis.window?.ethereum }) {
  const addr = marketAddress ?? configuredMarketplaceContract();
  if (!addr) return '0';
  const { market, provider } = await readMarket({ marketAddress: addr, injected });
  try {
    const amount = await market.pendingProceeds(getAddress(seller));
    return formatEther(amount);
  } finally {
    provider.destroy();
  }
}

// ----- WRITE: beli tiket primer (TicketNFT.buyTicket) -----------------------
//
// buyTicket(eventId, qty) payable — qty biasanya 1 untuk anti-calo.

export async function buyTicketTx({ nftAddress, eventId, priceEth, qty = 1, injected = globalThis.window?.ethereum }) {
  const addr = nftAddress ?? configuredNftContract();
  if (!addr) throw Error('Alamat kontrak TicketNFT belum dikonfigurasi.');
  const id = normalizeUint256(eventId, 'Event ID');
  const value = parseEther(String(priceEth)) * BigInt(qty);
  const { nft } = await writeNft({ nftAddress: addr, injected });
  return nft.buyTicket(id, qty, { value });
}

// ----- WRITE: list tiket resale (Marketplace.listTicket) --------------------
//
// listTicket(tokenId, price) nonpayable
// Harga harus <= resaleCap (ditegakkan kontrak, dicek juga di sini).

export async function listResaleTx({ marketAddress, tokenId, priceEth, capEth, injected = globalThis.window?.ethereum }) {
  const addr = marketAddress ?? configuredMarketplaceContract();
  if (!addr) throw Error('Alamat kontrak Marketplace belum dikonfigurasi.');
  const id = normalizeUint256(tokenId, 'Token ID');
  const price = parseEther(String(priceEth));
  if (price <= 0n) throw Error('Harga resale harus lebih dari 0 ETH.');
  if (capEth != null && price > parseEther(String(capEth))) {
    throw Error(`Harga resale tidak boleh melebihi batas ${capEth} ETH (aturan anti-calo).`);
  }
  const { market } = await writeMarket({ marketAddress: addr, injected });
  return market.listTicket(id, price);
}

// ----- WRITE: cancel listing resale (Marketplace.cancelListing) -------------

export async function cancelResaleTx({ marketAddress, tokenId, injected = globalThis.window?.ethereum }) {
  const addr = marketAddress ?? configuredMarketplaceContract();
  if (!addr) throw Error('Alamat kontrak Marketplace belum dikonfigurasi.');
  const id = normalizeUint256(tokenId, 'Token ID');
  const { market } = await writeMarket({ marketAddress: addr, injected });
  return market.cancelListing(id);
}

// ----- WRITE: beli tiket resale (Marketplace.buyListing) -------------------

export async function buyResaleTx({ marketAddress, tokenId, priceEth, injected = globalThis.window?.ethereum }) {
  const addr = marketAddress ?? configuredMarketplaceContract();
  if (!addr) throw Error('Alamat kontrak Marketplace belum dikonfigurasi.');
  const id = normalizeUint256(tokenId, 'Token ID');
  const value = parseEther(String(priceEth));
  const { market } = await writeMarket({ marketAddress: addr, injected });
  return market.buyListing(id, { value });
}

// ----- WRITE: withdraw proceeds penjual (Marketplace.withdrawProceeds) ------

export async function withdrawProceedsTx({ marketAddress, injected = globalThis.window?.ethereum }) {
  const addr = marketAddress ?? configuredMarketplaceContract();
  if (!addr) throw Error('Alamat kontrak Marketplace belum dikonfigurasi.');
  const { market } = await writeMarket({ marketAddress: addr, injected });
  return market.withdrawProceeds();
}

// ----- Re-export helpers ----------------------------------------------------
export { sameAddress, ZeroAddress };
