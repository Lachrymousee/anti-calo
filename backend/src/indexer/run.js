import { pathToFileURL } from 'node:url';
import { JsonRpcProvider, isAddress } from 'ethers';
import { loadConfig } from '../config.js';
import { openDb } from '../db.js';
import { loadInterface } from './decode.js';
import { syncOnce } from './sync.js';

export function buildInterfaces(config) {
  for (const [label, addr] of [['TICKET_NFT_ADDRESS', config.ticketAddress], ['MARKETPLACE_ADDRESS', config.marketplaceAddress]]) {
    if (!isAddress(addr)) throw new Error(`${label} belum diisi atau bukan alamat yang valid.`);
  }
  return {
    [config.ticketAddress.toLowerCase()]: loadInterface('TicketNFT'),
    [config.marketplaceAddress.toLowerCase()]: loadInterface('Marketplace'),
  };
}

// Polling berulang dengan backoff saat RPC gagal. Mengembalikan { stop }.
export function startIndexer({ db, provider, config, log = console }) {
  const interfaces = buildInterfaces(config);
  let stopped = false;
  let timer;
  let failures = 0;

  const loop = async () => {
    if (stopped) return;
    try {
      const r = await syncOnce({ db, provider, interfaces, config });
      failures = 0;
      if (r.processed || r.rewound) log.info(`[indexer] blok ${r.lastBlock}/${r.head}, ${r.processed} event baru, rewind ${r.rewound}`);
    } catch (err) {
      failures += 1;
      log.error(`[indexer] gagal (percobaan ${failures}): ${err.message}`);
    }
    if (!stopped) timer = setTimeout(loop, Math.min(config.pollMs * 2 ** failures, 60_000));
  };

  (async () => {
    try {
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== config.chainId) {
        throw new Error(`RPC berjalan di chain ${net.chainId}, sedangkan CHAIN_ID=${config.chainId}.`);
      }
      loop();
    } catch (err) {
      log.error(`[indexer] tidak dapat dimulai: ${err.message}`);
    }
  })();

  return { stop() { stopped = true; clearTimeout(timer); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  if (!config.rpcUrl) throw new Error('RPC_URL belum diisi.');
  const db = openDb(config.dbFile);
  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });
  const handle = startIndexer({ db, provider, config });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { handle.stop(); db.close(); process.exit(0); });
}
