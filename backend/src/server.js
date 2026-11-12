import { JsonRpcProvider } from 'ethers';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createApp } from './api/app.js';
import { startIndexer } from './indexer/run.js';

const config = loadConfig();
const db = openDb(config.dbFile);
const app = createApp({ db, config });
const server = app.listen(config.port, () => {
  console.log(`[api] anti-calo backend di http://localhost:${config.port} (auth: ${config.authMode})`);
});

// Indexer ikut berjalan di proses yang sama bila RPC dan alamat kontrak diisi.
let indexer;
if (config.rpcUrl && config.ticketAddress && config.marketplaceAddress) {
  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });
  indexer = startIndexer({ db, provider, config });
} else {
  console.log('[indexer] tidak aktif (RPC_URL / TICKET_NFT_ADDRESS / MARKETPLACE_ADDRESS belum diisi).');
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { indexer?.stop(); server.close(() => { db.close(); process.exit(0); }); });
}
