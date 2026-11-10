// Copies compiled ABIs to ../shared/abi/<Name>.json for frontend/backend/indexer.
// Exports TicketNFT and Marketplace. A contract is skipped (with a notice) only while its
// source file does not exist yet; if the source exists but the artifact is missing, it fails.
// Usage (from blockchain/): npm run export-abi
const fs = require("fs");
const path = require("path");

const CONTRACTS = ["TicketNFT", "Marketplace"];
const outDir = path.join(__dirname, "..", "..", "shared", "abi");

let failed = false;
fs.mkdirSync(outDir, { recursive: true });

for (const name of CONTRACTS) {
  const sourcePath = path.join(__dirname, "..", "contracts", `${name}.sol`);
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  const outPath = path.join(outDir, `${name}.json`);

  if (!fs.existsSync(sourcePath)) {
    console.log(`Skipped ${name}: contracts/${name}.sol not found yet`);
    continue;
  }
  if (!fs.existsSync(artifactPath)) {
    console.error(`Artifact for ${name} not found. Run \`npx hardhat compile\` first.`);
    failed = true;
    continue;
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const output = {
    contractName: artifact.contractName,
    sourceName: artifact.sourceName,
    abi: artifact.abi,
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${artifact.abi.length} ABI entries)`);
}

if (failed) process.exit(1);
