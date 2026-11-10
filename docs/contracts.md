# Kontrak TicketNFT

Dokumen integrasi untuk anggota frontend, backend, indexer, dan marketplace. Penanggung jawab: Anggota 1 (Smart Contract Lead). Spesifikasi lengkap ada di `.kiro/specs/ticket-nft/`.

| Item | Nilai |
| --- | --- |
| Source | `blockchain/contracts/TicketNFT.sol`, interface `blockchain/contracts/ITicketNFT.sol` |
| ABI | `shared/abi/TicketNFT.json` (buat ulang: `cd blockchain` lalu `npm run export-abi`) |
| Compiler | Solidity `^0.8.24` (Hardhat memakai 0.8.28, optimizer 200, EVM `cancun`) |
| Library | OpenZeppelin Contracts `5.6.1` (ERC721, AccessControl, ReentrancyGuard) |
| Nama / simbol token | `anti-calo Ticket` / `ACT` |
| Alamat deployment Sepolia | Belum ada. Diisi Anggota 2 di `shared/deployments/` setelah deploy. |

## Ringkasan Aturan

- Semua harga dalam **wei** (integer). Semua waktu dalam **unix detik** (`block.timestamp`).
- `eventId` dan `tokenId` dimulai dari **1** dan berurutan. Satu pembelian `qty` tiket menghasilkan token berurutan `firstTokenId … firstTokenId + qty − 1`.
- Tiket **tidak bisa ditransfer langsung** (`transferFrom`/`safeTransferFrom` revert) dan **approval dimatikan** (`approve`/`setApprovalForAll` selalu revert). Satu-satunya jalur pindah tangan adalah `transferByMarketplace` dari kontrak marketplace.
- Pembayaran memakai pola **pull payment**: uang ditahan per event, organizer menarik dengan `withdraw` setelah `eventTime`, pembeli menarik refund dengan `claimRefund`.
- Hapus event = **soft delete** (`cancelEvent` mengubah status ke `Canceled`; data tetap bisa dibaca).
- Tidak ada `tokenURI` (string kosong). Detail event/poster diambil dari backend berdasarkan `eventId`. `detailsHash` (opsional) bisa diisi `keccak256` dari detail off-chain untuk cek integritas.

## Role

| Role | Konstanta | Diberikan oleh | Hak |
| --- | --- | --- | --- |
| Admin | `DEFAULT_ADMIN_ROLE` (`0x00…00`) | Constructor (`admin`) | Grant/revoke Organizer dan Marketplace, cancel event mana pun, revoke tiket, atur Gate Checker event mana pun. **Tidak** bisa edit isi event atau withdraw. |
| Organizer | `ORGANIZER_ROLE` = `keccak256("ORGANIZER_ROLE")` | Admin via `grantRole` | Membuat event dan mengelola **hanya event miliknya**. |
| Gate Checker | per event: `isGateChecker(eventId, addr)` | Organizer event tersebut atau Admin | Check-in tiket **hanya untuk event yang ditugaskan**. Tidak ada role global. |
| Marketplace | `MARKETPLACE_ROLE` = `keccak256("MARKETPLACE_ROLE")` | Admin via `grantRole` (diberikan ke alamat kontrak marketplace) | `transferByMarketplace`, `receiveResaleFee`. |
| Buyer | — | — | Wallet mana pun: beli tiket, claim refund. |

Catatan: satu wallet boleh punya lebih dari satu role di kontrak (aturan "satu role khusus" di demo frontend tidak ditegakkan on-chain). Organizer yang role-nya dicabut tidak bisa membuat/mengubah event atau mengatur Gate Checker, tetapi **tetap bisa `withdraw`** pendapatan event miliknya.

## Struktur Data

`EventParams` (input `createEvent`/`updateEvent`, urutan field penting untuk Remix):

| # | Field | Tipe | Aturan |
| --- | --- | --- | --- |
| 1 | `ticketPrice` | `uint256` | wei, > 0 |
| 2 | `maxSupply` | `uint32` | > 0 |
| 3 | `maxPerWallet` | `uint32` | 1 – 10, dan ≤ `maxSupply` |
| 4 | `saleStart` | `uint64` | < `saleEnd` |
| 5 | `saleEnd` | `uint64` | ≤ `eventTime`; saat create harus > waktu sekarang |
| 6 | `eventTime` | `uint64` | waktu mulai event |
| 7 | `resaleCapBps` | `uint16` | 10000 – 15000 (100% – 150%) |
| 8 | `detailsHash` | `bytes32` | opsional, boleh `0x000…000` |

