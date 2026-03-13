import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const OPMRegistry = await ethers.getContractFactory("OPMRegistry");
  const registry = await OPMRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("OPMRegistry deployed to:", address);

  const agentKey = process.env.AGENT_PRIVATE_KEY;
  if (agentKey) {
    const agentWallet = new ethers.Wallet(agentKey);
    const tx = await registry.setAgent(agentWallet.address, true);
    await tx.wait();
    console.log("Authorized agent:", agentWallet.address);
  }

  console.log("\nAdd to .env:\nCONTRACT_ADDRESS=" + address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
