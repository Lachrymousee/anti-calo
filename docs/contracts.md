# Kontrak TicketNFT

| Item | Nilai |
| --- | --- |
| Source / interface | `blockchain/contracts/TicketNFT.sol`, `ITicketNFT.sol` |
| ABI | `shared/abi/TicketNFT.json`; perbarui dengan `cd blockchain; npm run export-abi` |
| Compiler | Solidity 0.8.28, optimizer 200, EVM Cancun |
| Library | OpenZeppelin 5.6.1 |
| Nama/simbol | `anti-calo Ticket` / `ACT` |
| Sepolia | `0x093c1D62871Ecd9b2927155Dfee71a3e87A1cD14` |

Alamat dan transaksi deployment ada di [manifest](../shared/deployments/sepolia.json).

## Aturan inti

- Harga dalam wei; waktu Unix detik. `eventId` dan `tokenId` dimulai dari 1.
- Tiket tidak mendukung transfer ERC-721 atau approval langsung. Resale hanya melalui Marketplace ber-role `MARKETPLACE_ROLE`.
- Pembelian primer memakai pembayaran tepat. Pendapatan disimpan per event; Organizer menarik setelah event, sedangkan refund dapat diklaim pemegang tiket.
- Pembatalan event adalah soft-delete. Detail/poster berada di backend dan dapat dikomitmenkan melalui `detailsHash`.
- Event canceled dan status tiket tetap dapat dibaca; `tokenURI` tidak disediakan.

## Role

| Role | Hak |
| --- | --- |
| `DEFAULT_ADMIN_ROLE` | Memberi/mencabut role, moderasi event, revoke tiket, dan mengatur checker. Tidak mengedit isi event atau menarik pendapatan Organizer. |
| `ORGANIZER_ROLE` | Membuat event; mengubah dan mengatur checker untuk event sendiri. |
| Gate Checker | Check-in tiket untuk event yang ditugaskan. |
| `MARKETPLACE_ROLE` | Memindahkan tiket resale dan mengirim fee resale. |
| Buyer | Wallet mana pun dapat membeli dan mengklaim refund yang berhak. |

Role global Organizer dan Admin dapat dimiliki wallet yang sama. Organizer yang role-nya dicabut tidak dapat mengelola event, tetapi tetap dapat menarik pendapatan sebagai pemilik event.

## Data event

`EventParams` untuk `createEvent`/`updateEvent` (urutan tuple penting):

| Field | Tipe | Batas |
| --- | --- | --- |
| `ticketPrice` | `uint256` | wei, > 0 |
| `maxSupply`, `maxPerWallet` | `uint32` | > 0; batas wallet maksimal 10 dan tidak lebih dari supply |
| `saleStart`, `saleEnd`, `eventTime` | `uint64` | `saleStart < saleEnd ≤ eventTime`; saat pembuatan `saleEnd` harus di masa depan |
| `resaleCapBps` | `uint16` | 10,000–15,000 (100–150%) |
| `detailsHash` | `bytes32` | komitmen detail off-chain atau nol |

`EventInfo` berisi Organizer, jadwal, status, supply/penjualan, batas wallet, harga, cap resale, dan hash detail. `TicketInfo` berisi event, status, dan harga awal. Enum: `EventStatus { Active, Canceled }`, `TicketStatus { Valid, Used, Revoked }`.

## Fungsi