`EventInfo` (hasil `getEvent`): `organizer`, `saleStart`, `resaleCapBps`, `status`, `saleEnd`, `eventTime`, `maxSupply`, `sold`, `maxPerWallet`, `ticketPrice`, `detailsHash`.

`TicketInfo` (hasil `getTicket`): `eventId`, `status`, `originalPrice`.

Enum: `EventStatus { Active = 0, Canceled = 1 }`, `TicketStatus { Valid = 0, Used = 1, Revoked = 2 }`.

Waktu jendela penjualan: pembelian diterima jika `saleStart ≤ now < saleEnd`.

## Tabel Fungsi

### CRUD Event (on-chain)

| Fungsi | Parameter | Pemanggil | Event log | Error |
| --- | --- | --- | --- | --- |
| `createEvent` → `eventId` | `EventParams p` | `ORGANIZER_ROLE` | `EventCreated` | `AccessControlUnauthorizedAccount`, `InvalidEventParams(reason)` |
| `getEvent` (view) → `EventInfo` | `uint256 eventId` | siapa saja | — | `EventNotFound` |
| `totalEvents` (view) → `uint256` | — | siapa saja | — | — |
| `updateEvent` | `uint256 eventId, EventParams p` | organizer pemilik event (yang masih punya `ORGANIZER_ROLE`) | `EventUpdated` | `EventNotFound`, `NotEventOrganizer`, `EventNotActive`, `EventAlreadyStarted`, `InvalidEventParams`, `FieldLocked` |
| `cancelEvent` | `uint256 eventId` | organizer pemilik event atau Admin | `EventCanceled` | `EventNotFound`, `NotOrganizerOrAdmin`, `EventNotActive`, `EventAlreadyStarted` |

Aturan `updateEvent`: semua field dikirim ulang (field yang tidak berubah diisi nilai lama). Hanya untuk event `Active` dan sebelum `eventTime`. **Setelah ada tiket terjual**, `ticketPrice`, `maxSupply`, dan `resaleCapBps` terkunci (`FieldLocked`), dan `eventTime` hanya boleh diundur, tidak boleh dimajukan. `maxPerWallet`, jendela penjualan, dan `detailsHash` tetap boleh diubah. `cancelEvent` hanya sebelum `eventTime`.

### Tiket

| Fungsi | Parameter | Pemanggil | Event log | Error |
| --- | --- | --- | --- | --- |
| `buyTicket` (payable) | `uint256 eventId, uint256 qty`; `msg.value = ticketPrice × qty` **tepat** | siapa saja | `TicketPurchased`, `Transfer` (mint) per token | `EventNotFound`, `EventNotActive`, `SaleNotOpen`, `InvalidQuantity`, `WalletLimitExceeded`, `SoldOut`, `IncorrectPayment(expected, sent)` |
| `getTicket` (view) → `TicketInfo` | `uint256 tokenId` | siapa saja | — | `TicketNotFound` |
| `purchasedCount` (view) → `uint256` | `uint256 eventId, address wallet` | siapa saja | — | — |
| `checkIn` | `uint256 eventId, uint256 tokenId` | Gate Checker yang ditugaskan pada `eventId` | `TicketCheckedIn` | `TicketNotFound`, `WrongEvent`, `NotGateChecker`, `EventNotActive`, `TicketNotValid` |
| `revokeTicket` | `uint256 tokenId` | organizer pemilik event atau Admin | `TicketRevoked` | `TicketNotFound`, `NotOrganizerOrAdmin`, `EventNotActive`, `EventAlreadyStarted`, `TicketNotValid` |
| `ownerOf`, `balanceOf` (view, ERC-721) | standar | siapa saja | — | `ERC721NonexistentToken` |

`maxPerWallet` menghitung **pembelian primer** per wallet per event (tiket yang diterima dari resale tidak dihitung). Check-in tidak punya batas waktu; cukup event `Active` dan tiket `Valid`. Tiket yang di-revoke harga aslinya disisihkan dan bisa diambil pemegangnya lewat `claimRefund`.

### Gate Checker

| Fungsi | Parameter | Pemanggil | Event log | Error |
| --- | --- | --- | --- | --- |
| `assignGateChecker` | `uint256 eventId, address checker` | organizer pemilik event atau Admin | `GateCheckerAssigned` | `EventNotFound`, `NotOrganizerOrAdmin`, `EventNotActive`, `ZeroAddress`, `GateCheckerAlreadyAssigned` |
| `removeGateChecker` | `uint256 eventId, address checker` | organizer pemilik event atau Admin | `GateCheckerRemoved` | `EventNotFound`, `NotOrganizerOrAdmin`, `GateCheckerNotAssigned` |
| `isGateChecker` (view) → `bool` | `uint256 eventId, address account` | siapa saja | — | — |

