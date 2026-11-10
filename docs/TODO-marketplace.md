# TO-DO Marketplace: dari Development sampai Testing

Panduan kerja Anggota 2 untuk kontrak `Marketplace`. Spesifikasi yang diberikan berada di `.kiro/specs/ticket-nft/` pada workspace ini (`requirements.md` = apa, `design.md` = bagaimana, `tasks.md` = checklist tingkat spesifikasi). Dokumen ini adalah versi langkah demi langkah: perintah, urutan kerja, ID test, dan kriteria selesai.

Aturan emas: **jangan mengubah `TicketNFT.sol` dan `TicketNFT.test.js`**. Marketplace hanya memakai fungsi yang sudah ada.

Legenda: `[ ]` belum, `[x]` selesai. Kode `R4.2`, `OD-M5`, `§4.3` menunjuk ke requirement, keputusan, dan bagian desain.

---

## Fase 0 – Persiapan

- [x] **0.1 Ambil repo dan buat branch** (`feature/marketplace` sudah aktif di workspace).
  ```bash
  git clone --branch TicketLogic https://github.com/Lachrymousee/anti-calo.git
  cd anti-calo
  git checkout -b feature/marketplace
  ```
- [x] **0.2 Letakkan file dokumen** (file acuan yang diberikan tersedia; implementasi menggunakan jalur workspace saat ini):
  `.kiro/specs/ticket-nft/{requirements,design,tasks}.md`, `docs/contracts-marketplace.md`, `docs/TODO-marketplace.md`, `blockchain/contracts/IMarketplace.sol`, `blockchain/scripts/export-abi.js` (menimpa versi lama).
- [x] **0.3 Install dan jalankan baseline**
  ```bash
  cd blockchain
  npm ci
  npx hardhat test
  ```
  **Selesai jika:** semua test TicketNFT yang ada lulus (docs tiket menyebut 54). Compile pertama mengunduh compiler Solidity 0.8.28; jika timeout, coba jaringan lain atau matikan VPN/proxy. Jika Hardhat memperingatkan versi Node tidak didukung, pakai Node LTS.
- [x] **0.4 Baca ulang** `docs/contracts.md` bagian "Hook Marketplace" dan `ITicketNFT.sol`, lalu `design.md` §4 dan §6.
- [ ] **0.5 Commit dokumen** (`docs: add marketplace spec and todo`).

---

## Fase 1 – Kerangka kontrak

File: `blockchain/contracts/Marketplace.sol`

- [x] **1.1** Header: `SPDX-License-Identifier: MIT`, `pragma solidity ^0.8.24;`
- [x] **1.2** Import: `ReentrancyGuard` (`@openzeppelin/contracts/utils/ReentrancyGuard.sol`), `IERC721` (`@openzeppelin/contracts/token/ERC721/IERC721.sol`), `ITicketNFT`, `IMarketplace`.
- [x] **1.3** `contract Marketplace is IMarketplace, ReentrancyGuard`
- [x] **1.4** Konstanta dan immutable (§3):
  - `uint16 public constant override MAX_FEE_BPS = 1_000;`
  - denominator 10_000 (private constant)
  - `address public immutable override ticketNft;`
  - `uint16 public immutable override feeBps;`
- [x] **1.5** Storage: `mapping(uint256 tokenId => Listing) private _listings;` dan `mapping(address seller => uint256) private _pendingProceeds;`
- [x] **1.6** Constructor (R1.1): `ZeroAddress` bila alamat nol, `InvalidFee` bila `feeBps_ > MAX_FEE_BPS`.
- [x] **1.7** Tidak ada `receive`/`fallback`, tidak ada `Ownable`, tidak ada setter (R1.2, R1.4).
- [x] **1.8** Implementasi penuh dikompilasi (tanpa tahap stub):
  ```bash
  npx hardhat compile
  ```
  **Selesai jika:** compile tanpa error. Compiler akan memberi tahu fungsi interface yang belum diimplementasikan; itu daftar kerja Fase 2.
- [ ] **1.9** Commit (`feat(blockchain): marketplace skeleton`).

---

## Fase 2 – Implementasi fungsi

Kerjakan satu fungsi, compile, lalu commit. Tambahkan NatSpec (`@notice`, `@dev`, `@param`) saat menulis, jangan ditunda.

- [x] **2.1 `quoteSale(price)`** (R6.3)
  `fee = price * feeBps / 10_000`; `sellerAmount = price - fee`. Fungsi `public view` karena akan dipanggil dari `buyListing`.
