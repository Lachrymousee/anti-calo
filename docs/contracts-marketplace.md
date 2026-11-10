# Kontrak Marketplace

Dokumen integrasi untuk anggota frontend, backend, dan indexer, serta acuan tim audit. Penanggung jawab: Anggota 2 (Marketplace). Spesifikasi lengkap ada di `.kiro/specs/marketplace/`. Kontrak tiket yang diperdagangkan dijelaskan di `docs/contracts.md`.

> **Status:** implementasi dan pengujian lokal selesai. Marketplace memiliki 35 test khusus, coverage 100% baris dan cabang, dan ABI sudah diekspor. Hasil Slither beserta triase dicatat di `docs/security.md`. Deploy dan smoke test Sepolia belum dilakukan.

| Item | Nilai |
| --- | --- |
| Source | `blockchain/contracts/Marketplace.sol`, interface `blockchain/contracts/IMarketplace.sol` |
| ABI | `shared/abi/Marketplace.json` (buat ulang: `cd blockchain` lalu `npm run export-abi`) |
| Compiler | Solidity `^0.8.24` (Hardhat memakai 0.8.28, optimizer 200, EVM `cancun`) |
| Library | OpenZeppelin Contracts `5.6.1` (ReentrancyGuard, IERC721) |
| Mata uang | ETH native saja |
| Fee resale | Parameter constructor `feeBps` (nilai demo **500 = 5%**, maksimum 1000 = 10%), tetap setelah deploy |
| Alamat deployment Sepolia | Belum ada. Diisi di `shared/deployments/` setelah deploy. |

## Ringkasan Aturan

- Semua harga dalam **wei** (integer). `tokenId` unik di semua event, sehingga menjadi kunci listing.
- Marketplace **tidak menyimpan NFT** (tanpa escrow). Listing hanya catatan `{seller, price}`; NFT tetap di dompet penjual sampai terjual.
- Harga listing harus `> 0` dan `<= getResaleCap(tokenId)`. **Fee diambil dari harga**, jadi pembeli tidak pernah membayar di atas batas anti-calo.
- Pembeli membayar **tepat** harga listing (kurang atau lebih akan revert `IncorrectPayment`).
- Fee = `harga * feeBps / 10_000` (dibulatkan ke bawah), dikirim ke organizer event tersebut lewat `TicketNFT.receiveResaleFee`. Tidak ada fee platform. Jika fee bulat jadi 0, pemanggilan fee dilewati.
- Sisa `harga − fee` masuk ke `pendingProceeds[penjual]`; penjual menarik sendiri dengan `withdrawProceeds` (**pull payment**, sama seperti TicketNFT).
- Satu listing aktif per `tokenId`. Mengubah harga = `cancelListing` lalu `listTicket` lagi.
- Tidak ada owner, admin, pause, atau setter di marketplace. "Tombol darurat" = Admin TicketNFT mencabut `MARKETPLACE_ROLE`.
- Tidak ada daftar listing on-chain; daftar dibangun dari event log.

## Prasyarat: Role di TicketNFT

Marketplace baru bisa memindahkan tiket setelah Admin TicketNFT memberinya `MARKETPLACE_ROLE` (lihat bagian Deployment). Tanpa itu, `buyListing` selalu revert dari TicketNFT (`AccessControlUnauthorizedAccount`) dan tidak ada perubahan state.

## Struktur Data

`Listing` (output `getListing`):

| # | Field | Tipe | Arti |
| --- | --- | --- | --- |
| 1 | `seller` | `address` | Pembuat listing. `address(0)` = tidak ada listing. |
| 2 | `price` | `uint256` | Harga jual (wei). |

## Tabel Fungsi

### Penjual

| Fungsi | Parameter | Pemanggil | Event | Error utama |
| --- | --- | --- | --- | --- |
| `listTicket` | `tokenId`, `price` | Pemegang tiket (semua role boleh) | `Listed` | `ZeroPrice`, `TicketNotTransferable`, `NotTicketHolder`, `PriceAboveCap`, `AlreadyListed` |
| `cancelListing` | `tokenId` | Penjual listing tersebut | `ListingCanceled` | `NotListed`, `NotSeller` |
| `withdrawProceeds` | — | Penjual yang punya saldo | `ProceedsWithdrawn` | `NoProceeds`, `EthTransferFailed` |

