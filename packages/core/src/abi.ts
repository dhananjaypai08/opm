export const OPM_REGISTRY_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "agent",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "status",
        "type": "bool"
      }
    ],
    "name": "AgentAuthorized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "addr",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "ensName",
        "type": "string"
      }
    ],
    "name": "AuthorRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "author",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "ensName",
        "type": "string"
      }
    ],
    "name": "PackageRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "uri",
        "type": "string"
      }
    ],
    "name": "ReportURISet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "agent",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "riskScore",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "reasoning",
        "type": "string"
      }
    ],
    "name": "ScoreSubmitted",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "HIGH_RISK_THRESHOLD",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MEDIUM_RISK_THRESHOLD",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "authorizedAgents",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "authors",
    "outputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "ensName",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "reputationTotal",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "reputationCount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "packagesPublished",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "ensToAuthor",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      }
    ],
    "name": "getAggregateScore",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "getAuthorByAddress",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "addr",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "ensName",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "reputationTotal",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "reputationCount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "packagesPublished",
            "type": "uint256"
          }
        ],
        "internalType": "struct OPMRegistry.AuthorProfile",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "ensName",
        "type": "string"
      }
    ],
    "name": "getAuthorByENS",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "addr",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "ensName",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "reputationTotal",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "reputationCount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "packagesPublished",
            "type": "uint256"
          }
        ],
        "internalType": "struct OPMRegistry.AuthorProfile",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "getAuthorReputation",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      }
    ],
    "name": "getPackageInfo",
    "outputs": [
      {
        "internalType": "address",
        "name": "author",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "checksum",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "sig",
        "type": "bytes"
      },
      {
        "internalType": "string",
        "name": "ensName",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "reportURI",
        "type": "string"
      },
      {
        "internalType": "uint8",
        "name": "aggregateScore",
        "type": "uint8"
      },
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "uint8",
        "name": "lookback",
        "type": "uint8"
      }
    ],
    "name": "getSafestVersion",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      }
    ],
    "name": "getScores",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "agent",
            "type": "address"
          },
          {
            "internalType": "uint8",
            "name": "riskScore",
            "type": "uint8"
          },
          {
            "internalType": "string",
            "name": "reasoning",
            "type": "string"
          }
        ],
        "internalType": "struct OPMRegistry.AgentScore[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      }
    ],
    "name": "getVersions",
    "outputs": [
      {
        "internalType": "string[]",
        "name": "",
        "type": "string[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "internalType": "bytes32",
        "name": "checksum",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "sig",
        "type": "bytes"
      },
      {
        "internalType": "string",
        "name": "ensName",
        "type": "string"
      }
    ],
    "name": "registerPackage",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "agent",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "status",
        "type": "bool"
      }
    ],
    "name": "setAgent",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "uri",
        "type": "string"
      }
    ],
    "name": "setReportURI",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "internalType": "uint8",
        "name": "riskScore",
        "type": "uint8"
      },
      {
        "internalType": "string",
        "name": "reasoning",
        "type": "string"
      }
    ],
    "name": "submitScore",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