- [x] **2.2 `getListing` dan `pendingProceeds`** (R6.1, R6.2): view sederhana.
- [x] **2.3 `listTicket`** (R2, §4.1). Urutan pemeriksaan **wajib**:
  1. `price > 0`: `ZeroPrice`
  2. `isTransferable`: `TicketNotTransferable`
  3. `ownerOf == msg.sender`: `NotTicketHolder`
  4. `price <= getResaleCap`: `PriceAboveCap(tokenId, price, cap)`
  5. `_listings[tokenId].seller != msg.sender`: `AlreadyListed`

  Lalu simpan, baca `eventId` lewat `getTicket(tokenId).eventId`, emit `Listed`.
  Perhatikan: pemeriksaan 2 harus sebelum 3 agar token yang sudah di-burn tidak membuat `ownerOf` revert.
- [x] **2.4 `cancelListing`** (R3, §4.2): hanya membaca storage; **tanpa** panggilan ke TicketNFT.
- [x] **2.5 `buyListing`** (R4, §4.3) dengan `nonReentrant`. Urutan:
  1. `NotListed`, 2. `CannotBuyOwnListing`, 3. `IncorrectPayment(price, msg.value)`, 4. `TicketNotTransferable`, 5. `StaleListing`.
  6. Baca `eventId`.
  7. **Effects:** hitung fee dan sellerAmount, tambah `_pendingProceeds[seller]`, `delete _listings[tokenId]`.
  8. **Interactions:** `transferByMarketplace(seller, msg.sender, tokenId)`, lalu `if (fee > 0) receiveResaleFee{value: fee}(eventId)`.
  9. Emit `Sold`.

  Jangan menambah pengecekan cap di sini (R4.9, alasannya ada di `design.md`).
- [x] **2.6 `withdrawProceeds`** (R5, §4.4) dengan `nonReentrant`: baca saldo, `NoProceeds` bila 0, **nol-kan sebelum kirim**, kirim lewat `call`, `EthTransferFailed` bila gagal, emit `ProceedsWithdrawn`.
- [x] **2.7 Tinjau mandiri** dengan daftar ini:
  - semua state diubah sebelum panggilan eksternal
  - tidak ada `tx.origin`, tidak ada loop
  - semua custom error dipakai persis seperti di §7 (tidak ada `require` dengan string)
  - NatSpec lengkap, termasuk catatan pembulatan fee dan catatan kill switch
- [x] **2.8** `npx hardhat compile` tanpa warning.

**Selesai Fase 2 jika:** semua fungsi `IMarketplace` terimplementasi dan compile bersih.

---

## Fase 3 – Helper test

File: `blockchain/contracts/test/ProceedsAttacker.sol` (tiru gaya `WithdrawAttacker.sol`; label "TEST ONLY").

- [x] **3.1** Kontrak membaca `TicketNFT` dan `Marketplace` lewat constructor (`immutable`).
- [x] **3.2** Fungsi pembungkus agar kontrak ini bisa menjadi penjual:
  - `buyPrimary(eventId, qty)` payable: memanggil `ticket.buyTicket{value: msg.value}`
  - `list(tokenId, price)`: memanggil `marketplace.listTicket`
  - `buy(tokenId)` payable: memanggil `marketplace.buyListing{value: msg.value}(tokenId)` (untuk skenario pembeli kontrak, D10)
  - `withdraw()`: memanggil `marketplace.withdrawProceeds`
  - `setRejectEth(bool)`
- [x] **3.3** `receive()` payable:
  - jika `rejectEth` aktif: `revert`
  - jika belum pernah mencoba: tandai `reentryAttempted = true`, lalu `try marketplace.withdrawProceeds() { reentrySucceeded = true; } catch {}`
- [x] **3.4** Compile.

---

## Fase 4 – Test

File: `blockchain/test/Marketplace.test.js` (CommonJS; `expect` dari chai, `ethers` dari hardhat, `loadFixture`, `time` dari `hardhat-network-helpers`, sama seperti `TicketNFT.test.js`).

### 4.1 Fixture dan helper

- [x] `makeParams(overrides)` dengan `resaleCapBps: 11000` dan harga tiket 0.01 ETH.
- [x] `deployFixture`: akun, role, marketplace, rogue, dan event sesuai skenario.
- [x] `soldFixture`: seller memiliki token 1 dan other memiliki token 2; buyer belum membeli tiket primer.
- [x] Helper listing dan harga cap 0,011 ETH.

Angka acuan (ticket 0,01 ETH, cap 11000, fee 500): harga 0,011 ETH → fee `550000000000000` wei, penjual `10450000000000000` wei.

### 4.2 Daftar test

Setiap baris = satu `it(...)`. Gunakan `revertedWithCustomError(marketplace, "...")` untuk error marketplace dan `revertedWithCustomError(nft, "...")` untuk error TicketNFT.

