import { expect } from "chai";
import { ethers } from "hardhat";

describe("OPMRegistry", function () {
  async function deploy() {
    const [owner, agent, author, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("OPMRegistry");
    const registry = await Factory.deploy();
    await registry.waitForDeployment();
    await registry.setAgent(agent.address, true);
    return { registry, owner, agent, author, other };
  }

  it("should register a package", async function () {
    const { registry, author } = await deploy();
    const checksum = ethers.keccak256(ethers.toUtf8Bytes("test-checksum"));
    const sig = ethers.toUtf8Bytes("test-sig");

    await registry.connect(author).registerPackage("my-pkg", "1.0.0", checksum, sig, "author.eth");

    const info = await registry.getPackageInfo("my-pkg", "1.0.0");
    expect(info.exists).to.be.true;
    expect(info.author).to.equal(author.address);
    expect(info.ensName).to.equal("author.eth");
  });

  it("should prevent duplicate version registration", async function () {
    const { registry, author } = await deploy();
    const checksum = ethers.keccak256(ethers.toUtf8Bytes("test"));
    const sig = ethers.toUtf8Bytes("sig");

    await registry.connect(author).registerPackage("my-pkg", "1.0.0", checksum, sig, "");
    await expect(
      registry.connect(author).registerPackage("my-pkg", "1.0.0", checksum, sig, "")
    ).to.be.revertedWith("Version already registered");
  });

  it("should submit and aggregate scores", async function () {
    const { registry, agent, author } = await deploy();
    const checksum = ethers.keccak256(ethers.toUtf8Bytes("test"));
    const sig = ethers.toUtf8Bytes("sig");

    await registry.connect(author).registerPackage("my-pkg", "1.0.0", checksum, sig, "");
    await registry.connect(agent).submitScore("my-pkg", "1.0.0", 30, "Looks safe");

    const score = await registry.getAggregateScore("my-pkg", "1.0.0");
    expect(score).to.equal(30);
  });

  it("should reject score from unauthorized caller", async function () {
    const { registry, author, other } = await deploy();
    const checksum = ethers.keccak256(ethers.toUtf8Bytes("test"));
    const sig = ethers.toUtf8Bytes("sig");

    await registry.connect(author).registerPackage("my-pkg", "1.0.0", checksum, sig, "");
    await expect(
      registry.connect(other).submitScore("my-pkg", "1.0.0", 50, "test")
    ).to.be.revertedWith("Not authorized agent");
  });

  it("should find safest version", async function () {
    const { registry, agent, author } = await deploy();
    const checksum = ethers.keccak256(ethers.toUtf8Bytes("c"));
    const sig = ethers.toUtf8Bytes("s");

    await registry.connect(author).registerPackage("pkg", "1.0.0", checksum, sig, "");
    await registry.connect(author).registerPackage("pkg", "1.1.0", checksum, sig, "");
    await registry.connect(author).registerPackage("pkg", "2.0.0", checksum, sig, "");

    await registry.connect(agent).submitScore("pkg", "1.0.0", 60, "risky");
    await registry.connect(agent).submitScore("pkg", "1.1.0", 20, "clean");
    await registry.connect(agent).submitScore("pkg", "2.0.0", 45, "moderate");

    const safest = await registry.getSafestVersion("pkg", 3);
    expect(safest).to.equal("1.1.0");
  });

  it("should set report URI", async function () {
    const { registry, agent, author } = await deploy();
    const checksum = ethers.keccak256(ethers.toUtf8Bytes("c"));
    const sig = ethers.toUtf8Bytes("s");

    await registry.connect(author).registerPackage("pkg", "1.0.0", checksum, sig, "");
    await registry.connect(agent).setReportURI("pkg", "1.0.0", "ipfs://Qm123");

    const info = await registry.getPackageInfo("pkg", "1.0.0");
    expect(info.reportURI).to.equal("ipfs://Qm123");
  });

  it("should track ENS to author mapping", async function () {
    const { registry, author } = await deploy();
    const checksum = ethers.keccak256(ethers.toUtf8Bytes("c"));
    const sig = ethers.toUtf8Bytes("s");

    await registry.connect(author).registerPackage("pkg", "1.0.0", checksum, sig, "dev.eth");

    const profile = await registry.getAuthorByENS("dev.eth");
    expect(profile.addr).to.equal(author.address);
    expect(profile.ensName).to.equal("dev.eth");
  });
});