| Fungsi | Akses | Perilaku |
| --- | --- | --- |
| `createEvent(p)` | Organizer | Membuat event dan mengembalikan ID. |
| `getEvent(id)`, `totalEvents()` | publik | Baca event dan jumlah event. |
| `updateEvent(id,p)` | Organizer pemilik | Semua field dikirim ulang; hanya sebelum event. Setelah ada penjualan, harga/supply/cap terkunci dan waktu hanya boleh diundur. |
| `cancelEvent(id)` | Organizer pemilik atau Admin | Batal sebelum event mulai. |
| `buyTicket(id,qty)` | publik | Tepat `ticketPrice × qty`; penjualan dalam `[saleStart, saleEnd)`, dibatasi supply dan pembelian primer per wallet. Token dicetak berurutan. |
| `getTicket(id)`, `purchasedCount(id,wallet)` | publik | Baca tiket dan jumlah pembelian primer. |
| `assignGateChecker` / `removeGateChecker` | Organizer pemilik atau Admin | Atur petugas per event. |
| `checkIn(eventId,tokenId)` | checker event | Menandai tiket valid sebagai `Used`; tidak ada pemeriksaan waktu atau QR on-chain. |
| `revokeTicket(tokenId)` | Organizer pemilik atau Admin | Revoke tiket valid sebelum event dan sisihkan refund harga awal. |
| `claimRefund(tokenId)` | pemegang saat ini | Refund tiket revoked atau tiket valid/used pada event canceled; membakar NFT. |
| `withdraw(eventId)` | Organizer event | Setelah event, tarik pendapatan primer dan fee resale. Jika canceled, hanya fee resale. |
| `eventBalances(id)` | publik | Baca saldo pendapatan dan fee. |

`maxPerWallet` hanya menghitung pembelian primer; tiket resale tidak menambah penghitung. Pembeli harus mengirim nilai ETH tepat. Refund selalu memakai harga primer, bukan harga resale.

## Integrasi Marketplace

| Fungsi | Akses | Perilaku |
| --- | --- | --- |
| `getResaleCap(tokenId)` | publik | `originalPrice × resaleCapBps / 10,000`, dibulatkan ke bawah. |
| `isTransferable(tokenId)` | publik | `true` hanya jika tiket valid, event aktif, dan belum dimulai; tidak revert. |
| `transferByMarketplace(from,to,id)` | Marketplace | Transfer internal; approval ERC-721 tidak digunakan. |
| `receiveResaleFee(eventId)` | Marketplace, payable | Menambah saldo fee Organizer. |

Admin harus memberikan `MARKETPLACE_ROLE` ke alamat Marketplace. Marketplace perlu memastikan kepemilikan dan cap, lalu memanggil fungsi transfer/fee. Periksa pemilik dengan `ownerOf`; event asal dengan `getTicket(tokenId).eventId`.

## Event dan integrasi frontend

Indexer memakai `EventCreated`, `EventUpdated`, `EventCanceled`, `TicketPurchased`, `TicketCheckedIn`, `TicketRevoked`, `RefundClaimed`, `GateCheckerAssigned/Removed`, `RevenueWithdrawn`, `ResaleFeeReceived`, ERC-721 `Transfer`, dan `RoleGranted/Revoked`.

Kesalahan utama: `InvalidEventParams(reason)` (1 harga, 2 supply, 3 batas wallet, 4 jadwal jual, 5 jadwal event, 6 cap resale), `EventNotFound`, `TicketNotFound`, `NotEventOrganizer`, `NotOrganizerOrAdmin`, `NotGateChecker`, `WrongEvent`, `FieldLocked`, `SaleNotOpen`, `SoldOut`, `WalletLimitExceeded`, `IncorrectPayment`, `TicketNotValid`, `WithdrawNotAllowed`, `RefundNotAllowed`, `TicketNotTransferable`, `TransferNotAllowed`, `ApprovalsDisabled`, dan `EthTransferFailed`.

Di ethers v6, panggil getter kontrak `getEvent` dengan `contract.getFunction("getEvent")(id)` karena nama bertabrakan dengan API filter event ethers. Untuk struct, kirim objek bernama. Error dapat di-decode dengan `contract.interface.parseError(err.data)`.

EIP-712 QR di frontend hanya diverifikasi off-chain; kontrak `checkIn` tidak memeriksa signature, expiry, atau nonce. Check-in produksi perlu verifikasi dan konsumsi bukti secara atomik.

## Tes dan risiko

```powershell
cd blockchain
npm ci
npm test
npm run coverage
```
k