### Pembeli

| Fungsi | Parameter | Pemanggil | Event | Error utama |
| --- | --- | --- | --- | --- |
| `buyListing` (payable) | `tokenId`, `msg.value = price` | Wallet mana pun selain penjual | `Sold` (+ `Transfer` dari TicketNFT) | `NotListed`, `CannotBuyOwnListing`, `IncorrectPayment`, `TicketNotTransferable`, `StaleListing`, error dari TicketNFT |

### View

| Fungsi | Hasil |
| --- | --- |
| `getListing(tokenId)` | `Listing` (semua nol jika tidak ada) |
| `pendingProceeds(seller)` | Saldo hasil penjualan yang belum ditarik (wei) |
| `quoteSale(price)` | `(fee, sellerAmount)`, rumus sama dengan `buyListing`; dipakai UI untuk menampilkan rincian |
| `ticketNft()` | Alamat TicketNFT |
| `feeBps()` / `MAX_FEE_BPS()` | Fee saat ini dan batas maksimum |

### Constructor

`constructor(address ticketNft_, uint16 feeBps_)`: revert `ZeroAddress` jika alamat nol, `InvalidFee` jika `feeBps_ > 1000`.

## Urutan Pemeriksaan `buyListing`

1. Listing ada (`NotListed`)
2. Pembeli bukan penjual (`CannotBuyOwnListing`)
3. `msg.value == price` (`IncorrectPayment(expected, sent)`)
4. `isTransferable(tokenId)` (`TicketNotTransferable`)
5. `ownerOf(tokenId) == seller` (`StaleListing`)
6. Hitung fee, catat saldo penjual, hapus listing, lalu `transferByMarketplace`, lalu `receiveResaleFee` (jika fee > 0), lalu emit `Sold`.

Contoh angka (tiket 0,01 ETH, `resaleCapBps = 11000`, `feeBps = 500`): batas = 0,011 ETH. Dijual 0,011 ETH → fee 0,00055 ETH ke organizer, penjual mendapat 0,01045 ETH di `pendingProceeds`.

## Event Log (untuk indexer)

| Event | Field | Dipancarkan oleh |
| --- | --- | --- |
| `Listed` | `tokenId` (indexed), `eventId` (indexed), `seller` (indexed), `price` | `listTicket` |
| `ListingCanceled` | `tokenId` (indexed), `seller` (indexed) | `cancelListing` |
| `Sold` | `tokenId` (indexed), `eventId` (indexed), `buyer` (indexed), `seller`, `price`, `fee` | `buyListing` |
| `ProceedsWithdrawn` | `seller` (indexed), `amount` | `withdrawProceeds` |

**Menentukan listing aktif:** ambil `Listed`, buang yang sudah diikuti `ListingCanceled` atau `Sold` untuk `tokenId` yang sama. Listing disebut **dapat dibeli** hanya jika ketiganya benar: `getListing(tokenId).seller != 0`, `TicketNFT.isTransferable(tokenId)`, dan `ownerOf(tokenId) == seller`. Listing yang tidak dapat dibeli (event mulai/batal, tiket `Used`/`Revoked`/refund) sebaiknya disembunyikan di UI; listing-nya tetap ada di storage sampai penjual membatalkan.

Volume resale per event: jumlahkan `price` dan `fee` dari `Sold` dengan `eventId` yang sama. `Transfer` dari TicketNFT juga muncul pada setiap penjualan.

## Kode Error

