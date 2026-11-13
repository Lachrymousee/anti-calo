import { tx, getState, setState } from '../db.js';
import { decodeLog } from './decode.js';
import { insertAndProject, rewindTo } from './handlers.js';

// Satu putaran sinkronisasi: baca log kontrak sampai (head - confirmations), terapkan per batch
// dalam satu transaksi database bersama checkpoint (blok + hash).
// interfaces: { [alamatKontrakHurufKecil]: ethers.Interface }
export async function syncOnce({ db, provider, interfaces, config }) {
  const addresses = Object.keys(interfaces);
  const head = await provider.getBlockNumber();
  const safe = head - config.confirmations;
  const startFloor = config.startBlock - 1;
  let last = Number(getState(db, 'last_block') ?? startFloor);
  let rewound = 0;

  const savedHash = getState(db, 'last_block_hash');
  if (savedHash && last >= 0) {
    const current = await provider.getBlock(last);
    if (!current || current.hash !== savedHash) {
      // Hash blok checkpoint berubah: chain mengalami reorg. Mundur reorgDepth blok lalu baca ulang.
      const to = Math.max(startFloor, last - config.reorgDepth);
      const toBlock = to >= 0 ? await provider.getBlock(to) : null;
      rewound = rewindTo(db, to);
      setState(db, 'last_block', to);
      setState(db, 'last_block_hash', toBlock?.hash ?? '');
      last = to;
    }
  }

  let processed = 0;
  let from = last + 1;
  while (from <= safe) {
    const to = Math.min(from + config.batchSize - 1, safe);
    const logs = await provider.getLogs({ address: addresses, fromBlock: from, toBlock: to });
    const events = [];
    for (const log of logs) {
      if (log.removed) continue;
      const iface = interfaces[String(log.address).toLowerCase()];
      const decoded = iface && decodeLog(iface, log);
      if (!decoded) continue;
      events.push({ id: `${log.transactionHash}:${log.index}`, blockNumber: log.blockNumber, logIndex: log.index,
        txHash: log.transactionHash, blockHash: log.blockHash, contract: log.address, ...decoded });
    }
    events.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
    const toBlock = await provider.getBlock(to);
    tx(db, () => {
      for (const e of events) insertAndProject(db, e);
      setState(db, 'last_block', to);
      setState(db, 'last_block_hash', toBlock.hash);
      setState(db, 'updated_at', new Date().toISOString());
    });
    processed += events.length;
    from = to + 1;
  }
  setState(db, 'head_block', head);
  return { head, safe, lastBlock: Math.max(last, from - 1), processed, rewound };
}
