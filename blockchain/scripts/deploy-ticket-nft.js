const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Network : ${networkName}`);
  console.log(`Deployer: ${deployer.address} (becomes TicketNFT admin)`);
  console.log(`Balance : ${hre.ethers.formatEther(balance)} ETH`);

  const nft = await hre.ethers.deployContract("TicketNFT", [deployer.address]);
  await nft.waitForDeployment();
  const address = await nft.getAddress();
  const deployTx = nft.deploymentTransaction();
  const receipt = await deployTx.wait();

  console.log(`\nTicketNFT deployed!`);
  console.log(`  Address: ${address}`);
  console.log(`  Tx     : ${deployTx.hash}`);
  console.log(`  Block  : ${receipt.blockNumber}`);
  if (networkName === "sepolia") {
    console.log(`  Explorer: https://sepolia.etherscan.io/address/${address}`);
  }

  if (networkName === "hardhat") return;

  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  const outDir = path.join(__dirname, "..", "..", "shared", "deployments");
  const outPath = path.join(outDir, `${networkName}.json`);
  let data = { network: networkName, chainId, contracts: {} };
  if (fs.existsSync(outPath)) {
    data = JSON.parse(fs.readFileSync(outPath, "utf8"));
  }
  data.contracts.TicketNFT = {
    address,
    deployTx: deployTx.hash,
    blockNumber: receipt.blockNumber,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n");
  console.log(`\nRecorded in shared/deployments/${networkName}.json`);
  console.log(`Next: run \`npm run export-abi\` and share shared/abi/TicketNFT.json + the address with frontend.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
