"use client"

import { useEffect, useState } from "react"
import { Copy, Check } from "lucide-react"
import Image from "next/image"

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.opm.dev";
const GITHUB_URL = "https://github.com/dhananjaypai08/opm";
const NPM_URL = "https://www.npmjs.com/package/opmsec";
const CONTRACT = "0x16684391fc9bf48246B08Afe16d1a57BFa181d48";
const BASESCAN = `https://sepolia.basescan.org/address/${CONTRACT}`;

export default function OPMTerminal() {
  const [currentCommand, setCurrentCommand] = useState(0)
  const [showCursor, setShowCursor] = useState(true)
  const [matrixChars, setMatrixChars] = useState<string[]>([])
  const [terminalLines, setTerminalLines] = useState<string[]>([])
  const [currentTyping, setCurrentTyping] = useState("")
  const [isExecuting, setIsExecuting] = useState(false)
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({})

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedStates((prev) => ({ ...prev, [key]: true }))
      setTimeout(() => {
        setCopiedStates((prev) => ({ ...prev, [key]: false }))
      }, 2000)
    } catch (err) {
      console.error("Failed to copy text: ", err)
    }
  }

  const terminalSequences = [
    {
      command: "opm install package-name@djpai.eth",
      outputs: [
        "🔍 Resolving djpai.eth → 0x3a9f...c4e2",
        "📦 package-name@1.2.0 — on-chain score: 12 (LOW)",
        "✅ Signature verified · checksum matched",
        "🛡️  Installed securely via OPM",
      ],
    },
    {
      command: "opm push",
      outputs: [
        "📝 Signing with author wallet...",
        "🤖 Agent 1 (Claude) scanning... risk: 8",
        "🤖 Agent 2 (Gemini) scanning... risk: 11",
        "🤖 Agent 3 (DeepSeek) scanning... risk: 6",
        "⛓  Registered on Base Sepolia ✓",
      ],
    },
    {
      command: "opm register-agent --name sentinel --model gpt-5.4",
      outputs: [
        "🧪 Batch benchmark (10 cases, single call)...",
        "✅ Accuracy: 10/10 (100%)",
        "🔐 ZK proof generated & verified",
        "⛓  Agent registered on-chain ✓",
      ],
    },
  ]

  const heroAsciiText = `
 ██████╗ ██████╗ ███╗   ███╗
██╔═══██╗██╔══██╗████╗ ████║
██║   ██║██████╔╝██╔████╔██║
██║   ██║██╔═══╝ ██║╚██╔╝██║
╚██████╔╝██║     ██║ ╚═╝ ██║
 ╚═════╝ ╚═╝     ╚═╝     ╚═╝`.trim()

  useEffect(() => {
    const chars = "OPM01010101ABCDEF█▓▒░▄▀■□▪▫⛓🔐".split("")
    const newMatrixChars = Array.from({ length: 100 }, () => chars[Math.floor(Math.random() * chars.length)])
    setMatrixChars(newMatrixChars)

    const interval = setInterval(() => {
      setMatrixChars((prev) => prev.map(() => chars[Math.floor(Math.random() * chars.length)]))
    }, 1500)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const sequence = terminalSequences[currentCommand]
    const timeouts: NodeJS.Timeout[] = []

    const runSequence = async () => {
      setTerminalLines([])
      setCurrentTyping("")
      setIsExecuting(false)

      const command = sequence.command
      for (let i = 0; i <= command.length; i++) {
        timeouts.push(
          setTimeout(() => {
            setCurrentTyping(command.slice(0, i))
          }, i * 50),
        )
      }

      timeouts.push(
        setTimeout(() => {
          setIsExecuting(true)
          setCurrentTyping("")
          setTerminalLines((prev) => [...prev, `user@dev:~/project$ ${command}`])
        }, command.length * 50 + 500),
      )

      sequence.outputs.forEach((output, index) => {
        timeouts.push(
          setTimeout(() => {
            setTerminalLines((prev) => [...prev, output])
          }, command.length * 50 + 1000 + index * 800),
        )
      })

      timeouts.push(
        setTimeout(() => {
          setCurrentCommand((prev) => (prev + 1) % terminalSequences.length)
        }, command.length * 50 + 1000 + sequence.outputs.length * 800 + 2000),
      )
    }

    runSequence()
    return () => { timeouts.forEach(clearTimeout) }
  }, [currentCommand])

  return (
    <div className="min-h-screen bg-black text-white font-mono overflow-hidden relative">
      {/* Nav */}
      <nav className="border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm p-4 relative z-10 sticky top-0">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <div className="w-3 h-3 bg-red-500 hover:bg-red-400 transition-colors cursor-pointer"></div>
                <div className="w-3 h-3 bg-yellow-500 hover:bg-yellow-400 transition-colors cursor-pointer"></div>
                <div className="w-3 h-3 bg-green-500 hover:bg-green-400 transition-colors cursor-pointer"></div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-lg">OPM</span>
                <span className="text-gray-400 text-sm">on-chain package manager</span>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-8 ml-8">
              <a href="#why" className="text-gray-400 hover:text-white transition-colors cursor-pointer relative group">
                <span>Why OPM?</span>
                <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-white transition-all duration-300 group-hover:w-full"></div>
              </a>
              <a href="#features" className="text-gray-400 hover:text-white transition-colors cursor-pointer relative group">
                <span>Features</span>
                <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-white transition-all duration-300 group-hover:w-full"></div>
              </a>
              <a href="#agents" className="text-gray-400 hover:text-white transition-colors cursor-pointer relative group">
                <span>AI Agents</span>
                <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-white transition-all duration-300 group-hover:w-full"></div>
              </a>
              <a href="#cli" className="text-gray-400 hover:text-white transition-colors cursor-pointer relative group">
                <span>CLI</span>
                <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-white transition-all duration-300 group-hover:w-full"></div>
              </a>
              <a href={DOCS_URL} target="_blank" rel="noopener" className="text-gray-400 hover:text-white transition-colors cursor-pointer relative group">
                <span>Docs</span>
                <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-white transition-all duration-300 group-hover:w-full"></div>
              </a>
              <a href={BASESCAN} target="_blank" rel="noopener" className="text-gray-400 hover:text-white transition-colors cursor-pointer relative group flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span>Base Sepolia</span>
                <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-white transition-all duration-300 group-hover:w-full"></div>
              </a>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-gray-500 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>v0.1.3</span>
            </div>

            <div
              className="group relative cursor-pointer"
              onClick={() => copyToClipboard("npm install -g opmsec", "nav-install")}
            >
              <div className="absolute inset-0 border border-gray-600 bg-gray-900/20 transition-all duration-300 group-hover:border-white group-hover:shadow-lg group-hover:shadow-white/20"></div>
              <div className="relative border border-gray-400 bg-transparent text-white font-medium px-6 py-2 text-sm transition-all duration-300 group-hover:border-white group-hover:bg-gray-900/30 transform translate-x-0.5 translate-y-0.5 group-hover:translate-x-0 group-hover:translate-y-0">
                <div className="flex items-center gap-2">
                  {copiedStates["nav-install"] ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-gray-400">$</span>
                  <span>Install</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Matrix background */}
      <div className="fixed inset-0 opacity-10 pointer-events-none">
        <div className="grid grid-cols-25 gap-1 h-full">
          {matrixChars.map((char, i) => (
            <div key={i} className="text-gray-500 text-xs animate-pulse">
              {char}
            </div>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="relative px-6 py-20 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="mb-8">
              <pre className="text-white text-[10px] sm:text-sm md:text-xl lg:text-2xl font-bold leading-tight inline-block tracking-wide drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]">{heroAsciiText}</pre>
            </div>

            <h1 className="text-4xl lg:text-6xl font-bold mb-6 leading-tight">
              On-chain<br />
              <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Package Security</span>
            </h1>

            <p className="text-lg text-gray-300 leading-relaxed max-w-3xl mx-auto mb-8">
              Cryptographic attestation via ECDSA-signed manifests, multi-model AI auditing through
              intelligence-weighted LLM consensus, and immutable risk scoring anchored to Base L2.
              Zero-knowledge agent verification. Tamper-evident by design.
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <div
                className="group relative cursor-pointer w-full sm:w-auto"
                onClick={() => copyToClipboard("npm install -g opmsec", "hero-install")}
              >
                <div className="absolute inset-0 border border-gray-600 bg-gray-900/20 transition-all duration-300 group-hover:border-white group-hover:shadow-lg group-hover:shadow-white/20"></div>
                <div className="relative border border-white bg-white text-black font-bold px-6 sm:px-10 py-4 text-base sm:text-lg transition-all duration-300 group-hover:bg-gray-100 group-hover:text-black transform translate-x-1 translate-y-1 group-hover:translate-x-0 group-hover:translate-y-0 text-center">
                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    {copiedStates["hero-install"] ? (
                      <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    )}
                    <span className="text-gray-600 text-sm sm:text-base">$</span>
                    <span className="text-sm sm:text-base">npm install -g opmsec</span>
                  </div>
                </div>
              </div>

              <a href={DOCS_URL} target="_blank" rel="noopener" className="group relative cursor-pointer w-full sm:w-auto">
                <div className="absolute inset-0 border-2 border-dashed border-gray-600 bg-gray-900/20 transition-all duration-300 group-hover:border-white group-hover:shadow-lg group-hover:shadow-white/20"></div>
                <div className="relative border-2 border-dashed border-gray-400 bg-transparent text-white font-bold px-10 py-4 text-lg transition-all duration-300 group-hover:border-white group-hover:bg-gray-900/30 transform translate-x-1 translate-y-1 group-hover:translate-x-0 group-hover:translate-y-0">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400">→</span>
                    <span>Read the Docs</span>
                  </div>
                </div>
              </a>
            </div>
          </div>

          {/* Live terminal */}
          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-950 border border-gray-700 shadow-2xl backdrop-blur-sm">
              <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 bg-red-500 hover:bg-red-400 transition-colors cursor-pointer"></div>
                    <div className="w-3 h-3 bg-yellow-500 hover:bg-yellow-400 transition-colors cursor-pointer"></div>
                    <div className="w-3 h-3 bg-green-500 hover:bg-green-400 transition-colors cursor-pointer"></div>
                  </div>
                  <span className="text-gray-400 text-sm">opm-terminal</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-gray-500 text-xs">LIVE</span>
                </div>
              </div>

              <div className="p-6 min-h-[300px] bg-black">
                <div className="space-y-2 text-sm">
                  {terminalLines.map((line, index) => (
                    <div
                      key={index}
                      className={`${line.startsWith("user@dev") ? "text-white" : "text-gray-300"} ${line.includes("✅") || line.includes("✓") ? "text-green-400" : ""}`}
                    >
                      {line}
                    </div>
                  ))}

                  {!isExecuting && (
                    <div className="text-white">
                      <span className="text-green-400">user@dev</span>
                      <span className="text-gray-500">:</span>
                      <span className="text-blue-400">~/project</span>
                      <span className="text-white">$ </span>
                      <span className="text-white">{currentTyping}</span>
                      <span className={`text-white ${showCursor ? "opacity-100" : "opacity-0"} transition-opacity`}>█</span>
                    </div>
                  )}

                  {isExecuting && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <div className="flex gap-1">
                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                      </div>
                      <span className="text-xs">Processing...</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-gray-800 flex justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-4">
                    <span className="text-gray-500">Commands:</span>
                    <span className="text-white">{currentCommand + 1}/{terminalSequences.length}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-500">Agents:</span>
                    <span className="text-gray-500">3 Active</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-500">Chain:</span>
                    <span className="text-gray-500">Base Sepolia</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CLI heading below terminal */}
          <div className="text-center mt-12 mb-10 max-w-4xl mx-auto">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Every command, security-first.</h2>
            <p className="text-lg text-gray-400 max-w-3xl mx-auto">
              Drop-in replacement for npm. Every operation gains cryptographic verification, AI-powered auditing, and on-chain attestation transparently.
            </p>
          </div>

          {/* Command cards below terminal */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-10">
            {[
              { num: "01", title: "Push", desc: "ECDSA-sign package manifest, dispatch to 3 independent LLM agents for parallel static analysis, aggregate weighted risk scores, register immutable attestation on Base L2", cmd: "opm push" },
              { num: "02", title: "Install", desc: "Resolve ENS identity, verify ECDSA signature against on-chain registry, validate SHA-256 checksum, cross-reference OSV CVE database before extraction", cmd: "opm install <pkg>" },
              { num: "03", title: "Check", desc: "Traverse full dependency DAG, run Levenshtein-distance typosquat detection against top 10k packages, OSV CVE lookup, upload report to Fileverse (IPFS)", cmd: "opm check" },
            ].map((card) => (
              <div key={card.num} className="group relative h-full">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 transform rotate-1 group-hover:rotate-2 transition-transform duration-300"></div>
                <div className="relative bg-black border border-gray-700 p-6 h-full flex flex-col justify-between hover:border-white transition-all duration-300 group-hover:shadow-xl group-hover:shadow-white/10">
                  <div className="text-center flex-1 flex flex-col justify-between">
                    <div>
                      <div className="w-12 h-12 mx-auto mb-4 bg-gray-900 border border-gray-600 flex items-center justify-center group-hover:border-white transition-colors group-hover:bg-gray-800">
                        <span className="text-lg font-mono text-white group-hover:text-gray-100">{card.num}</span>
                      </div>
                      <h3 className="text-lg font-bold mb-3 text-white group-hover:text-gray-100">{card.title}</h3>
                      <p className="text-gray-400 mb-4 group-hover:text-gray-300 text-sm leading-relaxed">{card.desc}</p>
                    </div>
                    <div
                      className="bg-gray-900 border border-gray-700 p-2.5 font-mono text-xs text-left group-hover:border-gray-500 transition-colors group-hover:bg-gray-800 cursor-pointer flex items-center justify-between"
                      onClick={() => copyToClipboard(card.cmd, `${card.num}-cmd`)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">$ </span>
                        <span className="text-white group-hover:text-gray-100">{card.cmd}</span>
                      </div>
                      {copiedStates[`${card.num}-cmd`] ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-gray-400 hover:text-white transition-colors" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why OPM — Real incidents */}
      <section className="px-6 py-24 lg:px-12 border-t border-gray-800 relative overflow-hidden" id="why">
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/10 via-transparent to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-red-900/60 bg-red-950/30 text-red-400 text-xs font-mono tracking-widest uppercase mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Active Threat Landscape
            </div>
            <h2 className="text-4xl lg:text-6xl font-bold mb-6 leading-tight">
              This is happening<br />
              <span className="text-red-400">right now.</span>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Supply chain attacks on npm aren&apos;t theoretical. Developers are losing money, shipping CVEs, and installing malware — every single week.
            </p>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-800 max-w-4xl mx-auto mb-16">
            {[
              { num: "6,847", label: "Malicious packages", sub: "removed from npm in 2025" },
              { num: "$15M+", label: "Developer losses", sub: "from wallet drainer packages" },
              { num: "23%", label: "Projects affected", sub: "by known CVEs in deps" },
              { num: "4 hrs", label: "Avg time to detect", sub: "a supply chain attack" },
            ].map((stat, i) => (
              <div key={i} className="bg-black p-6 text-center group hover:bg-gray-950 transition-colors">
                <p className="text-2xl lg:text-3xl font-bold text-white mb-1 group-hover:text-red-400 transition-colors">{stat.num}</p>
                <p className="text-sm text-gray-300 font-medium">{stat.label}</p>
                <p className="text-xs text-gray-600 mt-1">{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* Incident cards */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 max-w-6xl mx-auto">
            {/* Large card — PhantomRaven attack */}
            <div className="md:col-span-7 group relative">
              <div className="absolute inset-0 bg-red-950/20 transform rotate-[0.5deg] group-hover:rotate-0 transition-transform duration-500" />
              <div className="relative bg-gray-950 border border-gray-800 group-hover:border-red-900/50 transition-all duration-500 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-xs text-gray-400 font-mono">cyberpress.org — March 2026</span>
                  </div>
                  <span className="text-[10px] text-red-400 font-mono tracking-wider uppercase">Supply Chain Attack</span>
                </div>
                <div className="relative aspect-[16/9] overflow-hidden">
                  <Image
                    src="/phantomraven-npm-attack.png"
                    alt="PhantomRaven malware targeting npm supply chain"
                    fill
                    className="object-cover object-top opacity-90 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-bold text-white mb-1">PhantomRaven Targets npm Supply Chain</h3>
                  <p className="text-sm text-gray-400">Malware campaign targeting developer secrets through typosquatted packages. Thousands of downloads before detection.</p>
                </div>
              </div>
            </div>

            {/* Right column — stacked */}
            <div className="md:col-span-5 flex flex-col gap-4">
              {/* Wallet drain */}
              <div className="group relative flex-1">
                <div className="relative bg-gray-950 border border-gray-800 group-hover:border-red-900/50 transition-all duration-500 overflow-hidden h-full">
                  <div className="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-xs text-gray-400 font-mono">@imanishbarnwal</span>
                    </div>
                    <span className="text-[10px] text-red-400 font-mono tracking-wider uppercase">Funds Lost</span>
                  </div>
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      src="/wallet-drain-exploit.png"
                      alt="Developer lost money from silent dev environment exploit"
                      fill
                      className="object-cover object-top opacity-90 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-gray-300 font-medium">&ldquo;I lost a significant amount of money due to a silent, zero-interaction dev environment exploit.&rdquo;</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row — 3 cards */}
            <div className="md:col-span-4 group relative">
              <div className="relative bg-gray-950 border border-gray-800 group-hover:border-orange-900/50 transition-all duration-500 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="text-xs text-gray-400 font-mono">@nextjs — 213K views</span>
                  </div>
                  <span className="text-[10px] text-orange-400 font-mono tracking-wider uppercase">CVE</span>
                </div>
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src="/nextjs-cve-announcement.png"
                    alt="Next.js critical CVE-2025-66478 announcement"
                    fill
                    className="object-cover object-top opacity-90 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-400">Critical vulnerability in React Server Components affecting Next.js. 213K+ views.</p>
                </div>
              </div>
            </div>

            <div className="md:col-span-4 group relative">
              <div className="relative bg-gray-950 border border-gray-800 group-hover:border-yellow-900/50 transition-all duration-500 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    <span className="text-xs text-gray-400 font-mono">@trashh_dev</span>
                  </div>
                  <span className="text-[10px] text-yellow-400 font-mono tracking-wider uppercase">React CVE</span>
                </div>
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src="/react-cve-meme.png"
                    alt="Developer reaction to React CVE announcement"
                    fill
                    className="object-cover object-top opacity-90 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-400">How developers react to yet another critical CVE in their dependency tree.</p>
                </div>
              </div>
            </div>

            <div className="md:col-span-4 group relative">
              <div className="relative bg-gray-950 border border-gray-800 group-hover:border-gray-600 transition-all duration-500 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-xs text-gray-400 font-mono">@arsh_goyal</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono tracking-wider uppercase">Reality Check</span>
                </div>
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src="/dependency-bottleneck.png"
                    alt="Dependency management is the bottleneck"
                    fill
                    className="object-cover object-top opacity-90 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-400">&ldquo;Code generation isn&apos;t the bottleneck anymore. Dependency management is.&rdquo;</p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA after incidents */}
          <div className="text-center mt-16">
            <div className="inline-flex flex-col items-center gap-4">
              <p className="text-lg text-gray-400">
                OPM catches these before they reach your <span className="text-white font-mono">node_modules</span>.
              </p>
              <div className="flex items-center gap-3 text-sm font-mono text-gray-500">
                <span className="text-green-400">$</span>
                <span className="text-white">npm install -g opmsec</span>
                <span className="text-gray-600">&&</span>
                <span className="text-white">opm install</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 lg:px-12 border-t border-gray-800" id="features">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold mb-6">Security Primitives</h2>
            <p className="text-xl text-gray-400">Defense in depth, by default.</p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-950 border border-gray-800 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 bg-red-500"></div>
                    <div className="w-3 h-3 bg-yellow-500"></div>
                    <div className="w-3 h-3 bg-green-500"></div>
                  </div>
                  <span className="text-gray-400 text-sm">opm features --list</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-gray-500 text-xs">6 ACTIVE</span>
                </div>
              </div>

              <div className="p-6 bg-black">
                <div className="text-sm text-gray-400 mb-4">$ opm features --scan</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-sm mb-6">
                  {[
                    { name: "multi-agent-consensus", status: "✓", desc: "N-of-M parallel LLM dispatch with intelligence-weighted aggregation via Artificial Analysis benchmarks. No single-model failure point." },
                    { name: "cryptographic-attestation", status: "✓", desc: "SHA-256 content-addressable checksums + secp256k1 ECDSA signatures. Tamper-evident supply chain attestation." },
                    { name: "zk-agent-verification", status: "✓", desc: "Hash-commitment ZK scheme with circom circuit reference. Accuracy proven without revealing labeled test data." },
                    { name: "on-chain-registry", status: "✓", desc: "OPMRegistry.sol: authorizedAgents, packages, versionData, AgentScores mappings. Fully queryable immutable state." },
                    { name: "cve-typosquat-detection", status: "✓", desc: "OSV advisory database integration + Levenshtein-distance analysis against top 10k npm packages. Dependency confusion detection." },
                    { name: "drop-in-npm-replacement", status: "✓", desc: "Transparent npm CLI interop: install, audit, check, push, fix — each operation layered with cryptographic verification." },
                  ].map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between py-2 px-3 hover:bg-gray-900 cursor-pointer group transition-all duration-200 border border-transparent hover:border-gray-700"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-green-400 group-hover:text-white transition-colors w-4">{f.status}</span>
                        <span className="text-white group-hover:text-gray-200 transition-colors">{f.name}</span>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 text-xs max-w-[250px] text-right">
                        {f.desc}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-gray-800">
                  <div className="flex items-center gap-4 text-xs text-gray-500 justify-center">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>6 Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span>Zero config</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Agents */}
      <section className="px-6 py-20 lg:px-12 border-t border-gray-800" id="agents">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold mb-6">Multi-Agent Consensus</h2>
            <p className="text-xl text-gray-400">N-of-M heterogeneous LLM ensemble with intelligence-weighted scoring derived from live Artificial Analysis quality and coding indices. Byzantine fault-tolerant by design.</p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-950 border border-gray-800 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 bg-red-500"></div>
                    <div className="w-3 h-3 bg-yellow-500"></div>
                    <div className="w-3 h-3 bg-green-500"></div>
                  </div>
                  <span className="text-gray-400 text-sm">opm agents --status</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-gray-500 text-xs">3 AUTHORIZED</span>
                </div>
              </div>

              <div className="p-6 bg-black">
                <div className="text-sm text-gray-400 mb-4">$ opm agents --list</div>

                <div className="space-y-2 font-mono text-sm">
                  {[
                    { id: "1", name: "claude-sonnet-4", provider: "anthropic", role: "Primary scanner", color: "text-green-400" },
                    { id: "2", name: "gemini-2.5-flash", provider: "google", role: "Secondary analysis", color: "text-green-400" },
                    { id: "3", name: "deepseek-chat", provider: "deepseek", role: "Tertiary verification", color: "text-green-400" },
                  ].map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between py-2 px-4 hover:bg-gray-900 cursor-pointer group transition-all duration-200 border border-transparent hover:border-gray-700"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-gray-500 w-6">[{agent.id}]</span>
                        <span className={`${agent.color} group-hover:text-white transition-colors`}>●</span>
                        <span className="text-white group-hover:text-gray-200 transition-colors">{agent.name}</span>
                        <span className="text-gray-500 text-xs">({agent.provider})</span>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 text-xs">
                        {agent.role}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-4 border-t border-gray-800">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="text-sm text-gray-400">
                      <div className="font-mono text-xs text-gray-500 space-y-1">
                        <div>$ opm register-agent --name my-agent --model gpt-5.4</div>
                        <div>$ opm info express  # View agent scores</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-xs text-gray-500">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>3 Active</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                        <span>ZK-verified</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center">
              <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
                <span className="text-green-400">●</span>
                <span>Permissionless registration • 100% benchmark accuracy required • Scores on-chain</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="px-6 py-16 lg:px-12 border-t border-gray-800" id="pipeline">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Verification Pipeline</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Five-stage cryptographic attestation pipeline: from ECDSA signing through multi-agent consensus to on-chain settlement. Every package is verified before extraction to node_modules.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-950 border border-gray-800 shadow-xl">
              <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 bg-red-500"></div>
                    <div className="w-3 h-3 bg-yellow-500"></div>
                    <div className="w-3 h-3 bg-green-500"></div>
                  </div>
                  <span className="text-gray-400 text-sm">opm pipeline --visualize</span>
                </div>
              </div>

              <div className="p-6 bg-black">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 font-mono text-sm">
                  {[
                    { step: "01", title: "Pack & Sign", desc: "SHA-256 content-addressable checksum + secp256k1 ECDSA signature via author wallet" },
                    { step: "02", title: "Multi-Agent Scan", desc: "Parallel dispatch to N heterogeneous LLMs; each submits independent risk vector" },
                    { step: "03", title: "Weighted Consensus", desc: "Intelligence-weighted aggregate via Artificial Analysis quality + coding indices" },
                    { step: "04", title: "On-chain Registry", desc: "Package metadata, agent scores, Fileverse report URI settled on Base Sepolia L2" },
                    { step: "05", title: "Install Verify", desc: "ECDSA signature + on-chain score lookup + OSV CVE cross-reference at extraction time" },
                  ].map((s, i) => (
                    <div key={i} className="relative group">
                      <div className="border border-gray-700 p-4 hover:border-white transition-all duration-300 group-hover:bg-gray-900">
                        <span className="text-xs text-gray-500 block mb-2">{s.step}</span>
                        <h3 className="text-sm font-semibold mb-1 text-white">{s.title}</h3>
                        <p className="text-xs text-gray-500">{s.desc}</p>
                      </div>
                      {i < 4 && (
                        <div className="hidden md:block absolute top-1/2 -right-2.5 w-5 h-px bg-gray-700" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contract info */}
      <section className="px-6 py-16 lg:px-12 border-t border-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Fully on-chain. Fully verifiable.</h2>
          <p className="text-gray-400 mb-8">OPMRegistry.sol deployed on Base Sepolia L2. Every package registration, agent score submission, ZK-verified agent authorization, and ENS-resolved author profile is an immutable on-chain record. Fully queryable, fully verifiable.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-800 mb-8">
            {[
              { label: "Packages", desc: "Registered" },
              { label: "Agent Scores", desc: "Submitted" },
              { label: "Authors", desc: "Verified" },
              { label: "Reports", desc: "On IPFS" },
            ].map((s, i) => (
              <div key={i} className="bg-black p-6">
                <p className="text-xs text-gray-500 mb-1">{s.desc}</p>
                <p className="text-sm font-semibold">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="inline-flex items-center gap-4">
            <a
              href={BASESCAN}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 text-sm font-mono text-gray-400 hover:text-white transition-colors px-4 py-2 border border-gray-700 hover:border-white"
            >
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              View on BaseScan
            </a>
            <a
              href={`${GITHUB_URL}/blob/main/packages/contracts/contracts/OPMRegistry.sol`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors px-4 py-2 border border-gray-700 hover:border-white"
            >
              Source Code
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-12 lg:px-12 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <span className="font-bold">OPM</span>
              <span className="text-xs text-gray-500">On-chain Package Manager</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href={DOCS_URL} target="_blank" rel="noopener" className="hover:text-white transition-colors">Docs</a>
              <a href={GITHUB_URL} target="_blank" rel="noopener" className="hover:text-white transition-colors">GitHub</a>
              <a href={NPM_URL} target="_blank" rel="noopener" className="hover:text-white transition-colors">npm</a>
              <a href={BASESCAN} target="_blank" rel="noopener" className="hover:text-white transition-colors">Contract</a>
            </div>
            <p className="text-xs text-gray-700">MIT License</p>
          </div>
        </div>
      </footer>
    </div>
  )
}