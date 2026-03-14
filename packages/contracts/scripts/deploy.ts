import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const OPMRegistry = await ethers.getContractFactory("OPMRegistry");
  const registry = await OPMRegistry.deploy();
  const deployTx = registry.deploymentTransaction();
  if (deployTx) {
    console.log("Deploy tx:", deployTx.hash);
    await deployTx.wait(2);
  }
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("OPMRegistry deployed to:", address);

  const agentKey = process.env.AGENT_PRIVATE_KEY;
  if (agentKey) {
    const agentWallet = new ethers.Wallet(agentKey);
    console.log("Authorizing agent:", agentWallet.address);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const tx = await registry.setAgent(agentWallet.address, true);
        await tx.wait(2);
        console.log("Authorized agent:", agentWallet.address);
        break;
      } catch (err: any) {
        if (attempt < 2 && err?.message?.includes("nonce")) {
          console.log(`Nonce conflict, retrying (${attempt + 1}/3)...`);
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          throw err;
        }
      }
    }
  }

  console.log("\nAdd to .env:\nCONTRACT_ADDRESS=" + address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
