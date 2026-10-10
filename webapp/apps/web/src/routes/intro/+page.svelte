<script>
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';

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
		{ id: 'closing', label: 'stellar8004.com' }
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
			case 'ArrowDown':
			case 'ArrowRight':
			case 'j':
				e.preventDefault();
				navigateTo(activeIdx + 1);
				break;
			case 'ArrowUp':
			case 'ArrowLeft':
			case 'k':
				e.preventDefault();
				navigateTo(activeIdx - 1);
				break;
			case 'Home':
				e.preventDefault();
				navigateTo(0);
				break;
			case 'End':
				e.preventDefault();
				navigateTo(sections.length - 1);
				break;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		setTimeout(() => {
			showKbdHint = false;
		}, 6000);
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
			document.querySelectorAll('.reveal-on-scroll').forEach((el) => revealObs.observe(el));

			// Section tracking observer
			const sectionObs = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							const idx = sections.findIndex((s) => s.id === entry.target.id);
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

			cleanupRef = () => {
				revealObs.disconnect();
				sectionObs.disconnect();
			};
		});
		return () => {
			cleanupRef?.();
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	/** @type {(() => void) | undefined} */
	let cleanupRef;

	const leaderboard = [
		{ name: 'Web Scraper', score: 4.5, fb: 12, pct: 90 },
		{ name: 'Data Analyst', score: 4.2, fb: 8, pct: 84 },
		{ name: 'Code Review', score: 3.8, fb: 15, pct: 76 },
		{ name: 'Translator', score: 3.5, fb: 6, pct: 70 },
		{ name: 'Summarizer', score: 2.1, fb: 3, pct: 42 }
	];

	const metadata = [
		{ k: 'name', v: '"Web Scraper Agent"' },
		{ k: 'description', v: '"Scrapes web pages on demand"' },
		{ k: 'services', v: '[{ endpoint, protocol }]' },
		{ k: 'supportedTrust', v: '["reputation"]' },
		{ k: 'x402', v: 'true' }
	];
</script>

<!-- Sidebar nav -->
<nav
	class="fixed top-1/2 left-5 z-50 hidden -translate-y-1/2 flex-col gap-0.5 xl:flex"
	aria-label="Section navigation"
>
	{#each sections as s, i (s.id)}
		<button onclick={() => scrollTo(s.id)} class="group flex items-center gap-2.5 py-0.5 text-left">
			<div
				class="h-1 rounded-full transition-all duration-300 {activeIdx === i
					? 'w-5 bg-accent'
					: 'w-1.5 bg-border group-hover:bg-text-dim'}"
			></div>
			<span
				class="font-mono text-[10px] whitespace-nowrap transition-all duration-300 {activeIdx === i
					? 'translate-x-0 text-accent opacity-100'
					: '-translate-x-1 text-text-dim opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}"
				>{s.label}</span
			>
		</button>
	{/each}
</nav>

<!-- Keyboard hint -->
{#if showKbdHint}
	<div class="animate-fade-out pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
		<div
			class="flex items-center gap-3 rounded-lg border border-border bg-surface/90 px-4 py-2 font-mono text-[10px] text-text-dim backdrop-blur-sm"
		>
			<span
				><kbd
					class="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-raised px-1 font-mono text-[9px]"
					>↑</kbd
				><kbd
					class="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-raised px-1 font-mono text-[9px]"
					>↓</kbd
				> navigate</span
			>
			<span class="text-border">·</span>
			<span
				><kbd
					class="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-raised px-1 font-mono text-[9px]"
					>j</kbd
				><kbd
					class="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-raised px-1 font-mono text-[9px]"
					>k</kbd
				> vim-style</span
			>
		</div>
	</div>
{/if}

<div class="sections-container mx-auto max-w-4xl px-6 py-20 xl:pl-24">
	<!-- ─── 1. HERO ───────────────────────────────────── -->
	<section
		id="hero"
		class="reveal-on-scroll flex flex-col items-center space-y-10 pt-8 text-center"
	>
		<div
			class="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-4 py-1.5 font-mono text-[11px] text-accent"
		>
			<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
			Agent Trust Protocol on Stellar
		</div>

		<div class="flex items-center gap-3">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-fill text-xl font-bold text-accent"
			>
				8
			</div>
			<a
				href="https://stellar8004.com"
				class="text-4xl font-light tracking-tight transition hover:opacity-80"
				>stellar<span
					class="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text font-semibold text-transparent"
					>8004</span
				>.com</a
			>
		</div>

		<div class="space-y-5">
			<p class="font-mono text-[13px] tracking-[0.2em] text-accent uppercase">
				Gateway for AI Agents on Stellar
			</p>
			<h1 class="max-w-2xl text-3xl font-light tracking-tight sm:text-[2.75rem] sm:leading-[1.15]">
				Explore, Register, and Use<br />AI Agents on
				<span class="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent"
					>Stellar</span
				>
			</h1>
			<p class="mx-auto max-w-lg text-[15px] leading-relaxed font-light text-text-muted">
				On-chain identity, reputation, validation, and micropayments &mdash; the trust layer every
				AI agent needs.
			</p>
		</div>

		<div
			class="flex flex-wrap items-center justify-center gap-3 font-mono text-[11px] text-text-dim"
		>
			<a
				href="https://www.8004.org"
				target="_blank"
				rel="noopener noreferrer"
				class="rounded-full border border-border px-3 py-1 transition hover:border-accent/30 hover:text-accent"
				>EIP-8004</a
			>
			<span class="rounded-full border border-border px-3 py-1">Stellar / Soroban</span>
			<span class="rounded-full border border-border px-3 py-1">74 Tests</span>
			<span class="rounded-full border border-positive/30 px-3 py-1 text-positive"
				>Mainnet Live</span
			>
			<a
				href="https://github.com/trionlabs/stellar-8004"
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 transition hover:border-accent/30 hover:text-accent"
			>
				<svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"
					><path
						d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
					/></svg
				>
				Open Source
			</a>
		</div>
	</section>

	<!-- ─── FOR BUILDERS & USERS ──────────────────────── -->
	<section id="audiences" class="reveal-on-scroll scroll-mt-8">
		<div class="grid gap-5 sm:grid-cols-2">
			<!-- Agent Builders -->
			<div class="space-y-4 rounded-xl border border-accent/20 bg-surface p-6">
				<div class="flex items-center gap-2.5">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft">
						<svg
							class="h-4 w-4 text-accent"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.5"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M11.42 15.17l-5.07-3.17a2.25 2.25 0 010-3.84l5.07-3.17a2.25 2.25 0 012.16 0l5.07 3.17a2.25 2.25 0 010 3.84l-5.07 3.17a2.25 2.25 0 01-2.16 0z"
							/><path stroke-linecap="round" stroke-linejoin="round" d="M12 22V17.5" /></svg
						>
					</div>
					<h3 class="text-lg font-medium">For Agent Builders</h3>
				</div>
				<p class="text-[13px] leading-relaxed text-text-muted">
					Register your AI agent on-chain, get discovered by users, earn reputation, and monetize
					with x402/MPP micropayments.
				</p>
				<div class="space-y-1.5">
					{#each ['Register in 60 seconds with 5-step wizard', 'On-chain identity as an NFT on Stellar', 'Earn reputation through real user feedback', 'Accept micropayments via x402 or MPP', 'TypeScript SDK and registration examples'] as item (item)}
						<div class="flex items-start gap-2 text-[12px] text-text-muted">
							<span class="mt-1 text-[8px] text-accent">&#9654;</span>
							<span>{item}</span>
						</div>
					{/each}
				</div>
				<div class="border-t border-border pt-2">
					<a href={resolve('/developers')} class="font-mono text-[11px] text-accent hover:underline"
						>SDK setup and registration examples →</a
					>
				</div>
			</div>

			<!-- Users / Clients -->
			<div class="space-y-4 rounded-xl border border-positive/20 bg-surface p-6">
				<div class="flex items-center gap-2.5">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-positive-soft">
						<svg
							class="h-4 w-4 text-positive"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.5"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
							/></svg
						>
					</div>
					<h3 class="text-lg font-medium">For Users &amp; Clients</h3>
				</div>
				<p class="text-[13px] leading-relaxed text-text-muted">
					Discover verified AI agents, check their reputation, try them with one-click payments, and
					leave feedback.
				</p>
				<div class="space-y-1.5">
					{#each ['Browse and search agents on the Explorer', 'Filter by trust model, score, and services', 'Try agents directly with TryAgent panel', 'Pay per request — no subscriptions needed', 'Rate agents and build the trust layer'] as item (item)}
						<div class="flex items-start gap-2 text-[12px] text-text-muted">
							<span class="mt-1 text-[8px] text-positive">&#9654;</span>
							<span>{item}</span>
						</div>
					{/each}
				</div>
				<div class="border-t border-border pt-2">
					<p class="font-mono text-[11px] text-positive">stellar8004.com &mdash; live on mainnet</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ─── 2. PROBLEM ────────────────────────────────── -->
	<section id="problem" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<p class="font-mono text-[11px] tracking-[0.25em] text-negative uppercase">The Problem</p>
			<h2 class="text-3xl font-light tracking-tight">
				Thousands of AI agents. <span class="font-medium text-negative">Zero trust.</span>
			</h2>
		</div>
		<div class="grid gap-4 sm:grid-cols-3">
			{#each [{ icon: '?', t: 'No Discovery', d: 'Thousands of AI agents exist but no unified registry to find them.' }, { icon: '!', t: 'No Trust', d: 'No way to verify reliability. No reputation, no accountability.' }, { icon: '$', t: 'No Payments', d: 'No native micropayment layer. No agent economy.' }] as p (p.t)}
				<div class="space-y-3 rounded-xl border border-border bg-surface p-5">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-negative-soft font-mono text-lg font-bold text-negative"
					>
						{p.icon}
					</div>
					<h3 class="text-sm font-medium">{p.t}</h3>
					<p class="text-[13px] leading-relaxed text-text-muted">{p.d}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- ─── 3. SOLUTION ───────────────────────────────── -->
	<section id="solution" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<p class="font-mono text-[11px] tracking-[0.25em] text-positive uppercase">The Solution</p>
			<h2 class="text-3xl font-light tracking-tight">
				<span
					class="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text font-semibold text-transparent"
					>8004</span
				> &mdash; Agent Trust Protocol
			</h2>
			<p class="max-w-2xl text-[15px] leading-relaxed font-light text-text-muted">
				The Stellar/Soroban implementation of <a
					href="https://eips.ethereum.org/EIPS/eip-8004"
					target="_blank"
					rel="noopener noreferrer"
					class="text-accent hover:underline">ERC-8004</a
				> &mdash; an open standard for AI agent identity, reputation, and trust verification.
			</p>
		</div>
		<div class="grid gap-4 sm:grid-cols-3">
			{#each [{ label: 'Identity', color: 'accent', d: 'Register agents as NFTs with on-chain metadata, wallet binding, and service discovery.' }, { label: 'Reputation', color: 'positive', d: 'Real users leave feedback. Weighted average scores. Public leaderboard.' }, { label: 'Validation', color: 'warning', d: 'Third-party organizations endorse agents through on-chain attestations.' }] as p (p.label)}
				<div class="space-y-3 rounded-xl border border-border bg-surface p-5">
					<div class="h-1.5 w-10 rounded-full bg-{p.color}"></div>
					<h3 class="text-lg font-medium">{p.label}</h3>
					<p class="text-[13px] leading-relaxed text-text-muted">{p.d}</p>
				</div>
			{/each}
		</div>
		<div class="flex flex-wrap items-center justify-center gap-3 font-mono text-[13px]">
			<span class="rounded-lg border border-accent/20 bg-accent-soft px-4 py-2 text-accent"
				>Register</span
			>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg border border-positive/20 bg-positive-soft px-4 py-2 text-positive"
				>Use & Rate</span
			>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg border border-warning/20 bg-warning-soft px-4 py-2 text-warning"
				>Validate</span
			>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg border border-border bg-surface-overlay px-4 py-2"
				>Discover & Trust</span
			>
		</div>
	</section>

	<!-- ─── 4. WHAT WE BUILT ──────────────────────────── -->
	<section id="built" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<p class="font-mono text-[11px] tracking-[0.25em] text-positive uppercase">
				Hackathon Deliverables
			</p>
			<h2 class="text-3xl font-light tracking-tight">What We Built</h2>
			<p class="max-w-2xl text-[15px] leading-relaxed font-light text-text-muted">
				End-to-end infrastructure for AI agent trust on Stellar.
			</p>
		</div>
		<div class="grid gap-3 sm:grid-cols-3">
			{#each [{ n: '01', t: '3 Soroban Contracts', c: 'accent', items: ['Identity Registry (Agent NFTs)', 'Reputation Registry (Feedback)', 'Validation Registry (Attestations)'], f: '74 tests · Mainnet · OpenZeppelin' }, { n: '02', t: 'x402 + MPP Payments', c: 'warning', items: ['Two HTTP 402 protocols', 'MPP: direct on-chain settlement', 'x402: facilitator-based (OZ/Coinbase)', 'TryAgent: auto-detects protocol'], f: 'USDC · ~5s settlement' }, { n: '03', t: 'TypeScript SDK', c: 'positive', items: ['@trionlabs/stellar8004', 'Full contract client wrappers', 'Metadata builder & auto-storage'], f: 'Query, register, feedback, validate' }, { n: '04', t: 'Explorer Web App', c: 'accent', items: ['Search & advanced filtering', 'Agent profiles with scores', 'TryAgent: pay agents in-browser'], f: 'SvelteKit · stellar8004.com' }, { n: '05', t: 'Event Indexer', c: 'accent', items: ['Real-time Soroban event indexing', 'URI resolution & metadata extraction', 'REST API — 7 public endpoints'], f: 'Supabase · PostgreSQL' }, { n: '06', t: 'Developer Documentation', c: 'accent', items: ['SDK setup and usage examples', 'Registration and metadata guide', 'Public REST API reference'], f: 'Guides for building on Stellar8004' }] as d (d.n)}
				<div class="space-y-2 rounded-xl border border-border bg-surface p-4">
					<div class="flex items-center gap-2">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-{d.c}-soft text-{d.c} font-mono text-[9px] font-bold"
							>{d.n}</span
						>
						<h3 class="text-[13px] font-medium text-{d.c}">{d.t}</h3>
					</div>
					<ul class="space-y-0.5 text-[12px] text-text-muted">
						{#each d.items as item (item)}<li class="flex items-start gap-1.5">
								<span class="text-{d.c} mt-1 text-[7px]">&#9654;</span>{item}
							</li>{/each}
					</ul>
					<p class="font-mono text-[9px] text-text-dim">{d.f}</p>
				</div>
			{/each}
		</div>
		<div
			class="rounded-xl border border-positive/20 bg-positive-soft px-5 py-3 text-center text-[13px]"
		>
			<span class="font-medium text-positive">+ Real Working Agent</span>
			<span class="text-text-muted">
				&mdash; Web Scraper on 8004, accepting x402 + MPP, earning USDC</span
			>
		</div>
	</section>

	<!-- ─── 5. IDENTITY REGISTRY ──────────────────────── -->
	<section id="identity" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<div class="flex items-center gap-3">
				<p class="font-mono text-[11px] tracking-[0.25em] text-accent uppercase">Contract 1 of 3</p>
				<a
					href="https://stellar.expert/explorer/public/contract/CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive-soft px-2.5 py-0.5 font-mono text-[10px] text-positive transition hover:bg-positive/15"
				>
					<span class="h-1 w-1 animate-pulse rounded-full bg-positive"></span>
					Mainnet
				</a>
			</div>
			<h2 class="text-3xl font-light tracking-tight">Identity Registry</h2>
			<p class="max-w-2xl text-[15px] leading-relaxed font-light text-text-muted">
				Every AI agent gets an on-chain identity &mdash; discoverable, verifiable, permanent.
			</p>
		</div>
		<div class="grid gap-5 sm:grid-cols-2">
			<div class="space-y-2">
				{#each ['Agent NFTs — unique NFT per agent on Stellar', 'On-chain Metadata — name, image, services, immutable', 'Wallet Binding — dual-auth agent-to-wallet link', 'Service Discovery — MCP, A2A, REST, x402 endpoints', 'Ownership Transfer — 2-step OpenZeppelin model', 'Timelocked Upgrades — 3-day safety timelock'] as f, i (f)}
					<div
						class="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-4 py-3"
					>
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-soft font-mono text-[9px] font-bold text-accent"
							>{String(i + 1).padStart(2, '0')}</span
						>
						<p class="text-[13px] text-text-muted">{f}</p>
					</div>
				{/each}
			</div>
			<div class="space-y-3">
				<div class="space-y-3 rounded-xl border border-border bg-surface-raised p-5">
					<p class="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">
						Agent Metadata
					</p>
					<div class="rounded-lg bg-surface p-4 font-mono text-[13px] leading-relaxed">
						<p class="text-text-dim">{'{'}</p>
						{#each metadata as m, i (m.k)}
							<p class="pl-4">
								<span class="text-accent">{m.k}</span><span class="text-text-dim">: </span><span
									class="text-positive">{m.v}</span
								>{#if i < metadata.length - 1}<span class="text-text-dim">,</span>{/if}
							</p>
						{/each}
						<p class="text-text-dim">}</p>
					</div>
					<p class="font-mono text-[10px] text-text-dim">
						Max: 64B keys &middot; 4KB values &middot; 100 keys/agent
					</p>
				</div>
				<div
					class="rounded-xl border border-border bg-surface-raised px-5 py-3 font-mono text-[13px]"
				>
					<span class="text-text-dim">ID: </span><span class="text-accent">stellar</span><span
						class="text-text-dim">:</span
					><span class="text-positive">mainnet</span><span class="text-text-dim">:</span><span
						class="text-warning">CBGPDCJI...6X35</span
					><span class="text-text-dim">#</span><span class="font-bold">1</span>
				</div>
				<div class="space-y-1 font-mono text-[11px]">
					<p class="mb-2 tracking-wide text-text-dim uppercase">Mainnet Contracts</p>
					<a
						href="https://stellar.expert/explorer/public/contract/CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35"
						target="_blank"
						rel="noopener noreferrer"
						class="flex justify-between rounded-lg border border-border bg-surface px-3 py-1.5 transition hover:border-accent/30"
					>
						<span class="text-text-muted">Identity</span><span class="text-accent">CBGP...6X35</span
						>
					</a>
					<a
						href="https://stellar.expert/explorer/public/contract/CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA"
						target="_blank"
						rel="noopener noreferrer"
						class="flex justify-between rounded-lg border border-border bg-surface px-3 py-1.5 transition hover:border-positive/30"
					>
						<span class="text-text-muted">Reputation</span><span class="text-positive"
							>CBOI...EPPA</span
						>
					</a>
					<a
						href="https://stellar.expert/explorer/public/contract/CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG"
						target="_blank"
						rel="noopener noreferrer"
						class="flex justify-between rounded-lg border border-border bg-surface px-3 py-1.5 transition hover:border-warning/30"
					>
						<span class="text-text-muted">Validation</span><span class="text-warning"
							>CBT6...7UJG</span
						>
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- ─── 6. REPUTATION REGISTRY ────────────────────── -->
	<section id="reputation" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<div class="flex items-center gap-3">
				<p class="font-mono text-[11px] tracking-[0.25em] text-positive uppercase">
					Contract 2 of 3
				</p>
				<a
					href="https://stellar.expert/explorer/public/contract/CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive-soft px-2.5 py-0.5 font-mono text-[10px] text-positive transition hover:bg-positive/15"
				>
					<span class="h-1 w-1 animate-pulse rounded-full bg-positive"></span>
					Mainnet
				</a>
			</div>
			<h2 class="text-3xl font-light tracking-tight">Reputation Registry</h2>
			<p class="max-w-2xl text-[15px] leading-relaxed font-light text-text-muted">
				Real users rate agents. Scores calculated on-chain with weighted averaging.
			</p>
		</div>
		<div class="grid gap-5 sm:grid-cols-2">
			<div class="space-y-4 rounded-xl border border-border bg-surface p-5">
				<div class="flex items-center justify-between">
					<p class="font-mono text-[11px] tracking-wide text-text-dim uppercase">Leaderboard</p>
					<p class="font-mono text-[11px] text-positive">Live on-chain</p>
				</div>
				{#each leaderboard as a, i (a.name)}
					<div class="flex items-center gap-3">
						<span
							class="w-4 text-right font-mono text-[13px] {i === 0
								? 'font-bold text-warning'
								: 'text-text-dim'}">{i + 1}</span
						>
						<div class="flex-1">
							<div class="mb-1 flex justify-between">
								<span class="text-[13px] font-medium">{a.name}</span><span
									class="font-mono text-[11px] text-text-muted">{a.score}/5 &middot; {a.fb}</span
								>
							</div>
							<div class="h-1.5 rounded-full bg-surface-overlay">
								<div
									class="h-full rounded-full {a.pct >= 80
										? 'bg-positive'
										: a.pct >= 60
											? 'bg-accent'
											: 'bg-negative'}"
									style="width: {a.pct}%"
								></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
			<div class="space-y-2">
				<p class="font-mono text-[11px] tracking-wide text-text-dim uppercase">How it works</p>
				{#each ['Weighted Average Deviation (WAD) scoring', 'Self-feedback prevention', 'Categories: Uptime, Success Rate, Reachable', 'Evidence URIs for verifiable proof', 'Revokable feedback with on-chain history', 'Public leaderboard with real-time ranking'] as f (f)}
					<div
						class="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-4 py-2.5"
					>
						<span class="mt-0.5 text-positive">&#10003;</span>
						<p class="text-[13px] text-text-muted">{f}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── 7. VALIDATION REGISTRY ────────────────────── -->
	<section id="validation" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<div class="flex items-center gap-3">
				<p class="font-mono text-[11px] tracking-[0.25em] text-warning uppercase">
					Contract 3 of 3
				</p>
				<a
					href="https://stellar.expert/explorer/public/contract/CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive-soft px-2.5 py-0.5 font-mono text-[10px] text-positive transition hover:bg-positive/15"
				>
					<span class="h-1 w-1 animate-pulse rounded-full bg-positive"></span>
					Mainnet
				</a>
			</div>
			<h2 class="text-3xl font-light tracking-tight">Validation Registry</h2>
			<p class="max-w-2xl text-[15px] leading-relaxed font-light text-text-muted">
				Third-party organizations endorse agents through on-chain attestations.
			</p>
		</div>
		<div class="rounded-xl border border-border bg-surface-raised p-6">
			<div class="flex items-center justify-between gap-3">
				{#each [{ n: '1', l: 'Request', c: 'accent', d: 'Agent owner requests validation' }, { n: '2', l: 'Review', c: 'warning', d: 'Validator inspects the agent' }, { n: '3', l: 'Attest', c: 'positive', d: 'On-chain endorsement submitted' }, { n: '4', l: 'Trust', c: 'text', d: 'Validation badge, verifiable' }] as s, i (s.n)}
					{#if i > 0}<span class="shrink-0 text-text-dim">&rarr;</span>{/if}
					<div class="flex-1 space-y-2 text-center">
						<div
							class="mx-auto h-10 w-10 rounded-lg bg-{s.c === 'text'
								? 'surface-overlay'
								: s.c +
									'-soft'} flex items-center justify-center font-mono text-sm font-bold text-{s.c}"
						>
							{s.n}
						</div>
						<h4 class="text-[13px] font-medium text-{s.c}">{s.l}</h4>
						<p class="text-[11px] text-text-muted">{s.d}</p>
					</div>
				{/each}
			</div>
		</div>
		<div class="grid gap-3 sm:grid-cols-3">
			{#each [{ t: 'Security Audits', d: 'Attest that agent passed security review' }, { t: 'Performance', d: 'Certify uptime, latency, accuracy claims' }, { t: 'Organizational', d: 'Companies endorse agents by their teams' }] as u (u.t)}
				<div class="space-y-1 rounded-xl border border-border bg-surface px-5 py-3">
					<p class="text-[13px] font-medium text-warning">{u.t}</p>
					<p class="text-[11px] text-text-muted">{u.d}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- ─── 8. ARCHITECTURE ───────────────────────────── -->
	<section id="architecture" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<p class="font-mono text-[11px] tracking-[0.25em] text-accent uppercase">Architecture</p>
			<h2 class="text-3xl font-light tracking-tight">Full Stack, Open Source</h2>
		</div>
		<div class="space-y-4 rounded-xl border border-border bg-surface-raised p-6">
			<div class="flex justify-center gap-3">
				{#each [{ l: 'Identity', c: 'accent' }, { l: 'Reputation', c: 'positive' }, { l: 'Validation', c: 'warning' }] as b (b.l)}
					<div class="rounded-lg bg-{b.c}-soft border border-{b.c}/20 px-5 py-2.5 text-center">
						<p class="font-mono text-[9px] text-text-dim">Soroban</p>
						<p class="text-[13px] font-medium text-{b.c}">{b.l}</p>
					</div>
				{/each}
			</div>
			<div class="flex flex-col items-center gap-0.5">
				<div class="h-4 w-px bg-border"></div>
				<span class="rounded bg-surface-overlay px-2 py-0.5 font-mono text-[9px] text-text-dim"
					>events</span
				>
				<div class="h-4 w-px bg-border"></div>
			</div>
			<div class="flex justify-center">
				<div class="rounded-lg border border-border bg-surface-overlay px-8 py-2.5 text-center">
					<p class="text-[13px] font-medium">Event Indexer</p>
				</div>
			</div>
			<div class="flex flex-col items-center gap-0.5">
				<div class="h-4 w-px bg-border"></div>
				<span class="rounded bg-surface-overlay px-2 py-0.5 font-mono text-[9px] text-text-dim"
					>data</span
				>
				<div class="h-4 w-px bg-border"></div>
			</div>
			<div class="flex justify-center gap-3">
				<div class="rounded-lg border border-border bg-surface-overlay px-6 py-2.5 text-center">
					<p class="text-[13px] font-medium">Supabase</p>
				</div>
				<span class="self-center text-text-dim">&rarr;</span>
				<div class="rounded-lg border border-border bg-surface-overlay px-6 py-2.5 text-center">
					<p class="text-[13px] font-medium">REST API</p>
				</div>
			</div>
			<div class="flex flex-col items-center"><div class="h-6 w-px bg-border"></div></div>
			<div class="flex flex-wrap justify-center gap-3">
				{#each [{ l: 'Explorer', c: 'accent' }, { l: 'SDK', c: 'positive' }, { l: 'x402+MPP', c: 'warning' }] as b (b.l)}
					<div class="rounded-lg bg-{b.c}-soft border border-{b.c}/20 px-5 py-2.5 text-center">
						<p class="text-[13px] font-medium text-{b.c}">{b.l}</p>
					</div>
				{/each}
				<div class="rounded-lg border border-border bg-surface-overlay px-5 py-2.5 text-center">
					<p class="text-[13px] font-medium">Your Agent</p>
				</div>
			</div>
		</div>
		<div
			class="flex flex-wrap items-center justify-center gap-2.5 font-mono text-[10px] text-text-dim"
		>
			{#each ['Rust / Soroban', 'TypeScript', 'SvelteKit', 'Supabase', 'Stellar SDK', 'OpenZeppelin'] as t (t)}
				<span class="rounded-full border border-border px-3 py-1">{t}</span>
			{/each}
		</div>
	</section>

	<!-- ─── 9. x402 + MPP ─────────────────────────────── -->
	<section id="payments" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<p class="font-mono text-[11px] tracking-[0.25em] text-warning uppercase">Agent Payments</p>
			<h2 class="text-3xl font-light tracking-tight">HTTP 402 &mdash; Two Payment Protocols</h2>
			<p class="max-w-2xl text-[15px] leading-relaxed font-light text-text-muted">
				Agents charge per request via HTTP 402. We support both x402 and MPP &mdash; clients
				auto-detect.
			</p>
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<!-- x402 -->
			<div class="space-y-3 rounded-xl border border-border bg-surface p-5">
				<div class="flex items-center gap-2">
					<div
						class="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft font-mono text-[10px] font-bold text-accent"
					>
						x4
					</div>
					<div>
						<h3 class="text-[14px] font-medium text-accent">x402</h3>
						<p class="text-[9px] text-text-dim">Facilitator-based</p>
					</div>
				</div>
				<div class="space-y-1.5 text-[12px] text-text-muted">
					<p>
						&bull; Payment through <strong class="text-accent">facilitator</strong> (OZ / Coinbase)
					</p>
					<p>&bull; Facilitator verifies and forwards</p>
					<p>&bull; Cross-chain compatible</p>
				</div>
				<div class="rounded-lg border border-border bg-surface-overlay p-3 font-mono text-[10px]">
					<p class="text-text-dim">// 402 Response</p>
					<p><span class="text-accent">X-Payment</span>: x402-stellar</p>
					<p><span class="text-accent">X-Payment-Amount</span>: 0.01 USDC</p>
				</div>
			</div>
			<!-- MPP -->
			<div class="space-y-3 rounded-xl border border-border bg-surface p-5">
				<div class="flex items-center gap-2">
					<div
						class="flex h-7 w-7 items-center justify-center rounded-lg bg-positive-soft font-mono text-[10px] font-bold text-positive"
					>
						M
					</div>
					<div>
						<h3 class="text-[14px] font-medium text-positive">MPP</h3>
						<p class="text-[9px] text-text-dim">Machine Payments Protocol</p>
					</div>
				</div>
				<div class="space-y-1.5 text-[12px] text-text-muted">
					<p>&bull; <strong class="text-positive">Direct on-chain</strong> settlement</p>
					<p>&bull; No facilitator &mdash; fully decentralized</p>
					<p>&bull; Supports sponsored transactions</p>
				</div>
				<div class="rounded-lg border border-border bg-surface-overlay p-3 font-mono text-[10px]">
					<p class="text-text-dim">// 402 Response</p>
					<p><span class="text-positive">X-Payment</span>: mpp-charge</p>
					<p><span class="text-positive">X-Payment-Destination</span>: GCDE...7KLP</p>
				</div>
			</div>
		</div>
		<div class="flex flex-wrap items-center justify-center gap-2.5 font-mono text-[13px]">
			<span class="rounded-lg border border-border bg-surface-overlay px-4 py-2">Request</span>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg border border-warning/20 bg-warning-soft px-4 py-2 text-warning"
				>402</span
			>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg border border-border bg-surface-overlay px-4 py-2">Auto-detect</span>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg border border-positive/20 bg-positive-soft px-4 py-2 text-positive"
				>Pay</span
			>
			<span class="text-text-dim">&rarr;</span>
			<span class="rounded-lg border border-border bg-surface-overlay px-4 py-2">Result</span>
		</div>
	</section>

	<!-- ─── 10. SCRAPER AGENT ─────────────────────────── -->
	<section id="scraper" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<p class="font-mono text-[11px] tracking-[0.25em] text-positive uppercase">Live Demo</p>
			<h2 class="text-3xl font-light tracking-tight">Web Scraper Agent</h2>
			<p class="max-w-2xl text-[15px] leading-relaxed font-light text-text-muted">
				A real agent on 8004 &mdash; registered on-chain, accepting x402 + MPP, earning USDC.
			</p>
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<!-- Agent card -->
			<div class="space-y-4 rounded-xl border border-border bg-surface p-5">
				<div class="flex items-center gap-2.5">
					<div
						class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-fill text-sm font-bold text-accent"
					>
						S
					</div>
					<div>
						<h3 class="text-[14px] font-medium">Web Scraper Agent</h3>
						<p class="font-mono text-[9px] text-text-dim">stellar:mainnet:CBGP...6X35#1</p>
					</div>
				</div>
				<div
					class="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border"
				>
					{#each [{ v: '4.5', l: 'Score', c: 'text-positive' }, { v: '12', l: 'Feedback', c: 'text-accent' }, { v: '92%', l: 'Complete', c: 'text-warning' }] as s (s.l)}
						<div class="bg-surface py-2 text-center">
							<p class="text-sm font-medium {s.c}">{s.v}</p>
							<p class="text-[8px] text-text-dim uppercase">{s.l}</p>
						</div>
					{/each}
				</div>
				<div class="rounded-lg border border-border bg-surface-overlay px-3 py-2.5">
					<div class="flex items-center justify-between">
						<span class="text-[13px] font-medium">POST /scrape</span>
						<div class="flex gap-1">
							<span
								class="rounded-full border border-warning/20 bg-warning-soft px-2 py-0.5 font-mono text-[10px] text-warning"
								>x402</span
							>
							<span
								class="rounded-full border border-positive/20 bg-positive-soft px-2 py-0.5 font-mono text-[10px] text-positive"
								>MPP</span
							>
						</div>
					</div>
					<p class="mt-1 text-[10px] text-text-dim">Scrapes any URL, returns structured content</p>
				</div>
			</div>
			<!-- TryAgent mockup -->
			<div class="overflow-hidden rounded-xl border border-border">
				<div class="flex items-center gap-2 border-b border-border bg-surface-overlay px-3 py-2">
					<div class="flex gap-1.5">
						<div class="h-2 w-2 rounded-full bg-negative/60"></div>
						<div class="h-2 w-2 rounded-full bg-warning/60"></div>
						<div class="h-2 w-2 rounded-full bg-positive/60"></div>
					</div>
					<div class="mx-2 flex-1">
						<div class="rounded bg-surface px-2 py-0.5 font-mono text-[9px] text-text-dim">
							stellar8004.com/agents/1
						</div>
					</div>
				</div>
				<div class="space-y-3 bg-surface p-4">
					<div class="flex items-center justify-between">
						<h4 class="text-[13px] font-medium">Try This Agent</h4>
						<span
							class="rounded-full border border-positive/20 bg-positive-soft px-2 py-0.5 font-mono text-[10px] text-positive"
							>Live</span
						>
					</div>
					<div
						class="flex justify-between rounded-lg border border-border bg-surface-raised px-3 py-2"
					>
						<span class="text-[11px]">POST /scrape</span><span
							class="font-mono text-[9px] text-warning">$0.01 USDC</span
						>
					</div>
					<div>
						<p class="mb-1 font-mono text-[9px] text-text-dim">Request Body</p>
						<div
							class="rounded-lg border border-border bg-surface-overlay p-2.5 font-mono text-[10px]"
						>
							{'{'}<br />&nbsp;&nbsp;<span class="text-accent">"url"</span>:
							<span class="text-positive">"https://example.com/news"</span><br />}
						</div>
					</div>
					<div
						class="rounded-xl border border-accent/30 bg-accent-fill py-2.5 text-center text-[13px] font-medium text-accent"
					>
						Send Request &rarr;
					</div>
					<div class="rounded-lg border border-positive/20 bg-positive-soft p-2.5">
						<div class="flex justify-between">
							<span class="font-mono text-[9px] text-positive">HTTP 200 OK</span><span
								class="font-mono text-[8px] text-text-dim">tx 8f3a...c21d</span
							>
						</div>
						<p class="mt-1 font-mono text-[9px] text-text-muted">
							{'{'} "title": "Breaking News...", "content": "..." }
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ─── 11. FEEDBACK LOOP ─────────────────────────── -->
	<section id="feedback" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<p class="font-mono text-[11px] tracking-[0.25em] text-positive uppercase">Trust Loop</p>
			<h2 class="text-3xl font-light tracking-tight">Use &rarr; Rate &rarr; Trust</h2>
			<p class="max-w-2xl text-[15px] leading-relaxed font-light text-text-muted">
				Every interaction builds the trust layer. Feedback is on-chain, permanent, transparent.
			</p>
		</div>
		<div class="grid gap-5 sm:grid-cols-2">
			<div class="space-y-4 rounded-xl border border-border bg-surface p-5">
				<p class="font-mono text-[11px] tracking-wide text-text-dim uppercase">Score Impact</p>
				<div>
					<div class="mb-1.5 flex justify-between text-[13px]">
						<span class="text-text-muted">Before</span><span class="font-mono text-accent">4.2</span
						>
					</div>
					<div class="h-2 rounded-full bg-surface-overlay">
						<div class="h-full rounded-full bg-accent" style="width: 84%"></div>
					</div>
				</div>
				<p class="text-center font-mono text-[10px] text-text-dim">
					+ feedback: 5/6 "Success Rate"
				</p>
				<div>
					<div class="mb-1.5 flex justify-between text-[13px]">
						<span class="text-text-muted">After</span><span class="font-mono text-positive"
							>4.3</span
						>
					</div>
					<div class="h-2 rounded-full bg-surface-overlay">
						<div class="h-full rounded-full bg-positive" style="width: 86%"></div>
					</div>
				</div>
			</div>
			<div class="space-y-3">
				<p class="font-mono text-[11px] tracking-wide text-text-dim uppercase">Recent Feedback</p>
				{#each [{ score: 5, tag: 'Success Rate', from: 'GBXK...3F2Q', time: 'just now', hl: true }, { score: 4, tag: 'Uptime', from: 'GABC...9XYZ', time: '2d ago', hl: false }, { score: 5, tag: 'Reachable', from: 'GDEF...4MNO', time: '5d ago', hl: false }] as f (f.from)}
					<div
						class="rounded-xl border {f.hl
							? 'border-positive/20 bg-positive-soft'
							: 'border-border bg-surface'} flex items-center justify-between px-4 py-3"
					>
						<div class="flex items-center gap-2.5">
							<div class="flex gap-0.5">
								{#each [0, 1, 2, 3, 4, 5] as j (j)}<div
										class="h-2 w-2 rounded-sm {j < f.score ? 'bg-positive' : 'bg-surface-overlay'}"
									></div>{/each}
							</div>
							<span class="font-mono text-[11px] text-text-dim">{f.tag}</span>
						</div>
						<div class="text-right">
							<p class="font-mono text-[10px] text-text-dim">{f.from}</p>
							<p class="text-[9px] text-text-dim">{f.time}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── 12. DEVELOPER TOOLS ───────────────────────── -->
	<section id="devtools" class="reveal-on-scroll scroll-mt-8 space-y-8">
		<div class="space-y-3">
			<p class="font-mono text-[11px] tracking-[0.25em] text-accent uppercase">
				Developer Experience
			</p>
			<h2 class="text-3xl font-light tracking-tight">Build on 8004 in Minutes</h2>
			<p class="max-w-2xl text-[15px] leading-relaxed font-light text-text-muted">
				TypeScript SDK, REST API, and registration examples.
			</p>
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-3 rounded-xl border border-border bg-surface p-5">
				<div class="flex items-center justify-between">
					<p class="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">
						TypeScript SDK
					</p>
					<a
						href="https://www.npmjs.com/package/@trionlabs/stellar8004"
						target="_blank"
						rel="noopener noreferrer"
						class="rounded-full border border-accent/20 bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent transition hover:bg-accent/15"
						>@trionlabs/stellar8004</a
					>
				</div>
				<div
					class="rounded-lg border border-border bg-surface-overlay p-3 font-mono text-[11px] leading-relaxed"
				>
					<p><span class="text-accent">import</span> {'{'} IdentityClient, MAINNET_CONFIG }</p>
					<p class="pl-2 text-text-dim">
						<span class="text-accent">from</span>
						<span class="text-positive">'@trionlabs/stellar8004'</span>;
					</p>
					<p class="mt-2">
						<span class="text-accent">const</span> identity = <span class="text-accent">new</span>
						<span class="text-warning">IdentityClient</span>({'{'}
					</p>
					<p class="pl-2">rpcUrl: MAINNET_CONFIG.rpcUrl,</p>
					<p class="pl-2">networkPassphrase: MAINNET_CONFIG.networkPassphrase,</p>
					<p class="pl-2">contractId: MAINNET_CONFIG.contracts.identity</p>
					<p>});</p>
					<p class="mt-2">
						<span class="text-accent">const</span>
						{'{'} result: owner } =
						<span class="text-accent">await</span> identity.<span class="text-warning"
							>owner_of</span
						>({'{'} token_id: <span class="text-positive">1</span> });
					</p>
					<p>console.log(owner);</p>
				</div>
			</div>
			<div class="space-y-3 rounded-xl border border-border bg-surface p-5">
				<div class="flex items-center justify-between">
					<p class="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">
						Stellar Development Skills
					</p>
					<a
						href="https://github.com/stellar/stellar-dev-skill"
						target="_blank"
						rel="noopener noreferrer"
						class="rounded-full border border-accent/20 bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent transition hover:bg-accent/15"
						>GitHub</a
					>
				</div>
				<div
					class="space-y-2 rounded-lg border border-border bg-surface-overlay p-3 font-mono text-[11px] leading-relaxed"
				>
					<div>
						<p class="text-text-dim"># Install the official Stellar skills</p>
						<p>
							<span class="text-positive">$</span> npx skills add https://github.com/stellar/stellar-dev-skill
						</p>
					</div>
					<div>
						<p>
							<span class="text-text-dim">Choose the skills relevant to your project.</span>
						</p>
					</div>
				</div>
			</div>
			<div class="space-y-3 rounded-xl border border-border bg-surface p-5">
				<p class="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">REST API</p>
				<div class="space-y-1.5 font-mono text-[11px]">
					{#each [{ m: 'GET', p: '/api/v1/agents', d: 'List all' }, { m: 'GET', p: '/api/v1/agents/:id', d: 'Details + score' }, { m: 'GET', p: '/api/v1/agents/:id/feedback', d: 'Feedback' }, { m: 'GET', p: '/api/v1/search?q=...', d: 'Search' }, { m: 'GET', p: '/api/v1/stats', d: 'Stats' }] as e (e.p)}
						<div class="flex gap-2.5">
							<span class="w-7 text-positive">{e.m}</span><span class="flex-1">{e.p}</span><span
								class="text-[10px] text-text-dim">{e.d}</span
							>
						</div>
					{/each}
				</div>
			</div>
			<div class="space-y-3 rounded-xl border border-border bg-surface p-5">
				<p class="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">
					5-Step Registration
				</p>
				{#each [{ s: '1', l: 'Basic Info', d: 'Name, description, image' }, { s: '2', l: 'Services', d: 'MCP, A2A, REST endpoints' }, { s: '3', l: 'Advanced', d: 'Trust model, x402/MPP' }, { s: '4', l: 'URI', d: 'Auto data URI or IPFS' }, { s: '5', l: 'Review', d: 'Connect wallet, sign tx' }] as step (step.l)}
					<div class="flex items-center gap-2.5 rounded-lg bg-surface-overlay px-3 py-1.5">
						<span class="w-4 font-mono text-sm font-bold text-accent">{step.s}</span>
						<span class="w-24 text-[13px] font-medium">{step.l}</span>
						<span class="text-[11px] text-text-dim">{step.d}</span>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ─── 13. CLOSING CTA ───────────────────────────── -->
	<section
		id="closing"
		class="reveal-on-scroll flex scroll-mt-8 flex-col items-center space-y-8 py-12 text-center"
	>
		<div class="flex items-center gap-3">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-fill text-xl font-bold text-accent"
			>
				8
			</div>
			<span class="text-4xl font-light tracking-tight"
				>stellar<span
					class="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text font-semibold text-transparent"
					>8004</span
				>.com</span
			>
		</div>
		<div class="flex flex-wrap items-center justify-center gap-8">
			{#each [{ w: 'Discover.', d: 'Find any AI agent on Stellar', c: 'text-accent' }, { w: 'Use.', d: 'Pay per request with x402 + MPP', c: 'text-warning' }, { w: 'Trust.', d: 'On-chain reputation from real users', c: 'text-positive' }, { w: 'Build.', d: 'SDK, docs, open source tools', c: 'text-text' }] as item (item.w)}
				<div class="space-y-1 text-center">
					<p class="text-xl font-medium {item.c}">{item.w}</p>
					<p class="max-w-32 text-[11px] text-text-muted">{item.d}</p>
				</div>
			{/each}
		</div>
		<div class="h-px w-20 bg-border"></div>
		<div class="flex items-center gap-6">
			{#each [{ v: '3', l: 'Contracts' }, { v: '74', l: 'Tests' }, { v: 'Mainnet', l: 'Network' }, { v: 'MIT', l: 'License' }] as s (s.l)}
				<div class="text-center">
					<p class="font-mono text-lg font-medium text-accent">{s.v}</p>
					<p class="text-[10px] tracking-wide text-text-dim uppercase">{s.l}</p>
				</div>
			{/each}
		</div>
		<a href="https://stellar8004.com" class="text-2xl font-light text-accent hover:underline"
			>stellar8004.com</a
		>
		<p class="font-mono text-[13px] text-text-dim">
			Open Source &middot; Mainnet &middot; Trustless
		</p>
		<div
			class="flex flex-wrap items-center justify-center gap-2.5 font-mono text-[10px] text-text-dim"
		>
			{#each ['Rust', 'Soroban', 'TypeScript', 'SvelteKit', 'Supabase', 'Stellar'] as t (t)}
				<span class="rounded-full border border-border px-3 py-1">{t}</span>
			{/each}
		</div>

		<!-- Attribution badges -->
		<div class="h-px w-20 bg-border"></div>
		<div class="flex flex-wrap items-center justify-center gap-3">
			<a
				href="https://x.com/trionlabs"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-4 py-1.5 font-mono text-[11px] text-text-muted transition hover:border-accent/30 hover:text-text"
			>
				<svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"
					><path
						d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
					/></svg
				>
				Built by Trionlabs
			</a>
			<div
				class="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-4 py-1.5 font-mono text-[11px] text-accent"
			>
				<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
				Agent Trust Protocol on Stellar
			</div>
		</div>
	</section>
</div>

<style>
	.animate-fade-out {
		animation: fade-out 6s ease forwards;
	}
	@keyframes fade-out {
		0%,
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
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