**A. Constructor dan konfigurasi** (R1)

| ID | Skenario | Hasil |
| --- | --- | --- |
| A1 | Deploy normal | `ticketNft()` = alamat NFT, `feeBps()` = 500, `MAX_FEE_BPS()` = 1000 |
| A2 | `ticketNft_` = alamat nol | `ZeroAddress` |
| A3 | `feeBps_` = 1001 | `InvalidFee`; 1000 dan 0 berhasil |
| A4 | Kirim ETH langsung ke marketplace | revert (tanpa `receive`) |

**B. `listTicket`** (R2)

| ID | Skenario | Hasil |
| --- | --- | --- |
| B1 | Pemilik list di harga biasa | event `Listed` (tokenId, eventId, seller, price); `getListing` sesuai; NFT **tetap** di penjual |
| B2 | Harga 0 | `ZeroPrice` |
| B3 | Bukan pemilik | `NotTicketHolder(tokenId, caller)` |
| B4 | Harga = cap berhasil; cap + 1 | `PriceAboveCap(tokenId, price, cap)` |
| B5 | List dua kali oleh penjual yang sama | `AlreadyListed` |
| B6 | Tiket `Used` (check-in) | `TicketNotTransferable` |
| B7 | Tiket `Revoked` | `TicketNotTransferable` |
| B8 | Event dibatalkan | `TicketNotTransferable` |
| B9 | Setelah `eventTime` | `TicketNotTransferable` |
| B10 | Tiket sudah di-burn (`revokeTicket` lalu `claimRefund`) | `TicketNotTransferable`, **bukan** revert `ownerOf` |
| B11 | `tokenId` belum pernah terbit | `TicketNotTransferable` |
| B12 | Organizer, Admin, Gate Checker yang memegang tiket boleh list | berhasil |
| B13 | Listing basi (tiket dipindah `rogue` ke wallet lain) lalu pemilik baru list | listing tertimpa; `getListing.seller` = pemilik baru |
| B14 | Tiket dipindah `rogue` ke wallet lain lalu kembali ke penjual lama yang masih punya listing | `AlreadyListed` (penjual harus `cancelListing` dulu) |
| B15 | Pemilik baru (setelah penjualan) list lagi | berhasil; cap tetap dari harga awal |

**C. `cancelListing`** (R3)

| ID | Skenario | Hasil |
| --- | --- | --- |
| C1 | Penjual membatalkan | event `ListingCanceled`; `getListing` nol |
| C2 | Bukan penjual (termasuk organizer dan admin) | `NotSeller(tokenId, caller)` |
| C3 | Tidak ada listing / sudah dibatalkan / sudah terjual | `NotListed` |
| C4 | Cancel tetap bisa setelah tiket `Used`, `Revoked`, event batal, lewat `eventTime`, token di-burn | berhasil |
| C5 | Setelah cancel, bisa list ulang di harga baru | berhasil |

**D. `buyListing`** (R4, R7)

| ID | Skenario | Hasil |
| --- | --- | --- |
| D1 | Beli di harga cap (0,011 ETH) | pemilik NFT = pembeli; `pendingProceeds(seller)` = 10450000000000000; `nft.eventBalances(1)` mengembalikan `resaleFees` = 550000000000000; saldo ETH marketplace = 10450000000000000; listing terhapus; event `Sold` benar |
| D2 | `msg.value` kurang atau lebih | `IncorrectPayment(expected, sent)` |
| D3 | Penjual membeli listing sendiri | `CannotBuyOwnListing` |
| D4 | Tidak ada listing / sudah terjual / dibatalkan | `NotListed` |
| D5 | Tiket tidak transferable setelah listing: `Used`, `Revoked`, event batal, lewat `eventTime`, di-burn | `TicketNotTransferable` |
| D6 | Listing basi (`rogue` memindahkan tiket) lalu `other` membeli | `StaleListing` |
| D7 | Fee 0: event 3 dengan `ticketPrice = 1n`, jual 1 wei | berhasil; tidak ada event `ResaleFeeReceived`; penjual dapat 1 wei |
| D8 | Pembulatan: event dengan `ticketPrice = 10000n`, jual 10001 wei | fee 500, penjual 9501 |
| D9 | Role dicabut (`admin` revoke `MARKETPLACE_ROLE` dari marketplace) | revert `AccessControlUnauthorizedAccount` dari TicketNFT; listing, saldo, dan pemilik **tidak berubah** |
| D10 | Pembeli kontrak (mis. `ProceedsAttacker`) membeli | berhasil |
| D11 | Hitungan beli per wallet | `nft.purchasedCount(eventId, buyer)` **tidak** bertambah |
| D12 | Penjual `seller` mencoba `transferFrom` dan `approve` setelah list | tetap revert dari TicketNFT (integrasi anti-calo) |
| D13 | Beli listing yang harganya di bawah cap | berhasil; fee dihitung dari harga jual, bukan dari cap |

