<script>
	import { onMount, tick } from 'svelte';

	const sections = [
		{ id: 'hero', label: 'Intro' },
		{ id: 'audiences', label: 'For You' },
		{ id: 'problem', label: 'Problem' },
		{ id: 'solution', label: 'Solution' },
		{ id: 'built', label: 'What We Built' },
		{ id: 'identity', label: 'Identity' },
		{ id: 'reputation', label: 'Reputation' },
		{ id: 'validation', label: 'Validation' },
		{ id: 'architecture', label: 'Architecture' },
		{ id: 'payments', label: 'x402 + MPP' },
		{ id: 'scraper', label: 'Scraper Agent' },
		{ id: 'feedback', label: 'Feedback Loop' },
		{ id: 'devtools', label: 'Dev Tools' },
		{ id: 'closing', label: 'stellar8004.com' },
	];

	let activeIdx = $state(0);

	let showKbdHint = $state(true);

	function navigateTo(/** @type {number} */ idx) {
		const clamped = Math.max(0, Math.min(idx, sections.length - 1));
		const el = document.getElementById(sections[clamped].id);
		if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function scrollTo(/** @type {string} */ id) {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function handleKeydown(/** @type {KeyboardEvent} */ e) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		switch (e.key) {
			case 'ArrowDown': case 'ArrowRight': case 'j':
				e.preventDefault(); navigateTo(activeIdx + 1); break;
			case 'ArrowUp': case 'ArrowLeft': case 'k':
				e.preventDefault(); navigateTo(activeIdx - 1); break;
			case 'Home': e.preventDefault(); navigateTo(0); break;
			case 'End': e.preventDefault(); navigateTo(sections.length - 1); break;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		setTimeout(() => { showKbdHint = false; }, 6000);
		tick().then(() => {
			// Reveal observer
			const revealObs = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							entry.target.classList.add('revealed');
							revealObs.unobserve(entry.target);
						}
					}
				},
				{ rootMargin: '0px 0px -60px 0px', threshold: 0.05 }
			);
			document.querySelectorAll('.reveal-on-scroll').forEach(el => revealObs.observe(el));

			// Section tracking observer
			const sectionObs = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							const idx = sections.findIndex(s => s.id === entry.target.id);
							if (idx !== -1) activeIdx = idx;
						}
					}
				},
				{ rootMargin: '-20% 0px -60% 0px' }
			);
			for (const s of sections) {
				const el = document.getElementById(s.id);
				if (el) sectionObs.observe(el);
			}

			cleanupRef = () => { revealObs.disconnect(); sectionObs.disconnect(); };
		});
		return () => { cleanupRef?.(); window.removeEventListener('keydown', handleKeydown); };
	});

	/** @type {(() => void) | undefined} */
	let cleanupRef;

	const leaderboard = [
		{ name: 'Web Scraper', score: 4.5, fb: 12, pct: 90 },
		{ name: 'Data Analyst', score: 4.2, fb: 8, pct: 84 },
		{ name: 'Code Review', score: 3.8, fb: 15, pct: 76 },
		{ name: 'Translator', score: 3.5, fb: 6, pct: 70 },
		{ name: 'Summarizer', score: 2.1, fb: 3, pct: 42 },
	];

	const metadata = [
		{ k: 'name', v: '"Web Scraper Agent"' },
		{ k: 'description', v: '"Scrapes web pages on demand"' },
		{ k: 'services', v: '[{ endpoint, protocol }]' },
		{ k: 'supportedTrust', v: '["reputation"]' },
		{ k: 'x402', v: 'true' },
	];
</script>

