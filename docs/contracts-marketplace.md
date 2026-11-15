# Kontrak Marketplace

| Item | Nilai |
| --- | --- |
| Source / interface | `blockchain/contracts/Marketplace.sol`, `IMarketplace.sol` |
| ABI | `shared/abi/Marketplace.json`; ekspor ulang dengan `cd blockchain; npm run export-abi` |
| Compiler/library | Solidity 0.8.28, Cancun, optimizer 200; OpenZeppelin 5.6.1 |
| Mata uang | ETH |
| Alamat Sepolia | `0x0c11f7C21791a90F2A86A2263561417f96510cC9` |
| TicketNFT / fee | `0x093c1D62871Ecd9b2927155Dfee71a3e87A1cD14` / 500 bps (5%) |

Alamat, transaksi, dan pemberian role tercatat di [manifest deployment](../shared/deployments/sepolia.json). Admin TicketNFT telah memberi Marketplace `MARKETPLACE_ROLE`; verifikasi dilakukan pada Sepolia. Fee immutable, maksimum 1,000 bps.

## Aturan

- Marketplace tidak meng-escrow NFT. Listing `{seller, price}` tetap terikat pada tokenId.
- Harga harus `> 0` dan tidak melebihi `TicketNFT.getResaleCap(tokenId)`. Pembeli membayar tepat harga listing.
- Fee dihitung dari harga dengan pembulatan ke bawah dan dikirim ke Organizer; sisa dicatat sebagai `pendingProceeds` milik penjual.
- Penjual menarik saldo dengan `withdrawProceeds`. Tidak ada admin, pause, setter fee, atau enumerasi listing.
- Listing dapat menjadi stale jika tiket tidak transferable atau pemilik berubah. Cek status dengan `isTransferable` dan `ownerOf`.

## ABI ringkas

| Fungsi | Akses | Hasil |
| --- | --- | --- |
| `listTicket(tokenId,price)` | Pemilik tiket | Membuat listing dalam cap resale. Event `Listed`. |
| `cancelListing(tokenId)` | Penjual listing | Menghapus listing. Event `ListingCanceled`. |
| `buyListing(tokenId)` | Selain penjual, payable | Transfer tiket, alokasikan fee/proceeds. `msg.value` harus sama dengan harga. Event `Sold`. |
| `withdrawProceeds()` | Penjual dengan saldo | Tarik semua hasil jual. Event `ProceedsWithdrawn`. |
| `getListing(tokenId)` | publik | `{ seller, price }`; nol bila tak ada listing. |
| `pendingProceeds(seller)` | publik | Saldo penjual yang belum ditarik. |
| `quoteSale(price)` | publik | Fee dan hasil bersih penjual. |
| `ticketNft()`, `feeBps()`, `MAX_FEE_BPS()` | publik | Alamat kontrak tiket dan konfigurasi fee. |

Urutan validasi `buyListing`: listing ada, pembeli bukan penjual, pembayaran tepat, tiket transferable, dan pemilik masih penjual. Setelah itu kontrak mengkredit saldo, menghapus listing, memindahkan tiket melalui TicketNFT, mengirim fee, lalu emit `Sold`. Jika langkah eksternal gagal, seluruh transaksi revert.

`Listing` berisi `seller` dan `price`; `address(0)` berarti tidak ada listing. Penentuan listing aktif dari event log memerlukan `Listed` dikurangi event `ListingCanceled`/`Sold` untuk token yang sama. Penjualan juga menghasilkan ERC-721 `Transfer`.

## Fee dan contoh

Fee = `floor(price × feeBps / 10,000)`. `quoteSale` menghindari overflow untuk `uint256` maksimum. Dengan harga 0.011 ETH dan fee 5%, Organizer menerima 0.00055 ETH dan penjual menerima 0.01045 ETH. Pembeli tetap membayar 0.011 ETH.

Fee disimpan pada TicketNFT sebagai saldo event. Organizer menariknya melalui `TicketNFT.withdraw(eventId)` setelah event; jika event canceled, fee dapat ditarik sementara pendapatan primer tetap tersedia untuk refund.

## Error utama

| Error | Makna |
| --- | --- |
| `ZeroAddress`, `InvalidFee` | Alamat NFT nol atau fee deploy melebihi 10%. |
| `ZeroPrice`, `PriceAboveCap` | Harga tidak valid atau di atas cap resale. |
| `TicketNotTransferable`, `NotTicketHolder` | Tiket tak dapat dijual atau pemanggil bukan pemilik. |
| `AlreadyListed`, `NotListed`, `NotSeller` | Status listing tidak sesuai. |
| `CannotBuyOwnListing`, `IncorrectPayment` | Penjual membeli sendiri atau pembayaran tidak tepat. |
| `StaleListing` | Pemilik tiket berbeda dari penjual listing. |
| `NoProceeds`, `EthTransferFailed` | Tidak ada saldo atau penarikan gagal. |

Error dari TicketNFT dapat muncul langsung, termasuk `AccessControlUnauthorizedAccount` jika role Marketplace dicabut. Decoder frontend sebaiknya memeriksa kedua ABI.

## Integrasi dan deployment

- Listing tidak memerlukan `approve`; TicketNFT mematikan approval dan Marketplace tidak menahan NFT.
- Cap dihitung dari harga primer dan tetap berlaku setelah tiket dijual kembali.
- Penjual kontrak yang menolak ETH tetap dapat menerima hasil jual; kegagalan hanya terjadi saat menarik.
- Re-deploy Marketplace diperlukan untuk mengubah fee atau memperbaiki bug. Admin kemudian harus memberi role kepada alamat baru dan mencabut role lama.
- Untuk Remix, deploy dengan `(ticketNftAddress, 500)`.

## Tes dan risiko

```powershell
cd blockchain
npm ci
npm test
npm run coverage
```

Suite kontrak: 89 tes lulus; Marketplace memiliki 35 tes khusus. Risiko: keamanan transfer bergantung pada Marketplace ber-role, listing lama dapat aktif kembali jika tiket kembali ke penjual lama, proceeds yang tak ditarik menetap di kontrak, dan implementasi tidak upgradeable. ETH paksa dapat membuat saldo kontrak lebih besar dari total proceeds tanpa mengurangi klaim pengguna.

Slither 0.11.6 menemukan 13 deteksi pada 29 kontrak; semuanya ditriase di [docs/security.md](./security.md). Deteksi bukan pengganti audit.
