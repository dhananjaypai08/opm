// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract OPMRegistry {
    struct AuthorProfile {
        address addr;
        string ensName;
        uint256 reputationTotal;
        uint256 reputationCount;
        uint256 packagesPublished;
    }

    struct AgentScore {
        address agent;
        uint8 riskScore;
        string reasoning;
    }

    struct VersionData {
        address author;
        bytes32 checksum;
        bytes signature;
        string reportURI;
        AgentScore[] scores;
        bool exists;
    }

    struct Package {
        string name;
        string[] versions;
        bool exists;
    }

    address public owner;
    mapping(address => bool) public authorizedAgents;
    mapping(address => AuthorProfile) public authors;
    mapping(bytes32 => address) public ensToAuthor;
    mapping(bytes32 => Package) internal packages;
    mapping(bytes32 => mapping(bytes32 => VersionData)) internal versionData;
    mapping(address => bytes32[]) internal authorPackages;

    uint8 public constant HIGH_RISK_THRESHOLD = 70;
    uint8 public constant MEDIUM_RISK_THRESHOLD = 40;

    event PackageRegistered(string name, string version, address author, string ensName);
    event ScoreSubmitted(string name, string version, address agent, uint8 riskScore, string reasoning);
    event ReportURISet(string name, string version, string uri);
    event AuthorRegistered(address addr, string ensName);
    event AgentAuthorized(address agent, bool status);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAgent() {
        require(authorizedAgents[msg.sender], "Not authorized agent");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setAgent(address agent, bool status) external onlyOwner {
        authorizedAgents[agent] = status;
        emit AgentAuthorized(agent, status);
    }

    function registerPackage(
        string calldata name,
        string calldata version,
        bytes32 checksum,
        bytes calldata sig,
        string calldata ensName
    ) external {
        bytes32 nameHash = keccak256(bytes(name));
        bytes32 versionHash = keccak256(bytes(version));

        require(!versionData[nameHash][versionHash].exists, "Version already registered");

        if (!packages[nameHash].exists) {
            packages[nameHash].name = name;
            packages[nameHash].exists = true;
        }
        packages[nameHash].versions.push(version);

        VersionData storage vd = versionData[nameHash][versionHash];
        vd.author = msg.sender;
        vd.checksum = checksum;
        vd.signature = sig;
        vd.exists = true;

        if (authors[msg.sender].addr == address(0)) {
            authors[msg.sender].addr = msg.sender;
            authors[msg.sender].ensName = ensName;
            if (bytes(ensName).length > 0) {
                ensToAuthor[keccak256(bytes(ensName))] = msg.sender;
            }
            emit AuthorRegistered(msg.sender, ensName);
        }
        authors[msg.sender].packagesPublished++;
        authorPackages[msg.sender].push(nameHash);

        emit PackageRegistered(name, version, msg.sender, ensName);
    }

    function submitScore(
        string calldata name,
        string calldata version,
        uint8 riskScore,
        string calldata reasoning
    ) external onlyAgent {
        bytes32 nameHash = keccak256(bytes(name));
        bytes32 versionHash = keccak256(bytes(version));
        require(versionData[nameHash][versionHash].exists, "Version not found");

        AgentScore[] storage scores = versionData[nameHash][versionHash].scores;
        for (uint256 i = 0; i < scores.length; i++) {
            require(scores[i].agent != msg.sender, "Agent already scored");
        }

        scores.push(AgentScore({
            agent: msg.sender,
            riskScore: riskScore,
            reasoning: reasoning
        }));

        authors[versionData[nameHash][versionHash].author].reputationTotal += riskScore;
        authors[versionData[nameHash][versionHash].author].reputationCount++;

        emit ScoreSubmitted(name, version, msg.sender, riskScore, reasoning);
    }

    function setReportURI(
        string calldata name,
        string calldata version,
        string calldata uri
    ) external onlyAgent {
        bytes32 nameHash = keccak256(bytes(name));
        bytes32 versionHash = keccak256(bytes(version));
        require(versionData[nameHash][versionHash].exists, "Version not found");
        versionData[nameHash][versionHash].reportURI = uri;
        emit ReportURISet(name, version, uri);
    }

    function getAggregateScore(string calldata name, string calldata version) external view returns (uint8) {
        bytes32 nameHash = keccak256(bytes(name));
        bytes32 versionHash = keccak256(bytes(version));
        AgentScore[] storage scores = versionData[nameHash][versionHash].scores;
        if (scores.length == 0) return 0;

        uint256 total = 0;
        for (uint256 i = 0; i < scores.length; i++) {
            total += scores[i].riskScore;
        }
        return uint8(total / scores.length);
    }

    function getSafestVersion(string calldata name, uint8 lookback) external view returns (string memory) {
        bytes32 nameHash = keccak256(bytes(name));
        require(packages[nameHash].exists, "Package not found");

        string[] storage vers = packages[nameHash].versions;
        uint256 start = vers.length > lookback ? vers.length - lookback : 0;
        uint256 bestScore = type(uint256).max;
        string memory bestVersion = "";

        for (uint256 i = start; i < vers.length; i++) {
            bytes32 vh = keccak256(bytes(vers[i]));
            AgentScore[] storage scores = versionData[nameHash][vh].scores;
            if (scores.length == 0) continue;

            uint256 total = 0;
            for (uint256 j = 0; j < scores.length; j++) {
                total += scores[j].riskScore;
            }
            uint256 avg = total / scores.length;
            if (avg < bestScore) {
                bestScore = avg;
                bestVersion = vers[i];
            }
        }
        return bestVersion;
    }

    function getPackageInfo(
        string calldata name,
        string calldata version
    ) external view returns (
        address author,
        bytes32 checksum,
        bytes memory sig,
        string memory ensName,
        string memory reportURI,
        uint8 aggregateScore,
        bool exists
    ) {
        bytes32 nameHash = keccak256(bytes(name));
        bytes32 versionHash = keccak256(bytes(version));
        VersionData storage vd = versionData[nameHash][versionHash];

        if (!vd.exists) {
            return (address(0), bytes32(0), "", "", "", 0, false);
        }

        uint256 total = 0;
        for (uint256 i = 0; i < vd.scores.length; i++) {
            total += vd.scores[i].riskScore;
        }
        uint8 avgScore = vd.scores.length > 0 ? uint8(total / vd.scores.length) : 0;

        return (
            vd.author,
            vd.checksum,
            vd.signature,
            authors[vd.author].ensName,
            vd.reportURI,
            avgScore,
            true
        );
    }

    function getScores(
        string calldata name,
        string calldata version
    ) external view returns (AgentScore[] memory) {
        bytes32 nameHash = keccak256(bytes(name));
        bytes32 versionHash = keccak256(bytes(version));
        return versionData[nameHash][versionHash].scores;
    }

    function getVersions(string calldata name) external view returns (string[] memory) {
        bytes32 nameHash = keccak256(bytes(name));
        return packages[nameHash].versions;
    }

    function getAuthorByAddress(address addr) external view returns (AuthorProfile memory) {
        return authors[addr];
    }

    function getAuthorByENS(string calldata ensName) external view returns (AuthorProfile memory) {
        address addr = ensToAuthor[keccak256(bytes(ensName))];
        require(addr != address(0), "ENS not found");
        return authors[addr];
    }

    function getAuthorReputation(address addr) external view returns (uint256) {
        AuthorProfile storage a = authors[addr];
        if (a.reputationCount == 0) return 0;
        return a.reputationTotal / a.reputationCount;
    }
}
