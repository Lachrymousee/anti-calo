// Copies the compiled TicketNFT ABI to ../shared/abi/TicketNFT.json for frontend/backend/indexer.
// Usage (from blockchain/): npm run export-abi
const fs = require("fs");
const path = require("path");

const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "TicketNFT.sol", "TicketNFT.json");
const outDir = path.join(__dirname, "..", "..", "shared", "abi");
const outPath = path.join(outDir, "TicketNFT.json");

if (!fs.existsSync(artifactPath)) {
  console.error("Artifact not found. Run `npx hardhat compile` first.");
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const output = {
  contractName: artifact.contractName,
  sourceName: artifact.sourceName,
  abi: artifact.abi,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${artifact.abi.length} ABI entries)`);
