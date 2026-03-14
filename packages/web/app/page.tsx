'use client';

import { useEffect, useState } from 'react';

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL;
if (!DOCS_URL) {
  throw new Error('NEXT_PUBLIC_DOCS_URL is not set');
}
const GITHUB_URL = 'https://github.com/dhananjaypai08/opm';
const NPM_URL = 'https://www.npmjs.com/package/opmsec';
const CONTRACT = '0x16684391fc9bf48246B08Afe16d1a57BFa181d48';
const BASESCAN = `https://sepolia.basescan.org/address/${CONTRACT}`;

function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
      <rect width="32" height="32" rx="6" fill="#ededed" />
      <path d="M8 10L12 22L16 13L20 22L24 10" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="24" r="1.5" fill="#16a34a" />
    </svg>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'bg-bg/80 backdrop-blur-xl border-b border-border' : ''}`}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <Logo size={24} />
          <span className="text-lg font-semibold tracking-tight">opm</span>
          <span className="text-[10px] font-mono text-muted bg-surface px-1.5 py-0.5 rounded border border-border">v0.1.3</span>
        </a>
        <div className="flex items-center gap-8">
          <a href="#features" className="text-sm text-muted hover:text-accent transition-colors">Features</a>
          <a href="#cli" className="text-sm text-muted hover:text-accent transition-colors">CLI</a>
          <a href={DOCS_URL} target="_blank" rel="noopener" className="text-sm text-muted hover:text-accent transition-colors">Docs</a>
          <a href={NPM_URL} target="_blank" rel="noopener" className="text-sm text-muted hover:text-accent transition-colors">npm</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener" className="text-sm text-muted hover:text-accent transition-colors">GitHub</a>
          <a href={BASESCAN} target="_blank" rel="noopener" className="text-sm font-mono text-muted hover:text-accent transition-colors flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Base Sepolia
          </a>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center grid-bg overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-radial from-white/[0.02] to-transparent animate-glow-pulse" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <div className="animate-fade-in">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-muted mb-8 px-3 py-1.5 rounded-full border border-border bg-surface/50">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Secured by multi-agent consensus on Base L2
          </div>
        </div>

        <h1 className="text-6xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-6 animate-slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'backwards' }}>
          On-chain<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/40">
            Package Security
          </span>
        </h1>

        <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-12 leading-relaxed animate-slide-up" style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}>
          Cryptographic attestation, multi-model AI auditing, and immutable risk scoring for every npm package. All verified on-chain.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.5s', animationFillMode: 'backwards' }}>
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-white/20 to-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
            <code className="relative flex items-center gap-3 bg-surface border border-border rounded-lg px-5 py-3 font-mono text-sm cursor-pointer hover:border-border-light transition-colors">
              <span className="text-muted">$</span>
              <span>npm i -g opmsec</span>
              <span className="text-muted/50">|</span>
              <span className="text-muted text-xs">then: opm install {'<pkg>'}</span>
            </code>
          </div>
          <a href={DOCS_URL} target="_blank" rel="noopener" className="px-5 py-3 text-sm font-medium text-bg bg-accent rounded-lg hover:bg-white transition-colors">
            Read the docs
          </a>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-bg to-transparent" />
    </section>
  );
}

function Features() {
  const features = [
    {
      title: 'Multi-Agent Consensus',
      description: 'Three independent LLMs (Claude, Gemini, DeepSeek) analyze every package in parallel. Risk scores are intelligence-weighted using live Artificial Analysis benchmarks.',
      detail: 'No single model failure point. Weighted aggregate scoring with model intelligence and coding indices.',
      icon: '⬡',
    },
    {
      title: 'Cryptographic Attestation',
      description: 'Every package is checksummed, signed with the author\'s wallet, and registered on Base L2. Signatures are verified at install time.',
      detail: 'SHA-256 checksum, ECDSA signature, on-chain registration. Tamper-evident by design.',
      icon: '◈',
    },
    {
      title: 'ZK-Verified Agent Registration',
      description: 'Permissionless agent onboarding with zero-knowledge proof of benchmark accuracy. Agents must achieve 100% on labeled security datasets to participate.',
      detail: 'Hash-commitment scheme with circom circuit reference. Accuracy proven without revealing test data.',
      icon: '◎',
    },
    {
      title: 'On-chain Risk Registry',
      description: 'Immutable risk scores, author profiles, and audit reports stored on Base Sepolia. Every security assessment is a verifiable public record.',
      detail: 'OPMRegistry.sol: authorizedAgents, packages, versionData, AgentScores. Fully queryable.',
      icon: '▣',
    },
    {
      title: 'CVE + Typosquat Detection',
      description: 'OSV database integration for known vulnerabilities. Levenshtein-distance typosquat detection against the top 10,000 npm packages.',
      detail: 'Real-time CVE lookups, automated fix suggestions, dependency confusion detection.',
      icon: '◬',
    },
    {
      title: 'Drop-in npm Replacement',
      description: 'Full CLI compatibility: install, audit, check, push, fix. Every npm command works transparently with security verification layered on top.',
      detail: 'opm install = npm install + on-chain verification + signature check + CVE scan.',
      icon: '◯',
    },
  ];

  return (
    <section id="features" className="py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <p className="text-xs font-mono text-muted mb-4 tracking-widest uppercase">Security Primitives</p>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            Defense in depth,<br />by default.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden">
          {features.map((f, i) => (
            <div key={i} className="bg-surface p-8 hover:bg-surface-hover transition-colors group">
              <span className="text-2xl mb-4 block opacity-40 group-hover:opacity-100 transition-opacity">{f.icon}</span>
              <h3 className="text-lg font-semibold mb-3">{f.title}</h3>
              <p className="text-sm text-muted leading-relaxed mb-4">{f.description}</p>
              <p className="text-xs font-mono text-muted/60 leading-relaxed">{f.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Architecture() {
  return (
    <section id="architecture" className="py-32 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <p className="text-xs font-mono text-muted mb-4 tracking-widest uppercase">System Design</p>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            Verification pipeline
          </h2>
        </div>

        <div className="relative">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { step: '01', title: 'Pack & Sign', desc: 'SHA-256 checksum, ECDSA signature via author wallet' },
              { step: '02', title: 'Multi-Agent Scan', desc: '3 LLMs analyze source in parallel, each submits risk score' },
              { step: '03', title: 'Weighted Consensus', desc: 'Intelligence-weighted aggregate via Artificial Analysis indices' },
              { step: '04', title: 'On-chain Registry', desc: 'Package, scores, report URI registered on Base Sepolia' },
              { step: '05', title: 'Install Verify', desc: 'Signature + on-chain score + CVE check at install time' },
            ].map((s, i) => (
              <div key={i} className="relative">
                <div className="bg-gradient-to-b from-white/5 to-transparent border border-border rounded-xl p-6 h-full">
                  <span className="text-xs font-mono text-muted block mb-3">{s.step}</span>
                  <h3 className="text-sm font-semibold mb-2">{s.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{s.desc}</p>
                </div>
                {i < 4 && (
                  <div className="hidden md:block absolute top-1/2 -right-2.5 w-5 h-px bg-border" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border border-border rounded-xl p-6 bg-surface/50">
            <p className="text-xs font-mono text-green-500/80 mb-3">CHAIN</p>
            <p className="text-sm font-semibold mb-1">Base Sepolia (L2)</p>
            <p className="text-xs text-muted">Low-cost, high-throughput settlement for agent score submissions and package registrations.</p>
          </div>
          <div className="border border-border rounded-xl p-6 bg-surface/50">
            <p className="text-xs font-mono text-blue-400/80 mb-3">STORAGE</p>
            <p className="text-sm font-semibold mb-1">Fileverse (IPFS)</p>
            <p className="text-xs text-muted">Full audit reports uploaded to decentralized storage. URI stored on-chain for permanent reference.</p>
          </div>
          <div className="border border-border rounded-xl p-6 bg-surface/50">
            <p className="text-xs font-mono text-purple-400/80 mb-3">IDENTITY</p>
            <p className="text-sm font-semibold mb-1">ENS Resolution</p>
            <p className="text-xs text-muted">Author addresses resolved to ENS names. On-chain author profiles with reputation scoring.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CLISection() {
  const commands = [
    { cmd: 'opm push', desc: 'Sign, scan with 3 AI agents, publish, register on-chain' },
    { cmd: 'opm install <pkg>', desc: 'Install with signature + on-chain + CVE verification' },
    { cmd: 'opm check', desc: 'Scan all deps: typosquats, CVEs, AI analysis, Fileverse report' },
    { cmd: 'opm fix', desc: 'Auto-fix typosquats and vulnerable versions' },
    { cmd: 'opm audit', desc: 'On-chain + CVE audit for entire dependency tree' },
    { cmd: 'opm info <pkg>', desc: 'On-chain metadata, agent scores, safest version' },
    { cmd: 'opm register-agent', desc: 'Register a new security agent (ZK-verified)' },
    { cmd: 'opm view <name.eth>', desc: 'ENS author profile, reputation, published packages' },
  ];

  return (
    <section id="cli" className="py-32 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <p className="text-xs font-mono text-muted mb-4 tracking-widest uppercase">CLI Reference</p>
            <h2 className="text-4xl font-bold tracking-tight mb-6">
              Every command,<br />security-first.
            </h2>
            <p className="text-muted leading-relaxed mb-8">
              Drop-in replacement for npm. Every operation gains cryptographic verification, AI-powered auditing, and on-chain attestation transparently.
            </p>
            <a href={DOCS_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 border border-border rounded-lg hover:bg-surface transition-colors">
              Full CLI documentation
            </a>
          </div>

          <div className="terminal-glow rounded-xl border border-border bg-surface overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-2 text-xs text-muted font-mono">terminal</span>
            </div>
            <div className="p-5 font-mono text-sm space-y-3">
              {commands.map((c, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-muted shrink-0">$</span>
                  <div>
                    <span className="text-green-400">{c.cmd}</span>
                    <span className="text-muted/50 text-xs block mt-0.5">{c.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContractSection() {
  return (
    <section className="py-32 px-6 border-t border-border">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-xs font-mono text-muted mb-4 tracking-widest uppercase">Smart Contract</p>
        <h2 className="text-4xl font-bold tracking-tight mb-6">
          Fully on-chain. Fully verifiable.
        </h2>
        <p className="text-muted max-w-2xl mx-auto mb-12">
          OPMRegistry.sol deployed on Base Sepolia. Every package registration, agent score submission, and author profile is an immutable on-chain record.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden mb-12">
          {[
            { label: 'Packages', desc: 'Registered' },
            { label: 'Agent Scores', desc: 'Submitted' },
            { label: 'Authors', desc: 'Verified' },
            { label: 'Reports', desc: 'On IPFS' },
          ].map((s, i) => (
            <div key={i} className="bg-surface p-6">
              <p className="text-xs text-muted mb-1">{s.desc}</p>
              <p className="text-sm font-semibold">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="inline-flex items-center gap-3">
          <a
            href={BASESCAN}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2 text-sm font-mono text-muted hover:text-accent transition-colors px-4 py-2 border border-border rounded-lg"
          >
            <span className="w-2 h-2 rounded-full bg-green-500" />
            View on BaseScan
          </a>
          <a
            href={`${GITHUB_URL}/blob/main/packages/contracts/contracts/OPMRegistry.sol`}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors px-4 py-2 border border-border rounded-lg"
          >
            Source Code
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <a href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <Logo size={18} />
          <span className="font-semibold tracking-tight">opm</span>
          <span className="text-xs text-muted">On-chain Package Manager</span>
        </a>
        <div className="flex items-center gap-6 text-sm text-muted">
          <a href={DOCS_URL} target="_blank" rel="noopener" className="hover:text-accent transition-colors">Docs</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener" className="hover:text-accent transition-colors">GitHub</a>
          <a href={NPM_URL} target="_blank" rel="noopener" className="hover:text-accent transition-colors">npm</a>
          <a href={BASESCAN} target="_blank" rel="noopener" className="hover:text-accent transition-colors">Contract</a>
        </div>
        <p className="text-xs text-muted/50">MIT License</p>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Features />
      <Architecture />
      <CLISection />
      <ContractSection />
      <Footer />
    </main>
  );
}
