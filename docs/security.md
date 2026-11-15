# Analisis statis

Perintah dijalankan dari `blockchain/` dengan Slither 0.11.6:

```bash
slither . --filter-paths "node_modules|contracts/test"
```

Slither menganalisis 29 kontrak memakai 102 detector dan melaporkan 13 temuan. Temuan bukan pengganti audit.

| Detector | Lokasi | Triase |
| --- | --- | --- |
| `divide-before-multiply` | `Marketplace._quoteSale` | Perhitungan pecahan menghindari overflow dan tetap menghasilkan `floor(price × feeBps / 10,000)`; batas `uint256` diuji. |
| `low-level-calls` (2) | `Marketplace.withdrawProceeds`, `TicketNFT._sendEth` | Pull payment; penerima ditentukan alur kontrak, state diperbarui sebelum call, hasil diperiksa, dan kegagalan me-revert. Marketplace juga memakai `nonReentrant`. |
| `naming-convention` | `IMarketplace.MAX_FEE_BPS` | Getter konstanta publik sengaja memakai nama uppercase. |
| `arbitrary-send-eth` | `TicketNFT._sendEth` | Penerima berasal dari alur refund/withdraw yang ditentukan kontrak; hasil transfer diperiksa. |
| `uninitialized-local` | `TicketNFT.claimRefund` | Semua cabang sukses menetapkan `amount`; cabang lain revert. |
| `timestamp` (7) | Fungsi lifecycle TicketNFT | `block.timestamp` menjadi sumber waktu untuk penjualan, event, pembatalan, transfer, dan penarikan. |

Temuan terkait TicketNFT juga dirangkum di [dokumentasi kontrak](./contracts.md). Slither dapat mengembalikan exit code non-zero saat melaporkan detector.
