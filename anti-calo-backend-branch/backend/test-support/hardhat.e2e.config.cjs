// Konfigurasi Hardhat khusus tes E2E backend: hanya menjalankan node lokal.
// Task compile dinonaktifkan karena kontrak dikompilasi oleh test-support/compile.mjs (solc-js).
const { task } = require('../../blockchain/node_modules/hardhat/config');
task('compile', 'dinonaktifkan untuk E2E').setAction(async () => {});
module.exports = { solidity: '0.8.28', networks: { hardhat: { chainId: 31337, mining: { auto: true } } } };