### Uang (pull payment)

| Fungsi | Parameter | Pemanggil | Event log | Error |
| --- | --- | --- | --- | --- |
| `withdraw` | `uint256 eventId` | alamat `organizer` event (role tidak wajib) | `RevenueWithdrawn` | `EventNotFound`, `NotEventOrganizer`, `WithdrawNotAllowed`, `NothingToWithdraw`, `EthTransferFailed` |
| `claimRefund` | `uint256 tokenId` | pemegang tiket saat ini | `RefundClaimed`, `Transfer` (burn) | `TicketNotFound`, `NotTicketHolder`, `RefundNotAllowed`, `EthTransferFailed` |
| `eventBalances` (view) → `(revenue, resaleFees)` | `uint256 eventId` | siapa saja | — | — |

- `withdraw` event `Active`: hanya jika `now ≥ eventTime`; membayar pendapatan primer + fee resale.
- `withdraw` event `Canceled`: hanya membayar fee resale; pendapatan primer tetap untuk refund.
- `claimRefund` diizinkan jika tiket `Revoked`, atau event `Canceled` dan tiket `Valid`/`Used`. Nominal = `originalPrice` (bukan harga resale). Tiket di-burn, jadi refund hanya sekali.

### Hook Marketplace (untuk Anggota 2)

| Fungsi | Parameter | Pemanggil | Event log | Error |
| --- | --- | --- | --- | --- |
| `transferByMarketplace` | `address from, address to, uint256 tokenId` | `MARKETPLACE_ROLE` | `Transfer` | `AccessControlUnauthorizedAccount`, `ZeroAddress`, `TicketNotTransferable`, `ERC721IncorrectOwner` |
| `receiveResaleFee` (payable) | `uint256 eventId`; `msg.value` = fee | `MARKETPLACE_ROLE` | `ResaleFeeReceived` | `AccessControlUnauthorizedAccount`, `EventNotFound`, `EventNotActive`, `ZeroValue` |
| `getResaleCap` (view) → `uint256` | `uint256 tokenId` | siapa saja | — | `TicketNotFound` |
| `isTransferable` (view) → `bool` | `uint256 tokenId` | siapa saja | — | tidak pernah revert |

- `getResaleCap = originalPrice × resaleCapBps / 10000`, dibulatkan ke bawah (menguntungkan pembeli, selisih < 1 wei).
- `isTransferable` bernilai `true` hanya jika token ada (belum di-burn), status `Valid`, event `Active`, dan `now < eventTime`.
- Marketplace wajib: memastikan listing dibuat oleh `from`, memeriksa harga ≤ `getResaleCap(tokenId)` (keputusan apakah fee termasuk dalam batas ada di Anggota 2), memanggil `isTransferable` sebelum menerima pembayaran, lalu `transferByMarketplace`. Ambil `eventId` untuk `receiveResaleFee` dari `getTicket(tokenId).eventId`. Gunakan `IERC721(ticketNft).ownerOf(tokenId)` untuk cek pemilik.
- Marketplace tidak bisa memakai `transferFrom` (approval tidak ada) dan tidak perlu menahan NFT (escrow).

### Role (warisan OpenZeppelin AccessControl)

| Fungsi | Parameter | Pemanggil | Event log | Error |
| --- | --- | --- | --- | --- |
| `grantRole` / `revokeRole` | `bytes32 role, address account` | Admin | `RoleGranted` / `RoleRevoked` | `AccessControlUnauthorizedAccount` |
| `renounceRole` | `bytes32 role, address callerConfirmation` | pemilik role itu sendiri | `RoleRevoked` | `AccessControlBadConfirmation` |
| `hasRole` (view) | `bytes32 role, address account` | siapa saja | — | — |

### Fungsi yang Dimatikan

| Fungsi | Hasil |
| --- | --- |
| `approve`, `setApprovalForAll` | selalu revert `ApprovalsDisabled` |
| `transferFrom`, `safeTransferFrom` | revert `TransferNotAllowed` (pemegang) atau `ERC721InsufficientApproval` (pihak lain) |
| Kirim ETH langsung ke kontrak | revert (tidak ada `receive`/`fallback`) |

## Event Log (untuk indexer)

