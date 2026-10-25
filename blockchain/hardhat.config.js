require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("solidity-coverage");

// Local test configuration only. Network/deployer settings (Sepolia RPC, keys
// from environment variables) are added by the deployment owner (Member 2).
// Never put a private key in this file.

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // OpenZeppelin 5.6 uses the `mcopy` opcode. Sepolia supports Cancun.
      evmVersion: "cancun",
    },
  },
};
