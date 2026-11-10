# Hasil Analisis Statis Marketplace

Perintah yang dijalankan dari `blockchain/`:

```bash
slither . --filter-paths "node_modules|contracts/test"
```

Slither 0.11.6 menganalisis 29 kontrak dengan 102 detector dan melaporkan 13 deteksi. Hasil di bawah mencakup temuan dari `TicketNFT.sol` yang sudah ada; file TicketNFT tidak diubah. Deteksi bukan pengganti audit keamanan.

| Detector | Lokasi | Triase |
| --- | --- | --- |
| `divide-before-multiply` | `Marketplace._quoteSale` | Disengaja. Perhitungan dipecah menjadi hasil bagi dan sisa agar `quoteSale` tidak overflow untuk nilai `uint256` apa pun. Hasilnya tetap sama dengan `floor(price * feeBps / 10_000)`; test mencakup `uint256` maksimum. |
| `low-level-calls` | `Marketplace.withdrawProceeds` | Disengaja untuk pull payment. Tujuan selalu `msg.sender`, saldo di-nol-kan sebelum call, fungsi `nonReentrant`, hasil call diperiksa, dan kegagalan me-revert sehingga saldo dipulihkan. |
| `naming-convention` | `IMarketplace.MAX_FEE_BPS` | Disengaja. Nama uppercase dipertahankan sebagai getter konstanta publik sesuai interface/spec. |
| `arbitrary-send-eth` | `TicketNFT._sendEth` | Kode existing di luar perubahan Marketplace. Fungsi mengirim refund/withdraw ke penerima yang ditentukan oleh alur kontrak; kegagalan diperiksa. |
| `uninitialized-local` | `TicketNFT.claimRefund` | Kode existing di luar perubahan Marketplace. `amount` ditetapkan pada tiap cabang yang dapat selesai; cabang lainnya revert. |
| `timestamp` (7 deteksi) | `TicketNFT.createEvent`, `updateEvent`, `cancelEvent`, `buyTicket`, `revokeTicket`, `withdraw`, `isTransferable` | Kode existing di luar perubahan Marketplace. Waktu block memang menjadi sumber kebenaran untuk jendela penjualan, pembatalan, transferabilitas, dan penarikan. |
| `low-level-calls` | `TicketNFT._sendEth` | Kode existing di luar perubahan Marketplace; pola pembayaran diperiksa melalui nilai balik call. |

Tidak ada `arbitrary-send-eth` atau temuan `reentrancy` pada Marketplace dalam output ini. Slither berakhir dengan status non-zero setelah menampilkan deteksi; semua 13 deteksi di atas sudah ditriase.