| Event | Indexed | Data |
| --- | --- | --- |
| `EventCreated` | `eventId`, `organizer` | `params` (tuple `EventParams`) |
| `EventUpdated` | `eventId`, `organizer` | `params` (semua nilai baru) |
| `EventCanceled` | `eventId`, `by` | — |
| `TicketPurchased` | `eventId`, `buyer` | `firstTokenId`, `quantity`, `totalPaid` |
| `TicketCheckedIn` | `tokenId`, `eventId`, `checker` | `holder` |
| `TicketRevoked` | `tokenId`, `eventId`, `by` | — |
| `RefundClaimed` | `tokenId`, `eventId`, `holder` | `amount` |
| `GateCheckerAssigned` / `GateCheckerRemoved` | `eventId`, `checker`, `by` | — |
| `RevenueWithdrawn` | `eventId`, `organizer` | `amount` |
| `ResaleFeeReceived` | `eventId`, `marketplace` | `amount` |
| `Transfer` (ERC-721) | `from`, `to`, `tokenId` | mint: `from = 0`; burn (refund): `to = 0`; resale: keduanya bukan 0 |
| `RoleGranted` / `RoleRevoked` | `role`, `account`, `sender` | — |

## Kode Error

| Error | Arti untuk pengguna |
| --- | --- |
| `InvalidEventParams(reason)` | 1 harga, 2 kapasitas, 3 batas per wallet, 4 jendela penjualan, 5 `saleEnd` melewati `eventTime`, 6 batas resale |
| `EventNotFound(eventId)` / `TicketNotFound(tokenId)` | ID tidak ada |
| `NotEventOrganizer` / `NotOrganizerOrAdmin` | bukan organizer pemilik event (atau Admin bila diizinkan) |
| `NotGateChecker(eventId, caller)` | wallet tidak ditugaskan pada event ini |
| `WrongEvent(tokenId, eventId)` | tiket milik event lain |
| `NotTicketHolder(tokenId, caller)` | bukan pemegang tiket (atau tiket sudah di-burn) |
| `EventNotActive` / `EventAlreadyStarted` | event dibatalkan / sudah lewat `eventTime` |
| `FieldLocked` | mengubah field terkunci setelah ada penjualan |
| `SaleNotOpen` / `SoldOut` / `WalletLimitExceeded` / `InvalidQuantity` | di luar jendela penjualan / habis / melebihi batas per wallet / qty 0 |
| `IncorrectPayment(expected, sent)` | nilai ETH harus tepat sama |
| `TicketNotValid(tokenId)` | tiket sudah dipakai atau dicabut |
| `GateCheckerAlreadyAssigned` / `GateCheckerNotAssigned` | penugasan sudah ada / belum ada |
| `WithdrawNotAllowed` / `NothingToWithdraw` | belum lewat `eventTime` / saldo 0 |
| `RefundNotAllowed(tokenId)` | event tidak dibatalkan dan tiket tidak dicabut |
| `TransferNotAllowed` / `TicketNotTransferable` / `ApprovalsDisabled` | transfer di luar marketplace / tiket tidak boleh dijual / approval dimatikan |
| `ZeroAddress` / `ZeroValue` / `EthTransferFailed` | alamat 0 / nilai 0 / pengiriman ETH gagal |

## Catatan Integrasi

- **ethers v6:** objek `Contract` sudah punya method bawaan `getEvent()` untuk filter log. Panggil fungsi kontrak dengan `contract.getFunction("getEvent")(eventId)` atau `contract["getEvent(uint256)"](eventId)`. Fungsi lain bisa dipanggil biasa.
- Decode error: `contract.interface.parseError(err.data)` memberi nama error dan argumen untuk pesan UI.
- Input struct di ethers: objek `{ ticketPrice, maxSupply, maxPerWallet, saleStart, saleEnd, eventTime, resaleCapBps, detailsHash }`.
- Input struct di Remix (tuple, urutan tabel `EventParams`):
  `["10000000000000000",100,4,1793500000,1794000000,1794100000,11000,"0x0000000000000000000000000000000000000000000000000000000000000000"]`
- Remix: buat `TicketNFT.sol` dan `ITicketNFT.sol` dalam folder yang sama; import `@openzeppelin/contracts/...` di-resolve otomatis. Pilih compiler ≥ 0.8.24 dan EVM version `cancun` atau lebih baru.
- Daftar "Tiket saya": tidak ada `ERC721Enumerable`; indexer membangun daftar dari log `Transfer`. Untuk cek cepat satu tiket gunakan `ownerOf` + `getTicket`.
- Gate Checker: aplikasi gate memverifikasi signature QR EIP-712 (`AntiCaloCheckIn`) dan `ownerOf` **off-chain**, lalu mengirim `checkIn(eventId, tokenId)`. Kontrak tidak memverifikasi signature.
- Alur organizer: `createEvent` → simpan detail off-chain dengan `eventId` dari log `EventCreated` (atau dari nilai return via `staticCall`) → `assignGateChecker`.

