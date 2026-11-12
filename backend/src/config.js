// Konfigurasi dibaca dari environment. Semua nilai bersifat publik kecuali yang tidak ada di sini:
// backend ini tidak pernah membutuhkan private key.
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const authMode = env.AUTH_MODE || (nodeEnv === 'production' ? 'signature' : 'dev');
  if (!['dev', 'signature'].includes(authMode)) throw new Error('AUTH_MODE harus dev atau signature.');
  if (nodeEnv === 'production' && authMode === 'dev') {
    throw new Error('AUTH_MODE=dev tidak boleh dipakai pada production.');
  }
  return {
    nodeEnv,
    authMode,
    authTtlSeconds: int(env.AUTH_TTL_SECONDS, 300),
    port: int(env.PORT, 3001),
    dbFile: env.DB_FILE || './data/anti-calo.db',
    uploadDir: env.UPLOAD_DIR || './data/uploads',
    maxPosterBytes: int(env.MAX_POSTER_BYTES, 2 * 1024 * 1024),
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    rpcUrl: env.RPC_URL || '',
    chainId: int(env.CHAIN_ID, 11155111),
    ticketAddress: env.TICKET_NFT_ADDRESS || '',
    marketplaceAddress: env.MARKETPLACE_ADDRESS || '',
    startBlock: int(env.START_BLOCK, 0),
    confirmations: int(env.CONFIRMATIONS, 3),
    batchSize: int(env.BATCH_SIZE, 2000),
    pollMs: int(env.POLL_INTERVAL_MS, 5000),
    reorgDepth: int(env.REORG_DEPTH, 12),
  };
}
