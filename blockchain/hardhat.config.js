require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("solidity-coverage");
const { vars } = require("hardhat/config");





const SEPOLIA_RPC_URL = vars.get("SEPOLIA_RPC_URL", "");
const DEPLOYER_PRIVATE_KEY = vars.get("DEPLOYER_PRIVATE_KEY", "");


module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },

      evmVersion: "cancun",
    },
  },
  networks: {


    ...(SEPOLIA_RPC_URL && DEPLOYER_PRIVATE_KEY
      ? {
          sepolia: {
            url: SEPOLIA_RPC_URL,
            chainId: 11155111,
            accounts: [DEPLOYER_PRIVATE_KEY],
          },
        }
      : {}),
  },
};