**E. `withdrawProceeds`** (R5)

| ID | Skenario | Hasil |
| --- | --- | --- |
| E1 | Penjual menarik | saldo ETH penjual naik sebesar proceeds; `pendingProceeds` = 0; event `ProceedsWithdrawn` |
| E2 | Tidak ada saldo / menarik kedua kali | `NoProceeds` |
| E3 | Dua penjualan oleh penjual yang sama | saldo terakumulasi; tarik sekali |
| E4 | Reentrancy: `ProceedsAttacker` menjadi penjual dan memanggil `withdrawProceeds` ulang dari `receive()` | `reentryAttempted` true, `reentrySucceeded` false; dibayar tepat sekali |
| E5 | Penjual yang menolak ETH (`setRejectEth(true)`) | `buyListing` tetap berhasil; `withdraw` revert `EthTransferFailed`; saldo tetap utuh |
| E6 | Role marketplace dicabut setelah penjualan | `withdrawProceeds` tetap berhasil |

**F. View dan `quoteSale`** (R6)

| ID | Skenario | Hasil |
| --- | --- | --- |
| F1 | `getListing` untuk tiket tanpa listing | struct nol |
| F2 | `quoteSale(0.011 ether)` | `fee` 550000000000000, `sellerAmount` 10450000000000000 |
| F3 | `quoteSale(0)`, `quoteSale(1)`, dan nilai sangat besar (`2n**200n`) | tidak revert; `fee + sellerAmount == price` |

**G. Invarian uang** (design §6)

| ID | Skenario | Hasil |
| --- | --- | --- |
| G1 | Setelah campuran: dua penjualan, satu penarikan, satu cancel | `saldo ETH marketplace == Σ pendingProceeds` untuk semua penjual yang terlibat |
| G2 | Untuk setiap penjualan | `fee + sellerAmount == price` |

**H. End-to-end** (R4.4)

| ID | Skenario | Hasil |
| --- | --- | --- |
| H1 | Penjualan resale, `time.increaseTo(eventTime)`, organizer memanggil `nft.withdraw(1)` | organizer menerima pendapatan primer + 550000000000000 (pakai `changeEtherBalance`) |
| H2 | Event dibatalkan setelah penjualan resale | organizer bisa `withdraw` fee resale; pembeli resale bisa `claimRefund` dengan harga **asli** tiket |

- [x] **4.3** Tulis test per grup dan jalankan `npx hardhat test test/Marketplace.test.js` (35 lulus).
- [x] **4.4** Cek test lama tidak rusak: `npx hardhat test` (89 lulus, termasuk 54 test TicketNFT).

**Selesai Fase 4 jika:** semua ID di atas ada dan lulus.

---

## Fase 5 – Coverage dan analisis statis

- [x] **5.1 Coverage**
  ```bash
  npx hardhat coverage
  ```
  Target: 100% baris dan cabang untuk `Marketplace.sol`. Jika ada cabang yang tidak tersentuh, tambah test atau jelaskan mengapa tidak bisa dijangkau.
- [x] **5.2 Slither**
  ```bash
  pip install slither-analyzer
  slither . --filter-paths "node_modules|contracts/test"
  ```
  Triase setiap temuan: perbaiki, atau catat alasannya sebagai "disengaja". Perkiraan temuan ada di `docs/contracts-marketplace.md`.
- [x] **5.3 Review keamanan mandiri**
  - [x] tidak ada jalur menjual tiket orang lain tanpa listing dari pemiliknya (R7.1)
  - [x] harga bayar pembeli tidak pernah melebihi cap (R7.2)
  - [x] `withdrawProceeds` dan `cancelListing` tidak bergantung pada `MARKETPLACE_ROLE` (R3.3, R5.5)
  - [x] tidak ada fungsi istimewa (owner, pause, setter) (R1.2)
  - [x] ETH keluar hanya dari `withdrawProceeds` dan fee ke `ticketNft` (R5.4)

**Selesai Fase 5 jika:** coverage tercapai dan hasil Slither tercatat.

---

## Fase 6 – ABI dan dokumentasi

- [x] **6.1 Ekspor ABI**
  ```bash
  npm run export-abi
  ```
  Harus menulis `shared/abi/TicketNFT.json` (tanpa perubahan isi) dan `shared/abi/Marketplace.json`. Cek `git diff shared/abi/TicketNFT.json` kosong.