| Error | Arti |
| --- | --- |
| `ZeroAddress()` | Alamat TicketNFT nol saat deploy |
| `InvalidFee()` | `feeBps` > 1000 saat deploy |
| `ZeroPrice()` | Harga listing 0 |
| `NotTicketHolder(tokenId, caller)` | Pemanggil bukan pemilik tiket |
| `TicketNotTransferable(tokenId)` | Tiket tidak ada, bukan `Valid`, event batal, atau event sudah mulai |
| `PriceAboveCap(tokenId, price, cap)` | Harga di atas batas resale |
| `AlreadyListed(tokenId)` | Pemanggil sudah punya listing untuk tiket ini |
| `NotListed(tokenId)` | Tidak ada listing |
| `NotSeller(tokenId, caller)` | Bukan penjual listing tersebut |
| `CannotBuyOwnListing()` | Penjual mencoba membeli listing sendiri |
| `IncorrectPayment(expected, sent)` | `msg.value` tidak sama dengan harga |
| `StaleListing(tokenId)` | Pemilik tiket sekarang bukan penjual listing |
| `NoProceeds()` | Tidak ada saldo untuk ditarik |
| `EthTransferFailed()` | Pengiriman ETH ke penarik gagal |

Nama error yang juga ada di TicketNFT (`ZeroAddress`, `NotTicketHolder`, `TicketNotTransferable`, `IncorrectPayment`, `EthTransferFailed`) memakai signature yang sama, jadi satu decoder yang menggabungkan kedua ABI bisa membaca keduanya. Error saldo kosong sengaja bernama `NoProceeds` (bukan `NothingToWithdraw`) karena TicketNFT sudah punya `NothingToWithdraw(uint256)` dengan signature berbeda.

## Catatan Integrasi

- **Dua ABI untuk decode error.** Revert dari TicketNFT (misalnya role dicabut) diteruskan apa adanya lewat Marketplace. Decode dengan `Interface` dari `Marketplace.json` dan `TicketNFT.json`; coba keduanya pada `err.data`.
- **Batas harga per event.** Cap resale berbeda per event (100–150%). Jangan memakai 100% tetap seperti demo; baca `TicketNFT.getResaleCap(tokenId)` untuk validasi input di form listing.
- **Rincian harga.** Gunakan `quoteSale(price)` untuk menampilkan "organizer menerima X, Anda menerima Y". Pembeli selalu membayar `price`.
- **Mengirim pembelian (ethers v6):** `await marketplace.buyListing(tokenId, { value: listing.price })`. `listing.price` dari `getListing` (bigint).
- **Memanggil `listTicket`:** tidak perlu `approve` (approval dimatikan di TicketNFT, dan marketplace tidak meng-escrow NFT).
- **Setelah terjual,** pemilik baru bisa langsung `listTicket` lagi. Batas harga tetap dihitung dari harga tiket awal.
- **Tarik dana.** Penjual melihat saldo dengan `pendingProceeds(address)`, menarik dengan `withdrawProceeds()`. Penjual berupa kontrak yang menolak ETH hanya gagal menarik (`EthTransferFailed`), pembelian tidak terganggu, dan saldonya tetap aman.
- **Fee organizer.** Fee tidak tersimpan di Marketplace. Organizer menarik fee lewat `TicketNFT.withdraw(eventId)`: untuk event `Active`, bersama pendapatan penjualan setelah `eventTime`; untuk event yang dibatalkan, fee bisa ditarik langsung.
- **Remix.** Buat `Marketplace.sol`, `IMarketplace.sol`, dan `ITicketNFT.sol` dalam folder yang sama. Argumen constructor: alamat TicketNFT dan `500`.

## Deployment dan Aktivasi (acuan untuk Anggota 2)

1. Deploy `TicketNFT` (sudah dilakukan Anggota 1, alamat di `shared/deployments/`).
2. Deploy `Marketplace(ticketNft, 500)`.
3. **Admin TicketNFT** memanggil `grantRole(MARKETPLACE_ROLE, alamatMarketplace)`. `MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE")`.
4. Verifikasi: `TicketNFT.hasRole(MARKETPLACE_ROLE, alamatMarketplace) == true` dan `Marketplace.ticketNft()` sama dengan alamat TicketNFT.
5. Simpan alamat dan nilai `feeBps` di `shared/deployments/<network>.json`.
6. Mematikan marketplace: Admin memanggil `revokeRole(MARKETPLACE_ROLE, alamatMarketplace)`.