## Menjalankan Test

```bash
cd blockchain
npm ci
npx hardhat test       # 54 test
npx hardhat coverage   # laporan coverage
npm run export-abi     # tulis ulang shared/abi/TicketNFT.json
```

## Risiko dan Asumsi yang Diketahui (untuk tim audit)

1. **Admin terpusat.** `DEFAULT_ADMIN_ROLE` satu kunci dapat memberi `MARKETPLACE_ROLE`, cancel event mana pun, dan revoke tiket. Kunci admin yang bocor = kontrol penuh atas transfer tiket (dana tetap hanya bisa ditarik organizer/pemegang tiket). Tidak ada multisig/timelock. `renounceRole` oleh admin terakhir mengunci administrasi role secara permanen.
2. **Marketplace dipercaya.** Pemegang `MARKETPLACE_ROLE` bisa memindahkan tiket transferable siapa pun; TicketNFT tidak memeriksa persetujuan penjual, harga, atau listing. Keamanan resale bergantung pada kontrak Anggota 2.
3. **Organizer dipercaya terhadap pembeli sebatas aturan kontrak.** Organizer tidak bisa mengambil uang sebelum `eventTime` dan revoke selalu disertai refund, tetapi organizer bisa membiarkan event berlalu tanpa menyelenggarakannya lalu withdraw. Tidak ada mekanisme sengketa.
4. **Gate Checker dipercaya.** Checker yang ditugaskan bisa menandai tiket `Used` kapan saja (tidak ada jendela waktu). Kontrak tidak memverifikasi bahwa pembawa QR adalah pemegang tiket; QR yang disalin bisa dipakai lebih dulu oleh orang lain bila aplikasi gate tidak memeriksa signature dan masa berlaku.
5. **Timestamp.** `block.timestamp` dipakai untuk jendela penjualan, `eventTime`, cancel/revoke, dan withdraw. Validator hanya bisa menggeser sekitar satu slot (~12 detik); semua jendela berskala menit–hari sehingga dianggap aman.
6. **Pembulatan bps.** `getResaleCap` dibulatkan ke bawah (kerugian < 1 wei bagi penjual). Perhitungan fee ada di marketplace.
7. **Anti-calo terbatas.** `maxPerWallet` hanya menghitung pembelian primer per alamat; satu orang dengan banyak wallet tetap bisa membeli lebih banyak (Sybil). Tiket hasil resale tidak dihitung ke batas.
8. **ETH bisa tertahan.** Refund event batal yang tidak pernah diklaim tetap di kontrak selamanya (tidak ada fungsi sweep, sengaja untuk mencegah rug pull). Kontrak penerima yang menolak ETH tidak bisa withdraw/refund (`EthTransferFailed`) dan harus memakai alamat lain/kontrak yang benar.
9. **`_mint` bukan `_safeMint`.** Disengaja: tidak ada callback eksternal saat pembelian (menghilangkan permukaan reentrancy). Karena tiket tidak bisa ditransfer bebas, risiko token terkunci di kontrak non-receiver hanya dialami pembeli kontrak itu sendiri.
10. **Override mutability.** `approve`/`setApprovalForAll` di-override sebagai `pure` yang selalu revert; tool analisis dapat menandainya sebagai perilaku non-standar ERC-721. Ini disengaja (anti-calo).
11. **Tidak upgradeable.** Bug setelah deploy memerlukan deploy ulang dan migrasi manual.
12. **Loop terbatas.** Satu-satunya loop ada di `buyTicket`, dibatasi `qty ≤ maxPerWallet ≤ MAX_PER_WALLET (10)`.

## Analisis Statis (Slither)

Slither belum terpasang di mesin Anggota 1 dan belum dijalankan; hasilnya belum ada. Cara menjalankan (Python 3.8+):

```bash
pip install slither-analyzer
cd blockchain
npm ci
slither . --filter-paths "node_modules|contracts/test"
```

Alternatif hanya untuk file kontrak:

```bash
slither contracts/TicketNFT.sol --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/"
```

Temuan yang diperkirakan muncul dan alasannya: `timestamp` (lihat risiko 5), `low-level-calls` pada `_sendEth` (disengaja, nilai return diperiksa), `arbitrary-send-eth` false positive (penerima selalu `msg.sender` yang sudah diverifikasi). Catat hasil nyata di `docs/security.md` setelah dijalankan.