- [x] **6.2 Lengkapi `docs/contracts-marketplace.md`** dengan jumlah test, coverage, dan hasil Slither.
- [x] **6.3 Catat temuan Slither** di `docs/security.md`.
- [x] **6.4 Centang** task spesifikasi. Tidak ada perubahan perilaku dari desain; kalkulasi fee dipecah untuk tetap aman overflow tanpa mengubah hasil pembulatan.

---

## Fase 7 – Hand-off ke tim lain

- [x] **7.1 Frontend:** aturan listing yang dapat dibeli, pemakaian `quoteSale`, cap per event, dan alur pembelian didokumentasikan di `docs/contracts-marketplace.md`.
- [x] **7.2 Indexer/backend:** event, cara menentukan listing aktif, dan kebutuhan dua ABI untuk decode error didokumentasikan di `docs/contracts-marketplace.md`.
- [ ] **7.3 Deployment:** deploy `Marketplace(ticketNft, 500)`, minta Admin TicketNFT menjalankan `grantRole(MARKETPLACE_ROLE, alamatMarketplace)`, verifikasi dengan `hasRole`, lalu simpan alamat dan `feeBps` di `shared/deployments/<network>.json`.
- [ ] **7.4 Smoke test di testnet** (Sepolia, wallet khusus pengembangan): list → beli → tarik dana → organizer `withdraw`.

---

## Fase 8 – Pull request

- [x] **8.1** Pastikan tidak ada file hasil build/dependency/secret yang ikut perubahan; `artifacts/`, `cache/`, `coverage/`, `node_modules/`, dan `.env` di-ignore.
- [x] **8.2** Perubahan implementasi terbatas pada Marketplace, helper/test, ABI exporter, ABI, dan dokumentasi/spec terkait.
- [ ] **8.3** Deskripsi PR memuat: ringkasan, daftar keputusan penting (OD-M1 sampai M18), hasil test dan coverage, hasil Slither, dan catatan penyimpangan dari desain.
- [ ] **8.4** Minta review Anggota 1 (kesesuaian dengan TicketNFT) dan anggota yang mengerjakan frontend/indexer.

---

## Definition of Done

- [ ] Semua requirement R1 sampai R9 terpenuhi dan dapat ditunjuk ke test atau dokumen
- [x] `npx hardhat test` lulus semua (test lama dan test marketplace)
- [x] Coverage `Marketplace.sol` 100% baris dan cabang
- [x] Slither dijalankan dan setiap temuan diberi status
- [x] `shared/abi/Marketplace.json` ada dan sesuai kontrak
- [x] `docs/contracts-marketplace.md` tidak memuat lagi tanda **(isi nanti)**
- [x] `TicketNFT.sol` dan `TicketNFT.test.js` tidak berubah
- [ ] PR direview dan disetujui

## Saran urutan commit

1. `docs: add marketplace spec and todo`
2. `feat(blockchain): add IMarketplace interface and multi-contract ABI export`
3. `feat(blockchain): marketplace skeleton`
4. `feat(blockchain): marketplace listing and cancel`
5. `feat(blockchain): marketplace buy and proceeds withdrawal`
6. `test(blockchain): proceeds attacker helper`
7. `test(blockchain): marketplace tests`
8. `docs: marketplace integration doc, abi and security notes`

## Jika macet

| Gejala | Kemungkinan penyebab |
| --- | --- |
| `Compiler ... could not be downloaded` | Koneksi ke `binaries.soliditylang.org` terblokir; ganti jaringan atau matikan VPN |
| `Contract "Marketplace" should be marked as abstract` | Ada fungsi `IMarketplace` yang belum diimplementasikan atau lupa `override` |
| `Overriding function is missing "override" specifier` | Tambahkan `override` pada `ticketNft`, `feeBps`, `MAX_FEE_BPS`, dan fungsi eksternal |
| `AccessControlUnauthorizedAccount` saat `buyListing` | `MARKETPLACE_ROLE` belum diberikan ke **alamat marketplace** di fixture |
| `TransferNotAllowed` | Pemanggil `transferByMarketplace` bukan pemegang role |
| `ERC721NonexistentToken` dari `ownerOf` | Urutan pemeriksaan salah: `isTransferable` harus sebelum `ownerOf` |
| `IncorrectPayment` di test | Lupa `{ value: price }` pada `buyListing` |
| `getEvent` tidak ditemukan di ethers | Gunakan `nft.getFunction("getEvent")(id)` (lihat catatan di `TicketNFT.test.js`) |