## Menjalankan Test

```bash
cd blockchain
npm ci
npx hardhat test                              # semua test
npx hardhat test test/Marketplace.test.js     # hanya marketplace
npx hardhat coverage                          # laporan coverage
npm run export-abi                            # tulis shared/abi/TicketNFT.json dan Marketplace.json
```

Hasil verifikasi terakhir:

| Pemeriksaan | Hasil |
| --- | --- |
| Test Marketplace | 35 lulus |
| Test TicketNFT yang sudah ada | 54 lulus, tanpa perubahan pada source atau test |
| Semua test blockchain | 89 lulus |
| Coverage `Marketplace.sol` | 100% statements, 100% branches, 100% functions, 100% lines |
| ABI | `shared/abi/Marketplace.json` dihasilkan oleh `npm run export-abi`; isi ABI TicketNFT tetap sama |

Test dijalankan dengan Hardhat 2.29.1, Solidity 0.8.28, dan OpenZeppelin 5.6.1.

## Risiko dan Asumsi yang Diketahui (untuk tim audit)

1. **Tidak ada batas beli resale per wallet.** `maxPerWallet` di TicketNFT hanya menghitung pembelian primer; satu wallet bisa mengumpulkan banyak tiket lewat resale. Anti-calo terbatas (lihat risiko 7 di `docs/contracts.md`).
2. **Marketplace tidak punya admin.** Fee dan alamat TicketNFT tetap. Perubahan fee atau perbaikan bug butuh deploy marketplace baru dan Admin TicketNFT memberi role ke alamat baru.
3. **TicketNFT mempercayai semua pemegang `MARKETPLACE_ROLE`.** Marketplace kedua yang diberi role bisa memindahkan tiket. Akibatnya sebuah listing lama bisa menjadi **basi** (pemilik berubah); `buyListing` menolaknya dengan `StaleListing`. Jika tiket kembali ke penjual lama, listing lama menjadi aktif lagi dengan harga lama; penjual bisa membatalkannya.
4. **Pembulatan fee ke bawah.** Organizer bisa kehilangan kurang dari 1 wei per penjualan; penjual mendapat sisanya. Pada harga sangat kecil fee bisa 0 dan tidak dikirim.
5. **Batas harga hanya dicek saat listing.** Aman karena `ticketPrice`, `maxSupply`, dan `resaleCapBps` event terkunci setelah penjualan pertama, dan listing butuh tiket yang sudah terbit.
6. **Pull payment.** Dana penjual tetap di marketplace sampai ditarik. Tidak ada batas waktu atau sweep; saldo yang tidak pernah ditarik menetap di kontrak.
7. **ETH paksa.** ETH bisa dikirim ke kontrak lewat `selfdestruct` sehingga saldo kontrak bisa lebih besar dari jumlah `pendingProceeds`. Invarian yang dijaga adalah `saldo >= Σ pendingProceeds`.
8. **Tanpa perlindungan front-running selain pembayaran tepat.** Jika penjual membatalkan lalu membuat listing baru dengan harga lain, transaksi beli yang sedang menunggu akan revert (`NotListed` atau `IncorrectPayment`).
9. **Tidak upgradeable.** Sama seperti TicketNFT.
10. **Reentrancy.** `buyListing` dan `withdrawProceeds` memakai `nonReentrant` dan memperbarui state sebelum panggilan eksternal. `transferByMarketplace` memakai `_transfer` internal (tanpa callback `onERC721Received`), sehingga pembeli kontrak tidak bisa masuk ulang lewat transfer NFT.

## Analisis Statis (Slither)

```bash
cd blockchain
slither . --filter-paths "node_modules|contracts/test"
```

Slither 0.11.6 menganalisis 29 kontrak dan melaporkan 13 deteksi. Seluruh deteksi sudah ditriase; rincian kategori, lokasi, dan alasan dicatat di `docs/security.md`. Tidak ada temuan Marketplace yang dibiarkan tanpa penjelasan. Slither mengembalikan exit code non-zero saat melaporkan deteksi; analisis dan output detector tetap selesai.