<!-- Sidebar nav -->
<nav class="fixed left-5 top-1/2 -translate-y-1/2 z-50 hidden xl:flex flex-col gap-0.5" aria-label="Section navigation">
	{#each sections as s, i}
		<button
			onclick={() => scrollTo(s.id)}
			class="group flex items-center gap-2.5 text-left py-0.5"
		>
			<div class="h-1 rounded-full transition-all duration-300 {activeIdx === i ? 'w-5 bg-accent' : 'w-1.5 bg-border group-hover:bg-text-dim'}"></div>
			<span class="text-[10px] font-mono whitespace-nowrap transition-all duration-300 {activeIdx === i ? 'text-accent opacity-100 translate-x-0' : 'text-text-dim opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'}">{s.label}</span>
		</button>
	{/each}
</nav>

<!-- Keyboard hint -->
{#if showKbdHint}
<div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-fade-out">
	<div class="flex items-center gap-3 rounded-lg border border-border bg-surface/90 backdrop-blur-sm px-4 py-2 text-[10px] font-mono text-text-dim">
		<span><kbd class="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded border border-border bg-surface-raised font-mono text-[9px]">↑</kbd><kbd class="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded border border-border bg-surface-raised font-mono text-[9px]">↓</kbd> navigate</span>
		<span class="text-border">·</span>
		<span><kbd class="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded border border-border bg-surface-raised font-mono text-[9px]">j</kbd><kbd class="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded border border-border bg-surface-raised font-mono text-[9px]">k</kbd> vim-style</span>
	</div>
</div>
{/if}

<div class="mx-auto max-w-4xl px-6 py-20 xl:pl-24 sections-container">

	<!-- ─── 1. HERO ───────────────────────────────────── -->
	<section id="hero" class="reveal-on-scroll space-y-10 text-center flex flex-col items-center pt-8">
		<!-- Hackathon badge -->
		<div class="inline-flex items-center gap-2 rounded-full border border-warning/20 bg-warning-soft px-4 py-1.5 text-[11px] font-mono text-warning">
			<span class="h-1.5 w-1.5 rounded-full bg-warning animate-pulse"></span>
			Built for Stellar Agentic Hack
		</div>

		<div class="flex items-center gap-3">
			<div class="h-12 w-12 rounded-xl bg-accent-fill flex items-center justify-center text-xl font-bold text-accent">8</div>
			<a href="https://stellar8004.com" class="text-4xl font-light tracking-tight hover:opacity-80 transition">stellar<span class="font-semibold bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">8004</span>.com</a>
		</div>

		<div class="space-y-5">
			<p class="text-[13px] font-mono tracking-[0.2em] text-accent uppercase">Gateway for AI Agents on Stellar</p>
			<h1 class="text-3xl sm:text-[2.75rem] sm:leading-[1.15] font-light tracking-tight max-w-2xl">
				Explore, Register, and Use<br/>AI Agents on <span class="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Stellar</span>
			</h1>
			<p class="text-[15px] leading-relaxed text-text-muted font-light max-w-lg mx-auto">
				On-chain identity, reputation, validation, and micropayments &mdash; the trust layer every AI agent needs.
			</p>
		</div>

		<div class="flex items-center gap-3 text-[11px] font-mono text-text-dim flex-wrap justify-center">
			<a href="https://www.8004.org" target="_blank" rel="noopener noreferrer" class="rounded-full border border-border px-3 py-1 transition hover:border-accent/30 hover:text-accent">EIP-8004</a>
			<span class="rounded-full border border-border px-3 py-1">Stellar / Soroban</span>
			<span class="rounded-full border border-border px-3 py-1">74 Tests</span>
			<span class="rounded-full border border-positive/30 text-positive px-3 py-1">Mainnet Live</span>
			<a href="https://github.com/trionlabs/stellar-8004" target="_blank" rel="noopener noreferrer" class="rounded-full border border-border px-3 py-1 transition hover:border-accent/30 hover:text-accent flex items-center gap-1.5">
				<svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
				Open Source
			</a>
		</div>
	</section>

	<!-- ─── FOR BUILDERS & USERS ──────────────────────── -->
	<section id="audiences" class="reveal-on-scroll scroll-mt-8">
		<div class="grid sm:grid-cols-2 gap-5">
			<!-- Agent Builders -->
			<div class="rounded-xl border border-accent/20 bg-surface p-6 space-y-4">
				<div class="flex items-center gap-2.5">
					<div class="h-8 w-8 rounded-lg bg-accent-soft flex items-center justify-center">
						<svg class="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17l-5.07-3.17a2.25 2.25 0 010-3.84l5.07-3.17a2.25 2.25 0 012.16 0l5.07 3.17a2.25 2.25 0 010 3.84l-5.07 3.17a2.25 2.25 0 01-2.16 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 22V17.5" /></svg>
					</div>
					<h3 class="text-lg font-medium">For Agent Builders</h3>
				</div>
				<p class="text-[13px] text-text-muted leading-relaxed">
					Register your AI agent on-chain, get discovered by users, earn reputation, and monetize with x402/MPP micropayments.
				</p>
				<div class="space-y-1.5">
					{#each [
						'Register in 60 seconds with 5-step wizard',
						'On-chain identity as an NFT on Stellar',
						'Earn reputation through real user feedback',
						'Accept micropayments via x402 or MPP',
						'SDK + Claude Code skills for fast integration',
					] as item}
						<div class="flex items-start gap-2 text-[12px] text-text-muted">
							<span class="text-accent text-[8px] mt-1">&#9654;</span>
							<span>{item}</span>
						</div>
					{/each}
				</div>
				<div class="pt-2 border-t border-border">
					<p class="text-[11px] font-mono text-accent">npx skills add trionlabs/stellar-8004 --skill '*'</p>
				</div>
			</div>

			<!-- Users / Clients -->
			<div class="rounded-xl border border-positive/20 bg-surface p-6 space-y-4">
				<div class="flex items-center gap-2.5">
					<div class="h-8 w-8 rounded-lg bg-positive-soft flex items-center justify-center">
						<svg class="h-4 w-4 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
					</div>
					<h3 class="text-lg font-medium">For Users &amp; Clients</h3>
				</div>
				<p class="text-[13px] text-text-muted leading-relaxed">
					Discover verified AI agents, check their reputation, try them with one-click payments, and leave feedback.
				</p>
				<div class="space-y-1.5">
					{#each [
						'Browse and search agents on the Explorer',
						'Filter by trust model, score, and services',
						'Try agents directly with TryAgent panel',
						'Pay per request — no subscriptions needed',
						'Rate agents and build the trust layer',
					] as item}
						<div class="flex items-start gap-2 text-[12px] text-text-muted">
							<span class="text-positive text-[8px] mt-1">&#9654;</span>
							<span>{item}</span>
						</div>
					{/each}
				</div>
				<div class="pt-2 border-t border-border">
					<p class="text-[11px] font-mono text-positive">stellar8004.com &mdash; live on mainnet</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ─── 2. PROBLEM ────────────────────────────────── -->
	<section id="problem" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<p class="text-[11px] font-mono tracking-[0.25em] text-negative uppercase">The Problem</p>
			<h2 class="text-3xl font-light tracking-tight">Thousands of AI agents. <span class="font-medium text-negative">Zero trust.</span></h2>
		</div>
		<div class="grid sm:grid-cols-3 gap-4">
			{#each [
				{ icon: '?', t: 'No Discovery', d: 'Thousands of AI agents exist but no unified registry to find them.' },
				{ icon: '!', t: 'No Trust', d: 'No way to verify reliability. No reputation, no accountability.' },
				{ icon: '$', t: 'No Payments', d: 'No native micropayment layer. No agent economy.' },
			] as p}
				<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
					<div class="h-10 w-10 rounded-lg bg-negative-soft flex items-center justify-center font-mono text-lg font-bold text-negative">{p.icon}</div>
					<h3 class="text-sm font-medium">{p.t}</h3>
					<p class="text-[13px] text-text-muted leading-relaxed">{p.d}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- ─── 3. SOLUTION ───────────────────────────────── -->
	<section id="solution" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<p class="text-[11px] font-mono tracking-[0.25em] text-positive uppercase">The Solution</p>
			<h2 class="text-3xl font-light tracking-tight"><span class="font-semibold bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">8004</span> &mdash; Agent Trust Protocol</h2>
			<p class="text-[15px] text-text-muted font-light leading-relaxed max-w-2xl">The Stellar/Soroban implementation of <a href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">ERC-8004</a> &mdash; an open standard for AI agent identity, reputation, and trust verification.</p>
		</div>
		<div class="grid sm:grid-cols-3 gap-4">
			{#each [
				{ label: 'Identity', color: 'accent', d: 'Register agents as NFTs with on-chain metadata, wallet binding, and service discovery.' },
				{ label: 'Reputation', color: 'positive', d: 'Real users leave feedback. Weighted average scores. Public leaderboard.' },
				{ label: 'Validation', color: 'warning', d: 'Third-party organizations endorse agents through on-chain attestations.' },
			] as p}
				<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
					<div class="h-1.5 w-10 rounded-full bg-{p.color}"></div>
					<h3 class="text-lg font-medium">{p.label}</h3>
					<p class="text-[13px] text-text-muted leading-relaxed">{p.d}</p>
				</div>
			{/each}
		</div>
		<div class="flex items-center justify-center gap-3 text-[13px] font-mono flex-wrap">
			<span class="rounded-lg bg-accent-soft border border-accent/20 px-4 py-2 text-accent">Register</span>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg bg-positive-soft border border-positive/20 px-4 py-2 text-positive">Use & Rate</span>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg bg-warning-soft border border-warning/20 px-4 py-2 text-warning">Validate</span>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg bg-surface-overlay border border-border px-4 py-2">Discover & Trust</span>
		</div>
	</section>

	<!-- ─── 4. WHAT WE BUILT ──────────────────────────── -->
	<section id="built" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<p class="text-[11px] font-mono tracking-[0.25em] text-positive uppercase">Hackathon Deliverables</p>
			<h2 class="text-3xl font-light tracking-tight">What We Built</h2>
			<p class="text-[15px] text-text-muted font-light leading-relaxed max-w-2xl">End-to-end infrastructure for AI agent trust on Stellar.</p>
		</div>
		<div class="grid sm:grid-cols-3 gap-3">
			{#each [
				{ n: '01', t: '3 Soroban Contracts', c: 'accent', items: ['Identity Registry (Agent NFTs)', 'Reputation Registry (Feedback)', 'Validation Registry (Attestations)'], f: '74 tests · Mainnet · OpenZeppelin' },
				{ n: '02', t: 'x402 + MPP Payments', c: 'warning', items: ['Two HTTP 402 protocols', 'MPP: direct on-chain settlement', 'x402: facilitator-based (OZ/Coinbase)', 'TryAgent: auto-detects protocol'], f: 'USDC · ~5s settlement' },
				{ n: '03', t: 'TypeScript SDK', c: 'positive', items: ['@trionlabs/stellar8004', 'Full contract client wrappers', 'Metadata builder & auto-storage'], f: 'Query, register, feedback, validate' },
				{ n: '04', t: 'Explorer Web App', c: 'accent', items: ['Search & advanced filtering', 'Agent profiles with scores', 'TryAgent: pay agents in-browser'], f: 'SvelteKit · stellar8004.com' },
				{ n: '05', t: 'Event Indexer', c: 'accent', items: ['Real-time Soroban event indexing', 'URI resolution & metadata extraction', 'REST API — 7 public endpoints'], f: 'Supabase · PostgreSQL' },
				{ n: '06', t: 'Claude Code Skills', c: 'accent', items: ['/8004stellar — agent trust protocol', '/x402stellar — HTTP micropayments', 'Install via npx skills add'], f: 'AI-native developer experience' },
			] as d}
				<div class="rounded-xl border border-border bg-surface p-4 space-y-2">
					<div class="flex items-center gap-2">
						<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-{d.c}-soft text-{d.c} font-mono text-[9px] font-bold">{d.n}</span>
						<h3 class="text-[13px] font-medium text-{d.c}">{d.t}</h3>
					</div>
					<ul class="space-y-0.5 text-[12px] text-text-muted">
						{#each d.items as item}<li class="flex items-start gap-1.5"><span class="text-{d.c} text-[7px] mt-1">&#9654;</span>{item}</li>{/each}
					</ul>
					<p class="text-[9px] font-mono text-text-dim">{d.f}</p>
				</div>
			{/each}
		</div>
		<div class="rounded-xl border border-positive/20 bg-positive-soft px-5 py-3 text-center text-[13px]">
			<span class="text-positive font-medium">+ Real Working Agent</span>
			<span class="text-text-muted"> &mdash; Web Scraper on 8004, accepting x402 + MPP, earning USDC</span>
		</div>
	</section>

	<!-- ─── 5. IDENTITY REGISTRY ──────────────────────── -->
	<section id="identity" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<div class="flex items-center gap-3">
				<p class="text-[11px] font-mono tracking-[0.25em] text-accent uppercase">Contract 1 of 3</p>
				<a href="https://stellar.expert/explorer/public/contract/CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35" target="_blank" rel="noopener noreferrer" class="rounded-full border border-positive/30 bg-positive-soft px-2.5 py-0.5 text-[10px] font-mono text-positive transition hover:bg-positive/15 flex items-center gap-1.5">
					<span class="h-1 w-1 rounded-full bg-positive animate-pulse"></span>
					Mainnet
				</a>
			</div>
			<h2 class="text-3xl font-light tracking-tight">Identity Registry</h2>
			<p class="text-[15px] text-text-muted font-light leading-relaxed max-w-2xl">Every AI agent gets an on-chain identity &mdash; discoverable, verifiable, permanent.</p>
		</div>
		<div class="grid sm:grid-cols-2 gap-5">
			<div class="space-y-2">
				{#each [
					'Agent NFTs — unique NFT per agent on Stellar',
					'On-chain Metadata — name, image, services, immutable',
					'Wallet Binding — dual-auth agent-to-wallet link',
					'Service Discovery — MCP, A2A, REST, x402 endpoints',
					'Ownership Transfer — 2-step OpenZeppelin model',
					'Timelocked Upgrades — 3-day safety timelock',
				] as f, i}
					<div class="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-4 py-3">
						<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-soft text-accent font-mono text-[9px] font-bold">{String(i + 1).padStart(2, '0')}</span>
						<p class="text-[13px] text-text-muted">{f}</p>
					</div>
				{/each}
			</div>
			<div class="space-y-3">
				<div class="rounded-xl border border-border bg-surface-raised p-5 space-y-3">
					<p class="text-[11px] font-mono tracking-[0.18em] text-accent uppercase">Agent Metadata</p>
					<div class="rounded-lg bg-surface p-4 font-mono text-[13px] leading-relaxed">
						<p class="text-text-dim">{'{'}</p>
						{#each metadata as m, i}
							<p class="pl-4"><span class="text-accent">{m.k}</span><span class="text-text-dim">: </span><span class="text-positive">{m.v}</span>{#if i < metadata.length - 1}<span class="text-text-dim">,</span>{/if}</p>
						{/each}
						<p class="text-text-dim">{'}'}</p>
					</div>
					<p class="text-[10px] font-mono text-text-dim">Max: 64B keys &middot; 4KB values &middot; 100 keys/agent</p>
				</div>
				<div class="rounded-xl border border-border bg-surface-raised px-5 py-3 font-mono text-[13px]">
					<span class="text-text-dim">ID: </span><span class="text-accent">stellar</span><span class="text-text-dim">:</span><span class="text-positive">mainnet</span><span class="text-text-dim">:</span><span class="text-warning">CBGPDCJI...6X35</span><span class="text-text-dim">#</span><span class="font-bold">1</span>
				</div>
				<div class="space-y-1 text-[11px] font-mono">
					<p class="text-text-dim uppercase tracking-wide mb-2">Mainnet Contracts</p>
					<a href="https://stellar.expert/explorer/public/contract/CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35" target="_blank" rel="noopener noreferrer" class="flex justify-between rounded-lg border border-border bg-surface px-3 py-1.5 transition hover:border-accent/30">
						<span class="text-text-muted">Identity</span><span class="text-accent">CBGP...6X35</span>
					</a>
					<a href="https://stellar.expert/explorer/public/contract/CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA" target="_blank" rel="noopener noreferrer" class="flex justify-between rounded-lg border border-border bg-surface px-3 py-1.5 transition hover:border-positive/30">
						<span class="text-text-muted">Reputation</span><span class="text-positive">CBOI...EPPA</span>
					</a>
					<a href="https://stellar.expert/explorer/public/contract/CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG" target="_blank" rel="noopener noreferrer" class="flex justify-between rounded-lg border border-border bg-surface px-3 py-1.5 transition hover:border-warning/30">
						<span class="text-text-muted">Validation</span><span class="text-warning">CBT6...7UJG</span>
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- ─── 6. REPUTATION REGISTRY ────────────────────── -->
	<section id="reputation" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<div class="flex items-center gap-3">
				<p class="text-[11px] font-mono tracking-[0.25em] text-positive uppercase">Contract 2 of 3</p>
				<a href="https://stellar.expert/explorer/public/contract/CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA" target="_blank" rel="noopener noreferrer" class="rounded-full border border-positive/30 bg-positive-soft px-2.5 py-0.5 text-[10px] font-mono text-positive transition hover:bg-positive/15 flex items-center gap-1.5">
					<span class="h-1 w-1 rounded-full bg-positive animate-pulse"></span>
					Mainnet
				</a>
			</div>
			<h2 class="text-3xl font-light tracking-tight">Reputation Registry</h2>
			<p class="text-[15px] text-text-muted font-light leading-relaxed max-w-2xl">Real users rate agents. Scores calculated on-chain with weighted averaging.</p>
		</div>
		<div class="grid sm:grid-cols-2 gap-5">
			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<div class="flex items-center justify-between">
					<p class="text-[11px] font-mono text-text-dim tracking-wide uppercase">Leaderboard</p>
					<p class="text-[11px] font-mono text-positive">Live on-chain</p>
				</div>
				{#each leaderboard as a, i}
					<div class="flex items-center gap-3">
						<span class="font-mono text-[13px] w-4 text-right {i === 0 ? 'font-bold text-warning' : 'text-text-dim'}">{i + 1}</span>
						<div class="flex-1">
							<div class="flex justify-between mb-1"><span class="text-[13px] font-medium">{a.name}</span><span class="text-[11px] font-mono text-text-muted">{a.score}/5 &middot; {a.fb}</span></div>
							<div class="h-1.5 rounded-full bg-surface-overlay"><div class="h-full rounded-full {a.pct >= 80 ? 'bg-positive' : a.pct >= 60 ? 'bg-accent' : 'bg-negative'}" style="width: {a.pct}%"></div></div>
						</div>
					</div>
				{/each}
			</div>
			<div class="space-y-2">
				<p class="text-[11px] font-mono text-text-dim tracking-wide uppercase">How it works</p>
				{#each ['Weighted Average Deviation (WAD) scoring', 'Self-feedback prevention', 'Categories: Uptime, Success Rate, Reachable', 'Evidence URIs for verifiable proof', 'Revokable feedback with on-chain history', 'Public leaderboard with real-time ranking'] as f}
					<div class="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-4 py-2.5">
						<span class="text-positive mt-0.5">&#10003;</span><p class="text-[13px] text-text-muted">{f}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── 7. VALIDATION REGISTRY ────────────────────── -->
	<section id="validation" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<div class="flex items-center gap-3">
				<p class="text-[11px] font-mono tracking-[0.25em] text-warning uppercase">Contract 3 of 3</p>
				<a href="https://stellar.expert/explorer/public/contract/CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG" target="_blank" rel="noopener noreferrer" class="rounded-full border border-positive/30 bg-positive-soft px-2.5 py-0.5 text-[10px] font-mono text-positive transition hover:bg-positive/15 flex items-center gap-1.5">
					<span class="h-1 w-1 rounded-full bg-positive animate-pulse"></span>
					Mainnet
				</a>
			</div>
			<h2 class="text-3xl font-light tracking-tight">Validation Registry</h2>
			<p class="text-[15px] text-text-muted font-light leading-relaxed max-w-2xl">Third-party organizations endorse agents through on-chain attestations.</p>
		</div>
		<div class="rounded-xl border border-border bg-surface-raised p-6">
			<div class="flex items-center justify-between gap-3">
				{#each [
					{ n: '1', l: 'Request', c: 'accent', d: 'Agent owner requests validation' },
					{ n: '2', l: 'Review', c: 'warning', d: 'Validator inspects the agent' },
					{ n: '3', l: 'Attest', c: 'positive', d: 'On-chain endorsement submitted' },
					{ n: '4', l: 'Trust', c: 'text', d: 'Validation badge, verifiable' },
				] as s, i}
					{#if i > 0}<span class="text-text-dim shrink-0">&rarr;</span>{/if}
					<div class="flex-1 text-center space-y-2">
						<div class="mx-auto h-10 w-10 rounded-lg bg-{s.c === 'text' ? 'surface-overlay' : s.c + '-soft'} flex items-center justify-center font-mono text-sm font-bold text-{s.c}">{s.n}</div>
						<h4 class="text-[13px] font-medium text-{s.c}">{s.l}</h4>
						<p class="text-[11px] text-text-muted">{s.d}</p>
					</div>
				{/each}
			</div>
		</div>
		<div class="grid sm:grid-cols-3 gap-3">
			{#each [
				{ t: 'Security Audits', d: 'Attest that agent passed security review' },
				{ t: 'Performance', d: 'Certify uptime, latency, accuracy claims' },
				{ t: 'Organizational', d: 'Companies endorse agents by their teams' },
			] as u}
				<div class="rounded-xl border border-border bg-surface px-5 py-3 space-y-1">
					<p class="text-[13px] font-medium text-warning">{u.t}</p>
					<p class="text-[11px] text-text-muted">{u.d}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- ─── 8. ARCHITECTURE ───────────────────────────── -->
	<section id="architecture" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<p class="text-[11px] font-mono tracking-[0.25em] text-accent uppercase">Architecture</p>
			<h2 class="text-3xl font-light tracking-tight">Full Stack, Open Source</h2>
		</div>
		<div class="rounded-xl border border-border bg-surface-raised p-6 space-y-4">
			<div class="flex justify-center gap-3">
				{#each [{ l: 'Identity', c: 'accent' }, { l: 'Reputation', c: 'positive' }, { l: 'Validation', c: 'warning' }] as b}
					<div class="rounded-lg bg-{b.c}-soft border border-{b.c}/20 px-5 py-2.5 text-center">
						<p class="text-[9px] text-text-dim font-mono">Soroban</p>
						<p class="text-[13px] font-medium text-{b.c}">{b.l}</p>
					</div>
				{/each}
			</div>
			<div class="flex flex-col items-center gap-0.5"><div class="w-px h-4 bg-border"></div><span class="text-[9px] font-mono text-text-dim px-2 py-0.5 rounded bg-surface-overlay">events</span><div class="w-px h-4 bg-border"></div></div>
			<div class="flex justify-center"><div class="rounded-lg bg-surface-overlay border border-border px-8 py-2.5 text-center"><p class="text-[13px] font-medium">Event Indexer</p></div></div>
			<div class="flex flex-col items-center gap-0.5"><div class="w-px h-4 bg-border"></div><span class="text-[9px] font-mono text-text-dim px-2 py-0.5 rounded bg-surface-overlay">data</span><div class="w-px h-4 bg-border"></div></div>
			<div class="flex justify-center gap-3">
				<div class="rounded-lg bg-surface-overlay border border-border px-6 py-2.5 text-center"><p class="text-[13px] font-medium">Supabase</p></div>
				<span class="text-text-dim self-center">&rarr;</span>
				<div class="rounded-lg bg-surface-overlay border border-border px-6 py-2.5 text-center"><p class="text-[13px] font-medium">REST API</p></div>
			</div>
			<div class="flex flex-col items-center"><div class="w-px h-6 bg-border"></div></div>
			<div class="flex justify-center gap-3 flex-wrap">
				{#each [{ l: 'Explorer', c: 'accent' }, { l: 'SDK', c: 'positive' }, { l: 'x402+MPP', c: 'warning' }] as b}
					<div class="rounded-lg bg-{b.c}-soft border border-{b.c}/20 px-5 py-2.5 text-center">
						<p class="text-[13px] font-medium text-{b.c}">{b.l}</p>
					</div>
				{/each}
				<div class="rounded-lg bg-surface-overlay border border-border px-5 py-2.5 text-center"><p class="text-[13px] font-medium">Your Agent</p></div>
			</div>
		</div>
		<div class="flex items-center justify-center gap-2.5 text-[10px] font-mono text-text-dim flex-wrap">
			{#each ['Rust / Soroban', 'TypeScript', 'SvelteKit', 'Supabase', 'Stellar SDK', 'OpenZeppelin'] as t}
				<span class="rounded-full border border-border px-3 py-1">{t}</span>
			{/each}
		</div>
	</section>

	<!-- ─── 9. x402 + MPP ─────────────────────────────── -->
	<section id="payments" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<p class="text-[11px] font-mono tracking-[0.25em] text-warning uppercase">Agent Payments</p>
			<h2 class="text-3xl font-light tracking-tight">HTTP 402 &mdash; Two Payment Protocols</h2>
			<p class="text-[15px] text-text-muted font-light leading-relaxed max-w-2xl">Agents charge per request via HTTP 402. We support both x402 and MPP &mdash; clients auto-detect.</p>
		</div>
		<div class="grid sm:grid-cols-2 gap-4">
			<!-- x402 -->
			<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
				<div class="flex items-center gap-2">
					<div class="h-7 w-7 rounded-lg bg-accent-soft flex items-center justify-center font-mono text-[10px] font-bold text-accent">x4</div>
					<div><h3 class="text-[14px] font-medium text-accent">x402</h3><p class="text-[9px] text-text-dim">Facilitator-based</p></div>
				</div>
				<div class="space-y-1.5 text-[12px] text-text-muted">
					<p>&bull; Payment through <strong class="text-accent">facilitator</strong> (OZ / Coinbase)</p>
					<p>&bull; Facilitator verifies and forwards</p>
					<p>&bull; Cross-chain compatible</p>
				</div>
				<div class="rounded-lg bg-surface-overlay border border-border p-3 font-mono text-[10px]">
					<p class="text-text-dim">// 402 Response</p>
					<p><span class="text-accent">X-Payment</span>: x402-stellar</p>
					<p><span class="text-accent">X-Payment-Amount</span>: 0.01 USDC</p>
				</div>
			</div>
			<!-- MPP -->
			<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
				<div class="flex items-center gap-2">
					<div class="h-7 w-7 rounded-lg bg-positive-soft flex items-center justify-center font-mono text-[10px] font-bold text-positive">M</div>
					<div><h3 class="text-[14px] font-medium text-positive">MPP</h3><p class="text-[9px] text-text-dim">Machine Payments Protocol</p></div>
				</div>
				<div class="space-y-1.5 text-[12px] text-text-muted">
					<p>&bull; <strong class="text-positive">Direct on-chain</strong> settlement</p>
					<p>&bull; No facilitator &mdash; fully decentralized</p>
					<p>&bull; Supports sponsored transactions</p>
				</div>
				<div class="rounded-lg bg-surface-overlay border border-border p-3 font-mono text-[10px]">
					<p class="text-text-dim">// 402 Response</p>
					<p><span class="text-positive">X-Payment</span>: mpp-charge</p>
					<p><span class="text-positive">X-Payment-Destination</span>: GCDE...7KLP</p>
				</div>
			</div>
		</div>
		<div class="flex items-center justify-center gap-2.5 text-[13px] font-mono flex-wrap">
			<span class="rounded-lg bg-surface-overlay border border-border px-4 py-2">Request</span>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg bg-warning-soft border border-warning/20 px-4 py-2 text-warning">402</span>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg bg-surface-overlay border border-border px-4 py-2">Auto-detect</span>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg bg-positive-soft border border-positive/20 px-4 py-2 text-positive">Pay</span>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg bg-surface-overlay border border-border px-4 py-2">Result</span>
		</div>
	</section>

	<!-- ─── 10. SCRAPER AGENT ─────────────────────────── -->
	<section id="scraper" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<p class="text-[11px] font-mono tracking-[0.25em] text-positive uppercase">Live Demo</p>
			<h2 class="text-3xl font-light tracking-tight">Web Scraper Agent</h2>
			<p class="text-[15px] text-text-muted font-light leading-relaxed max-w-2xl">A real agent on 8004 &mdash; registered on-chain, accepting x402 + MPP, earning USDC.</p>
		</div>
		<div class="grid sm:grid-cols-2 gap-4">
			<!-- Agent card -->
			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<div class="flex items-center gap-2.5">
					<div class="h-9 w-9 rounded-lg bg-accent-fill flex items-center justify-center text-sm font-bold text-accent">S</div>
					<div><h3 class="text-[14px] font-medium">Web Scraper Agent</h3><p class="text-[9px] text-text-dim font-mono">stellar:mainnet:CBGP...6X35#1</p></div>
				</div>
				<div class="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
					{#each [{ v: '4.5', l: 'Score', c: 'text-positive' }, { v: '12', l: 'Feedback', c: 'text-accent' }, { v: '92%', l: 'Complete', c: 'text-warning' }] as s}
						<div class="bg-surface py-2 text-center"><p class="text-sm font-medium {s.c}">{s.v}</p><p class="text-[8px] text-text-dim uppercase">{s.l}</p></div>
					{/each}
				</div>
				<div class="rounded-lg bg-surface-overlay border border-border px-3 py-2.5">
					<div class="flex justify-between items-center">
						<span class="text-[13px] font-medium">POST /scrape</span>
						<div class="flex gap-1">
							<span class="rounded-full bg-warning-soft border border-warning/20 px-2 py-0.5 text-[10px] font-mono text-warning">x402</span>
							<span class="rounded-full bg-positive-soft border border-positive/20 px-2 py-0.5 text-[10px] font-mono text-positive">MPP</span>
						</div>
					</div>
					<p class="text-[10px] text-text-dim mt-1">Scrapes any URL, returns structured content</p>
				</div>
			</div>
			<!-- TryAgent mockup -->
			<div class="rounded-xl border border-border overflow-hidden">
				<div class="flex items-center gap-2 bg-surface-overlay px-3 py-2 border-b border-border">
					<div class="flex gap-1.5"><div class="h-2 w-2 rounded-full bg-negative/60"></div><div class="h-2 w-2 rounded-full bg-warning/60"></div><div class="h-2 w-2 rounded-full bg-positive/60"></div></div>
					<div class="flex-1 mx-2"><div class="rounded bg-surface px-2 py-0.5 text-[9px] font-mono text-text-dim">stellar8004.com/agents/1</div></div>
				</div>
				<div class="bg-surface p-4 space-y-3">
					<div class="flex justify-between items-center"><h4 class="text-[13px] font-medium">Try This Agent</h4><span class="rounded-full bg-positive-soft border border-positive/20 px-2 py-0.5 text-[10px] font-mono text-positive">Live</span></div>
					<div class="rounded-lg bg-surface-raised border border-border px-3 py-2 flex justify-between"><span class="text-[11px]">POST /scrape</span><span class="text-[9px] font-mono text-warning">$0.01 USDC</span></div>
					<div>
						<p class="text-[9px] text-text-dim mb-1 font-mono">Request Body</p>
						<div class="rounded-lg bg-surface-overlay border border-border p-2.5 font-mono text-[10px]">
							{'{'}<br/>&nbsp;&nbsp;<span class="text-accent">"url"</span>: <span class="text-positive">"https://example.com/news"</span><br/>{'}'}
						</div>
					</div>
					<div class="rounded-xl bg-accent-fill border border-accent/30 py-2.5 text-center text-[13px] font-medium text-accent">Send Request &rarr;</div>
					<div class="rounded-lg bg-positive-soft border border-positive/20 p-2.5">
						<div class="flex justify-between"><span class="text-[9px] font-mono text-positive">HTTP 200 OK</span><span class="text-[8px] font-mono text-text-dim">tx 8f3a...c21d</span></div>
						<p class="font-mono text-[9px] text-text-muted mt-1">{'{'} "title": "Breaking News...", "content": "..." {'}'}</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ─── 11. FEEDBACK LOOP ─────────────────────────── -->
	<section id="feedback" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<p class="text-[11px] font-mono tracking-[0.25em] text-positive uppercase">Trust Loop</p>
			<h2 class="text-3xl font-light tracking-tight">Use &rarr; Rate &rarr; Trust</h2>
			<p class="text-[15px] text-text-muted font-light leading-relaxed max-w-2xl">Every interaction builds the trust layer. Feedback is on-chain, permanent, transparent.</p>
		</div>
		<div class="grid sm:grid-cols-2 gap-5">
			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<p class="text-[11px] font-mono text-text-dim tracking-wide uppercase">Score Impact</p>
				<div><div class="flex justify-between text-[13px] mb-1.5"><span class="text-text-muted">Before</span><span class="font-mono text-accent">4.2</span></div><div class="h-2 rounded-full bg-surface-overlay"><div class="h-full rounded-full bg-accent" style="width: 84%"></div></div></div>
				<p class="text-center text-[10px] text-text-dim font-mono">+ feedback: 5/6 "Success Rate"</p>
				<div><div class="flex justify-between text-[13px] mb-1.5"><span class="text-text-muted">After</span><span class="font-mono text-positive">4.3</span></div><div class="h-2 rounded-full bg-surface-overlay"><div class="h-full rounded-full bg-positive" style="width: 86%"></div></div></div>
			</div>
			<div class="space-y-3">
				<p class="text-[11px] font-mono text-text-dim tracking-wide uppercase">Recent Feedback</p>
				{#each [
					{ score: 5, tag: 'Success Rate', from: 'GBXK...3F2Q', time: 'just now', hl: true },
					{ score: 4, tag: 'Uptime', from: 'GABC...9XYZ', time: '2d ago', hl: false },
					{ score: 5, tag: 'Reachable', from: 'GDEF...4MNO', time: '5d ago', hl: false },
				] as f}
					<div class="rounded-xl border {f.hl ? 'border-positive/20 bg-positive-soft' : 'border-border bg-surface'} px-4 py-3 flex justify-between items-center">
						<div class="flex items-center gap-2.5">
							<div class="flex gap-0.5">{#each Array(6) as _, j}<div class="h-2 w-2 rounded-sm {j < f.score ? 'bg-positive' : 'bg-surface-overlay'}"></div>{/each}</div>
							<span class="text-[11px] font-mono text-text-dim">{f.tag}</span>
						</div>
						<div class="text-right"><p class="text-[10px] font-mono text-text-dim">{f.from}</p><p class="text-[9px] text-text-dim">{f.time}</p></div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── 12. DEVELOPER TOOLS ───────────────────────── -->
	<section id="devtools" class="reveal-on-scroll space-y-8 scroll-mt-8">
		<div class="space-y-3">
			<p class="text-[11px] font-mono tracking-[0.25em] text-accent uppercase">Developer Experience</p>
			<h2 class="text-3xl font-light tracking-tight">Build on 8004 in Minutes</h2>
			<p class="text-[15px] text-text-muted font-light leading-relaxed max-w-2xl">TypeScript SDK, Claude Code skills, REST API, and full documentation.</p>
		</div>
		<div class="grid sm:grid-cols-2 gap-4">
			<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
				<div class="flex justify-between items-center"><p class="text-[11px] font-mono tracking-[0.18em] text-accent uppercase">TypeScript SDK</p><a href="https://www.npmjs.com/package/@trionlabs/stellar8004" target="_blank" rel="noopener noreferrer" class="rounded-full bg-accent-soft border border-accent/20 px-2 py-0.5 text-[10px] font-mono text-accent transition hover:bg-accent/15">@trionlabs/stellar8004</a></div>
				<div class="rounded-lg bg-surface-overlay border border-border p-3 font-mono text-[11px] leading-relaxed">
					<p><span class="text-accent">import</span> {'{'} IdentityRegistryClient {'}'}</p>
					<p class="pl-2 text-text-dim"><span class="text-accent">from</span> <span class="text-positive">'@trionlabs/stellar8004'</span>;</p>
					<p class="mt-2"><span class="text-accent">const</span> client = <span class="text-accent">new</span> <span class="text-warning">IdentityRegistryClient</span>({'{'}</p>
					<p class="pl-2">network: <span class="text-positive">'mainnet'</span> {'}'});</p>
					<p class="mt-2 text-text-dim">// Query any agent</p>
					<p><span class="text-accent">const</span> agent = <span class="text-accent">await</span> client.<span class="text-warning">getAgent</span>(<span class="text-positive">1</span>);</p>
				</div>
			</div>
			<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
				<div class="flex justify-between items-center"><p class="text-[11px] font-mono tracking-[0.18em] text-accent uppercase">Claude Code Skills</p><a href="https://github.com/trionlabs/stellar-8004/tree/main/skills" target="_blank" rel="noopener noreferrer" class="rounded-full bg-accent-soft border border-accent/20 px-2 py-0.5 text-[10px] font-mono text-accent transition hover:bg-accent/15">GitHub</a></div>
				<div class="rounded-lg bg-surface-overlay border border-border p-3 font-mono text-[11px] leading-relaxed space-y-2">
					<div><p class="text-text-dim"># Install skills</p><p><span class="text-positive">$</span> npx skills add trionlabs/stellar-8004 --skill '*'</p></div>
					<div><p><span class="text-positive">$</span> /8004stellar <span class="text-text-dim">&mdash; agent trust protocol</span></p></div>
					<div><p><span class="text-positive">$</span> /x402stellar <span class="text-text-dim">&mdash; HTTP micropayments</span></p></div>
				</div>
			</div>
			<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
				<p class="text-[11px] font-mono tracking-[0.18em] text-accent uppercase">REST API</p>
				<div class="space-y-1.5 font-mono text-[11px]">
					{#each [
						{ m: 'GET', p: '/api/v1/agents', d: 'List all' },
						{ m: 'GET', p: '/api/v1/agents/:id', d: 'Details + score' },
						{ m: 'GET', p: '/api/v1/agents/:id/feedback', d: 'Feedback' },
						{ m: 'GET', p: '/api/v1/search?q=...', d: 'Search' },
						{ m: 'GET', p: '/api/v1/stats', d: 'Stats' },
					] as e}
						<div class="flex gap-2.5"><span class="text-positive w-7">{e.m}</span><span class="flex-1">{e.p}</span><span class="text-text-dim text-[10px]">{e.d}</span></div>
					{/each}
				</div>
			</div>
			<div class="rounded-xl border border-border bg-surface p-5 space-y-3">
				<p class="text-[11px] font-mono tracking-[0.18em] text-accent uppercase">5-Step Registration</p>
				{#each [
					{ s: '1', l: 'Basic Info', d: 'Name, description, image' },
					{ s: '2', l: 'Services', d: 'MCP, A2A, REST endpoints' },
					{ s: '3', l: 'Advanced', d: 'Trust model, x402/MPP' },
					{ s: '4', l: 'URI', d: 'Auto data URI or IPFS' },
					{ s: '5', l: 'Review', d: 'Connect wallet, sign tx' },
				] as step}
					<div class="flex items-center gap-2.5 rounded-lg bg-surface-overlay px-3 py-1.5">
						<span class="text-accent font-mono text-sm font-bold w-4">{step.s}</span>
						<span class="text-[13px] font-medium w-24">{step.l}</span>
						<span class="text-[11px] text-text-dim">{step.d}</span>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── 13. CLOSING CTA ───────────────────────────── -->
	<section id="closing" class="reveal-on-scroll space-y-8 text-center flex flex-col items-center py-12 scroll-mt-8">
		<div class="flex items-center gap-3">
			<div class="h-12 w-12 rounded-xl bg-accent-fill flex items-center justify-center text-xl font-bold text-accent">8</div>
			<span class="text-4xl font-light tracking-tight">stellar<span class="font-semibold bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">8004</span>.com</span>
		</div>
		<div class="flex items-center gap-8 flex-wrap justify-center">
			{#each [
				{ w: 'Discover.', d: 'Find any AI agent on Stellar', c: 'text-accent' },
				{ w: 'Use.', d: 'Pay per request with x402 + MPP', c: 'text-warning' },
				{ w: 'Trust.', d: 'On-chain reputation from real users', c: 'text-positive' },
				{ w: 'Build.', d: 'SDK, skills, open source tools', c: 'text-text' },
			] as item}
				<div class="text-center space-y-1"><p class="text-xl font-medium {item.c}">{item.w}</p><p class="text-[11px] text-text-muted max-w-32">{item.d}</p></div>
			{/each}
		</div>
		<div class="w-20 h-px bg-border"></div>
		<div class="flex items-center gap-6">
			{#each [{ v: '3', l: 'Contracts' }, { v: '74', l: 'Tests' }, { v: 'Mainnet', l: 'Network' }, { v: 'MIT', l: 'License' }] as s}
				<div class="text-center"><p class="text-lg font-medium font-mono text-accent">{s.v}</p><p class="text-[10px] text-text-dim uppercase tracking-wide">{s.l}</p></div>
			{/each}
		</div>
		<a href="https://stellar8004.com" class="text-2xl font-light text-accent hover:underline">stellar8004.com</a>
		<p class="text-[13px] text-text-dim font-mono">Open Source &middot; Mainnet &middot; Trustless</p>
		<div class="flex items-center justify-center gap-2.5 text-[10px] font-mono text-text-dim flex-wrap">
			{#each ['Rust', 'Soroban', 'TypeScript', 'SvelteKit', 'Supabase', 'Stellar'] as t}
				<span class="rounded-full border border-border px-3 py-1">{t}</span>
			{/each}
		</div>

		<!-- Attribution badges -->
		<div class="w-20 h-px bg-border"></div>
		<div class="flex items-center justify-center gap-3 flex-wrap">
			<a href="https://x.com/trionlabs" target="_blank" rel="noopener noreferrer"
				class="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-4 py-1.5 text-[11px] font-mono text-text-muted transition hover:border-accent/30 hover:text-text">
				<svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
				Built by Trionlabs
			</a>
			<div class="inline-flex items-center gap-2 rounded-full border border-warning/20 bg-warning-soft px-4 py-1.5 text-[11px] font-mono text-warning">
				<span class="h-1.5 w-1.5 rounded-full bg-warning animate-pulse"></span>
				Stellar Agentic Hack
			</div>
		</div>
	</section>

</div>

<style>
	.animate-fade-out {
		animation: fade-out 6s ease forwards;
	}
	@keyframes fade-out {
		0%, 70% { opacity: 1; }
		100% { opacity: 0; }
	}

	.sections-container > :global(section) {
		padding-block: 4rem;
	}
	.sections-container > :global(section + section) {
		border-top: 1px solid var(--color-border-subtle);
	}
	.sections-container > :global(section:first-child) {
		border-top: none;
		padding-top: 2rem;
	}
	.sections-container > :global(section:last-child) {
		padding-bottom: 6rem;
	}
</style>
