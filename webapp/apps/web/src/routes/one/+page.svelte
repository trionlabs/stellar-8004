<script lang="ts">
	import { resolve } from '$app/paths';

	// Theme colors (matching presentation theme)
	const c = {
		accent: 'var(--color-accent)',
		accentSoft: 'var(--color-accent-soft)',
		positive: 'var(--color-positive)',
		positiveSoft: 'var(--color-positive-soft)',
		warning: 'var(--color-warning)',
		warningSoft: 'var(--color-warning-soft)',
		negative: 'var(--color-negative)',
		negativeSoft: 'var(--color-negative-soft)',
		surface: 'var(--color-surface)',
		raised: 'var(--color-surface-raised)',
		overlay: 'var(--color-surface-overlay)',
		text: 'var(--color-text)',
		muted: 'var(--color-text-muted)',
		dim: 'var(--color-text-dim)',
		border: 'var(--color-border)',
		gold: 'var(--color-medal-gold)',
	};

	function style(obj: Record<string, string>): string {
		return Object.entries(obj)
			.map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`)
			.join(' ');
	}

	const cardStyle = style({
		background: c.raised,
		border: `1px solid ${c.border}`,
		borderRadius: '0.75rem',
		boxShadow: 'var(--shadow-sm)',
	});

	function badgeStyle(color: string): string {
		return style({
			background: `color-mix(in oklch, ${color} 6%, transparent)`,
			color,
			border: `1px solid color-mix(in oklch, ${color} 15%, transparent)`,
			borderRadius: '9999px',
			padding: '0.125rem 0.5rem',
			fontSize: '10px',
			fontFamily: 'var(--font-mono)',
			fontWeight: '500',
		});
	}

	function pillStyle(color: string): string {
		return style({
			background: `color-mix(in oklch, ${color} 6%, transparent)`,
			color,
			border: `1px solid color-mix(in oklch, ${color} 15%, transparent)`,
			borderRadius: '0.5rem',
			padding: '0.375rem 0.875rem',
			fontSize: '13px',
			fontFamily: 'var(--font-mono)',
		});
	}

	const neutralPill = style({
		background: c.overlay,
		border: `1px solid ${c.border}`,
		borderRadius: '0.5rem',
		padding: '0.375rem 0.875rem',
		fontSize: '13px',
		fontFamily: 'var(--font-mono)',
	});

	function bg(color: string, opacity = '08'): string {
		const pct = parseInt(opacity, 16) / 2.55;
		return `color-mix(in oklch, ${color} ${pct}%, transparent)`;
	}

	function brdr(color: string, opacity = '20'): string {
		const pct = parseInt(opacity, 16) / 2.55;
		return `1px solid color-mix(in oklch, ${color} ${pct}%, transparent)`;
	}

	const problems = [
		{
			icon: '?',
			title: 'No Discovery',
			desc: 'Thousands of AI agents exist but no unified registry. Each lives in its own silo.',
		},
		{
			icon: '!',
			title: 'No Trust',
			desc: 'No way to verify reliability. No reputation system, no accountability.',
		},
		{
			icon: '$',
			title: 'No Payments',
			desc: 'No native micropayment layer. No agent economy — just free demos or subscriptions.',
		},
	];

	const solutionPillars = [
		{
			label: 'Identity',
			color: c.accent,
			desc: 'Register agents as NFTs with on-chain metadata, wallet binding, and service discovery.',
		},
		{
			label: 'Reputation',
			color: c.positive,
			desc: 'Real users leave feedback. Scores calculated with weighted averaging. Public leaderboard.',
		},
		{
			label: 'Validation',
			color: c.warning,
			desc: 'Third-party organizations formally endorse agents through on-chain attestations.',
		},
	];

	const deliverables = [
		{
			num: '01',
			title: '3 Soroban Contracts',
			color: c.accent,
			items: ['Identity Registry (Agent NFTs)', 'Reputation Registry (Feedback & Scores)', 'Validation Registry (Attestations)'],
			footer: '74 tests · Mainnet · OpenZeppelin',
		},
		{
			num: '02',
			title: 'x402 + MPP Payments',
			color: c.warning,
			items: ['Two HTTP 402 protocols: x402 & MPP', 'MPP: direct on-chain, no facilitator', 'x402: facilitator-based (OZ / Coinbase)', 'TryAgent: auto-detects in Explorer'],
			footer: 'Pay-per-request · USDC · ~5s settlement',
		},
		{
			num: '03',
			title: 'TypeScript SDK',
			color: c.positive,
			items: ['@trionlabs/stellar8004 package', 'Full contract client wrappers', 'Agent metadata builder & auto-storage'],
			footer: 'Query, register, feedback, validate',
		},
		{
			num: '04',
			title: 'Explorer Web App',
			color: c.accent,
			items: ['Agent search & advanced filtering', 'Agent profiles with scores & services', 'TryAgent: use & pay in-browser'],
			footer: 'SvelteKit · stellar8004.com · Live',
		},
		{
			num: '05',
			title: 'Event Indexer',
			color: c.accent,
			items: ['Real-time Soroban event indexing', 'URI resolution & metadata extraction', 'REST API with 7 public endpoints'],
			footer: 'Supabase Edge Functions · PostgreSQL',
		},
		{
			num: '06',
			title: 'Claude Code Skills',
			color: c.accent,
			items: ['/8004stellar — trust playbook', '/x402stellar — payment integration', '/stellar-dev — full Stellar guide'],
			footer: 'AI-native developer experience',
		},
	];

	const identityFeatures = [
		{ label: 'Agent NFTs', desc: 'Each agent minted as a unique NFT on Stellar' },
		{ label: 'On-chain Metadata', desc: 'Name, description, image, services — all immutable' },
		{ label: 'Wallet Binding', desc: 'Link agent to a Stellar wallet with dual-auth' },
		{ label: 'Service Discovery', desc: 'Expose endpoints (MCP, A2A, REST, x402) on-chain' },
		{ label: 'Ownership Transfer', desc: '2-step transfer with OpenZeppelin security model' },
		{ label: 'Timelocked Upgrades', desc: '3-day timelock on contract upgrades for safety' },
	];

	const metadata = [
		{ key: 'name', value: '"Web Scraper Agent"' },
		{ key: 'description', value: '"Scrapes web pages on demand"' },
		{ key: 'services', value: '[{ endpoint, protocol }]' },
		{ key: 'supportedTrust', value: '["reputation"]' },
		{ key: 'x402', value: 'true' },
	];

	const leaderboardAgents = [
		{ name: 'Web Scraper', score: 4.5, feedback: 12, pct: 90 },
		{ name: 'Data Analyst', score: 4.2, feedback: 8, pct: 84 },
		{ name: 'Code Review', score: 3.8, feedback: 15, pct: 76 },
		{ name: 'Translator', score: 3.5, feedback: 6, pct: 70 },
		{ name: 'Summarizer', score: 2.1, feedback: 3, pct: 42 },
	];

	const reputationFeatures = [
		'Weighted Average Deviation (WAD) scoring',
		"Self-feedback prevention (can't rate own agent)",
		'Categories: Uptime, Success Rate, Reachable',
		'Evidence URIs for verifiable proof',
		'Revokable feedback with on-chain history',
		'Public leaderboard with real-time ranking',
	];

	const validationSteps = [
		{ n: '1', label: 'Request', color: c.accent, desc: 'Agent owner requests validation from a trusted validator' },
		{ n: '2', label: 'Review', color: c.warning, desc: 'Validator inspects agent, tests functionality' },
		{ n: '3', label: 'Attest', color: c.positive, desc: 'Validator submits endorsement on-chain' },
		{ n: '4', label: 'Trust', color: c.text, desc: 'Agent displays validation badge, verifiable on-chain' },
	];

	const validationUses = [
		{ t: 'Security Audits', d: 'Validators attest agent passed security review' },
		{ t: 'Performance Benchmarks', d: 'Third parties certify uptime, latency, accuracy' },
		{ t: 'Organizational Trust', d: 'Companies endorse agents built by their teams' },
	];

	const explorerFeatures = [
		{
			s: 'Discovery',
			items: ['Full-text search across agents', 'Filter by trust type, x402, score', 'Sort by score, date, feedback'],
		},
		{
			s: 'Agent Profile',
			items: ['Trust score with visual bar', 'Service endpoints + protocol badges', 'On-chain metadata viewer'],
		},
		{
			s: 'Reputation',
			items: ['Feedback history with score cards', 'Category tags (Uptime, Success Rate)', 'Submit feedback with wallet'],
		},
		{
			s: 'More',
			items: ['Leaderboard', 'TryAgent (x402/MPP)', '5-step registration'],
		},
	];

	const restEndpoints = [
		{ method: 'GET', path: '/api/v1/agents', desc: 'List all agents' },
		{ method: 'GET', path: '/api/v1/agents/:id', desc: 'Agent details + score' },
		{ method: 'GET', path: '/api/v1/agents/:id/feedback', desc: 'Agent feedback' },
		{ method: 'GET', path: '/api/v1/search?q=...', desc: 'Full-text search' },
		{ method: 'GET', path: '/api/v1/stats', desc: 'Network statistics' },
	];

	const registrationSteps = [
		{ step: '1', label: 'Basic Info', desc: 'Name, description, image URL' },
		{ step: '2', label: 'Services', desc: 'Endpoints, protocols (MCP, A2A, REST)' },
		{ step: '3', label: 'Advanced', desc: 'Trust model, x402/MPP toggle' },
		{ step: '4', label: 'URI', desc: 'Auto data URI or custom IPFS/HTTPS' },
		{ step: '5', label: 'Review', desc: 'Preview, connect wallet, sign tx' },
	];

	const trustLoop = [
		{ pos: 'top', n: '1', label: 'Discover', sub: 'Find on Explorer', c: c.accent },
		{ pos: 'right', n: '2', label: 'Use & Pay', sub: 'x402 / MPP', c: c.warning },
		{ pos: 'bottom', n: '3', label: 'Rate', sub: 'Submit feedback', c: c.positive },
		{ pos: 'left', n: '4', label: 'Trust', sub: 'Score updates', c: c.text },
	];

	const recentFeedback = [
		{ score: 5, tag: 'Success Rate', from: 'GBXK...3F2Q', time: 'just now', highlight: true },
		{ score: 4, tag: 'Uptime', from: 'GABC...9XYZ', time: '2 days ago', highlight: false },
		{ score: 5, tag: 'Reachable', from: 'GDEF...4MNO', time: '5 days ago', highlight: false },
	];

	const techStack = ['Rust / Soroban', 'TypeScript', 'SvelteKit', 'Supabase', 'Stellar SDK', 'OpenZeppelin'];

	const closingWords = [
		{ word: 'Discover.', desc: 'Find any AI agent on Stellar', c: c.accent },
		{ word: 'Use.', desc: 'Pay per request with x402 + MPP', c: c.warning },
		{ word: 'Trust.', desc: 'On-chain reputation from real users', c: c.positive },
		{ word: 'Build.', desc: 'SDK, skills, and open source tools', c: c.text },
	];

	const stats = [
		{ v: '3', l: 'Contracts' },
		{ v: '74', l: 'Tests' },
		{ v: 'Mainnet', l: 'Network' },
		{ v: 'MIT', l: 'License' },
	];
</script>

<svelte:head>
	<title>Stellar8004 — Agent Trust Protocol</title>
	<meta name="description" content="Find, Use, and Trust AI Agents on Stellar. Agent Trust Protocol with on-chain identity, reputation, and validation." />
</svelte:head>

<div class="space-y-24 pb-24">
	<!-- Title Slide -->
	<section class="flex flex-col items-center justify-center text-center gap-6 py-24">
		<div class="flex items-center gap-3">
			<div
				class="h-12 w-12 rounded-xl flex items-center justify-center text-xl font-bold"
				style={style({ background: c.accent, color: '#fff' })}
			>
				8
			</div>
			<span class="text-4xl font-light tracking-tight">
				Stellar<span class="font-semibold" style={style({ color: c.accent })}>8004</span>
			</span>
		</div>
		<h1 class="text-xl font-light text-text-muted max-w-lg leading-relaxed">
			Find, Use, and Trust AI Agents on Stellar
		</h1>
		<div class="w-16 h-px" style={style({ background: c.border })} />
		<div class="space-y-2">
			<p class="text-base font-medium" style={style({ color: c.accent })}>Agent Trust Protocol</p>
			<p class="text-xs text-text-dim font-mono">
				On-chain Identity · Reputation · Validation · x402 + MPP Payments
			</p>
		</div>
		<div class="mt-4 flex items-center gap-5 text-[11px] text-text-dim font-mono flex-wrap justify-center">
			<span>EIP-8004 Standard</span>
			<span style={style({ color: c.border })}>|</span>
			<span>Stellar / Soroban</span>
			<span style={style({ color: c.border })}>|</span>
			<span>Open Source</span>
			<span style={style({ color: c.border })}>|</span>
			<span style={style({ color: c.positive })}>Mainnet Live</span>
		</div>
	</section>

	<!-- Problem Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.negative })}>
				The Problem
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">
				Thousands of AI agents. <span style={style({ fontWeight: 500, color: c.negative })}>Zero trust.</span>
			</h2>
		</div>
		<div class="grid gap-4 sm:grid-cols-3">
			{#each problems as p}
				<div class="p-5 space-y-3" style={cardStyle}>
					<div
						class="h-10 w-10 rounded-lg flex items-center justify-center font-mono text-lg font-bold"
						style={{
							color: c.negative,
							background: c.negativeSoft,
							border: `1px solid color-mix(in oklch, ${c.negative} 15%, transparent)`,
						}}
					>
						{p.icon}
					</div>
					<h3 class="text-base font-medium">{p.title}</h3>
					<p class="text-[13px] text-text-muted leading-relaxed">{p.desc}</p>
				</div>
			{/each}
		</div>
		<p class="text-center text-[13px] text-text-dim">
			AI agents need an open, verifiable trust infrastructure — not another centralized marketplace.
		</p>
	</section>

	<!-- Solution Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.positive })}>
				The Solution
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">
				<span style={style({ fontWeight: 600, color: c.accent })}>8004</span> — Agent Trust Protocol
			</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				An open standard for AI agent identity, reputation, and trust. Three smart contracts on Stellar/Soroban.
			</p>
		</div>
		<div class="grid gap-4 sm:grid-cols-3">
			{#each solutionPillars as p}
				<div class="p-5 space-y-3" style={cardStyle}>
					<div class="h-1.5 w-10 rounded-full" style={style({ background: p.color })} />
					<h3 class="text-lg font-medium">{p.label}</h3>
					<p class="text-[13px] text-text-muted leading-relaxed">{p.desc}</p>
				</div>
			{/each}
		</div>
		<div class="flex items-center justify-center gap-3 flex-wrap">
			<span style={pillStyle(c.accent)}>Register</span>
			<span class="text-text-dim">→</span>
			<span style={pillStyle(c.positive)}>Use & Rate</span>
			<span class="text-text-dim">→</span>
			<span style={pillStyle(c.warning)}>Validate</span>
			<span class="text-text-dim">→</span>
			<span style={neutralPill}>Discover & Trust</span>
		</div>
		<div class="flex items-center justify-center gap-3 text-[11px] font-mono text-text-dim flex-wrap">
			{#each ['EIP-8004', 'Stellar / Soroban', '74 Tests', 'Reproducible Builds'] as t}
				<span class="rounded-full px-3 py-1" style={style({ border: `1px solid ${c.border}` })}>{t}</span>
			{/each}
			<span
				class="rounded-full px-3 py-1"
				style={{
					color: c.positive,
					border: `1px solid color-mix(in oklch, ${c.positive} 25%, transparent)`,
				}}
			>
				Mainnet Live
			</span>
		</div>
	</section>

	<!-- What We Built Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.positive })}>
				Hackathon Deliverables
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">What We Built</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				End-to-end infrastructure for AI agent trust on Stellar — from smart contracts to a live explorer and a real working agent.
			</p>
		</div>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each deliverables as d}
				<div class="p-4 space-y-2" style={cardStyle}>
					<div class="flex items-center gap-2">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold"
							style={{
								background: `color-mix(in oklch, ${d.color} 8%, transparent)`,
								color: d.color,
								border: `1px solid color-mix(in oklch, ${d.color} 15%, transparent)`,
							}}
						>
							{d.num}
						</span>
						<h3 class="text-[13px] font-medium" style={style({ color: d.color })}>{d.title}</h3>
					</div>
					<ul class="space-y-0.5 text-[12px] text-text-muted">
						{#each d.items as item}
							<li class="flex items-start gap-1.5">
								<span class="mt-0.5 text-[7px]" style={style({ color: d.color })}>▶</span>
								<span>{item}</span>
							</li>
						{/each}
					</ul>
					<p class="text-[9px] font-mono text-text-dim">{d.footer}</p>
				</div>
			{/each}
		</div>
		<div
			class="rounded-lg px-4 py-2 text-center text-[13px]"
			style={{
				background: c.positiveSoft,
				border: `1px solid color-mix(in oklch, ${c.positive} 15%, transparent)`,
			}}
		>
			<span style={style({ color: c.positive })} class="font-medium">+ Real Working Agent</span>
			<span class="text-text-muted"> — Web Scraper on 8004, accepting x402 + MPP, earning USDC</span>
		</div>
	</section>

	<!-- Identity Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.accent })}>
				Contract 1 of 3
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Identity Registry</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				Every AI agent gets an on-chain identity — discoverable, verifiable, permanent.
			</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="space-y-2">
				{#each identityFeatures as f, i}
					<div
						class="flex items-start gap-2.5 rounded-lg p-2.5"
						style={style({ background: c.raised, border: `1px solid ${c.border}` })}
					>
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold"
							style={style({ background: c.accentSoft, color: c.accent })}
						>
							{String(i + 1).padStart(2, '0')}
						</span>
						<div class="min-w-0">
							<p class="text-[13px] font-medium" style={style({ color: c.accent })}>{f.label}</p>
							<p class="text-[11px] text-text-muted">{f.desc}</p>
						</div>
					</div>
				{/each}
			</div>
			<div class="space-y-3">
				<div class="rounded-lg p-4" style={style({ background: c.overlay, border: `1px solid ${c.border}` })}>
					<p class="text-[11px] font-mono tracking-widest uppercase mb-3" style={style({ color: c.accent })}>
						Agent Metadata
					</p>
					<div
						class="rounded-lg p-3 font-mono text-[12px] leading-relaxed"
						style={style({ background: c.raised, border: `1px solid ${c.border}` })}
					>
						<p class="text-text-dim">{'{'}</p>
						{#each metadata as m, i}
							<p class="pl-4">
								<span style={style({ color: c.accent })}>{m.key}</span>
								<span class="text-text-dim">: </span>
								<span style={style({ color: c.positive })}>{m.value}</span>
								{#if i < metadata.length - 1}
									<span class="text-text-dim">,</span>
								{/if}
							</p>
						{/each}
						<p class="text-text-dim">{'}'}</p>
					</div>
					<p class="text-[10px] font-mono text-text-dim mt-2">
						Max: 64B keys · 4KB values · 100 keys/agent
					</p>
				</div>
				<div
					class="rounded-lg px-4 py-2.5 font-mono text-[12px]"
					style={style({ background: c.raised, border: `1px solid ${c.border}` })}
				>
					<span class="text-text-dim">Agent ID: </span>
					<span style={style({ color: c.accent })}>stellar</span>
					<span class="text-text-dim">:</span>
					<span style={style({ color: c.positive })}>mainnet</span>
					<span class="text-text-dim">:</span>
					<span style={style({ color: c.warning })}>CBGPDCJI...6X35</span>
					<span class="text-text-dim">#</span>
					<span class="font-bold">1</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Reputation Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.positive })}>
				Contract 2 of 3
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Reputation Registry</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				Real users rate agents. Scores calculated on-chain with weighted averaging. No one can fake it.
			</p>
		</div>
		<div class="grid gap-5 lg:grid-cols-2">
			<div class="p-4 space-y-4" style={cardStyle}>
				<div class="flex items-center justify-between">
					<p class="text-[11px] font-mono text-text-dim tracking-wider uppercase">Leaderboard</p>
					<p class="text-[11px] font-mono" style={style({ color: c.positive })}>Live on-chain</p>
				</div>
				<div class="space-y-2.5">
					{#each leaderboardAgents as a, i}
						<div class="flex items-center gap-3">
							<span
								class="font-mono text-[13px] w-4 text-right"
								style={style(i === 0 ? { color: c.gold, fontWeight: 700 } : { color: c.dim })}
							>
								{i + 1}
							</span>
							<div class="flex-1">
								<div class="flex items-center justify-between mb-1">
									<span class="text-[13px] font-medium">{a.name}</span>
									<span class="text-[11px] font-mono text-text-muted">
										{a.score}/5 · {a.feedback}
									</span>
								</div>
								<div class="h-1.5 rounded-full" style={style({ background: c.overlay })}>
									<div
										class="h-full rounded-full"
										style={{
											width: `${a.pct}%`,
											background: a.pct >= 80 ? c.positive : a.pct >= 60 ? c.accent : c.negative,
										}}
									/>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
			<div class="space-y-2">
				<p class="text-[11px] font-mono text-text-dim tracking-wider uppercase">How it works</p>
				{#each reputationFeatures as f}
					<div
						class="flex items-start gap-2.5 rounded-lg px-3 py-2"
						style={style({ background: c.raised, border: `1px solid ${c.border}` })}
					>
						<span style={style({ color: c.positive })}>✓</span>
						<p class="text-[13px] text-text-muted">{f}</p>
					</div>
				{/each}
			</div>
		</div>
		<div class="flex items-center justify-center">
			<div
				class="rounded-lg px-5 py-2 font-mono text-[13px] text-text-muted"
				style={style({ background: c.overlay, border: `1px solid ${c.border}` })}
			>
				score = <span style={style({ color: c.accent })}> WAD</span>(feedback[].value) → stored as{' '}
				<span style={style({ color: c.positive })}>u64</span> on-chain
			</div>
		</div>
	</section>

	<!-- Validation Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.warning })}>
				Contract 3 of 3
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Validation Registry</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				Third-party organizations formally endorse agents through on-chain attestations.
			</p>
		</div>
		<div class="rounded-xl p-5" style={style({ background: c.raised, border: `1px solid ${c.border}` })}>
			<div class="flex items-center justify-between gap-2 flex-wrap">
				{#each validationSteps as s, i}
					<div class="flex items-center gap-2 flex-1 min-w-[140px]">
						<div class="flex-1 text-center space-y-2">
							<div
								class="mx-auto h-10 w-10 rounded-lg flex items-center justify-center font-mono text-sm font-bold"
								style={{
									background: `color-mix(in oklch, ${s.color} 8%, transparent)`,
									border: `1px solid color-mix(in oklch, ${s.color} 15%, transparent)`,
									color: s.color,
								}}
							>
								{s.n}
							</div>
							<h4 class="text-[13px] font-medium" style={style({ color: s.color })}>{s.label}</h4>
							<p class="text-[11px] text-text-muted leading-snug">{s.desc}</p>
						</div>
						{#if i < validationSteps.length - 1}
							<span class="text-text-dim shrink-0">→</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
		<div class="grid gap-3 sm:grid-cols-3">
			{#each validationUses as u}
				<div
					class="rounded-lg px-4 py-3 space-y-1"
					style={style({ background: c.raised, border: `1px solid ${c.border}` })}
				>
					<p class="text-[13px] font-medium" style={style({ color: c.warning })}>{u.t}</p>
					<p class="text-[11px] text-text-muted">{u.d}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Architecture Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.accent })}>
				Architecture
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Full Stack, Open Source</h2>
		</div>
		<div
			class="rounded-xl p-4 space-y-2"
			style={style({ background: c.raised, border: `1px solid ${c.border}` })}
		>
			<div class="flex items-center justify-center gap-3 flex-wrap">
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={{
						background: `color-mix(in oklch, ${c.accent} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.accent} 12%, transparent)`,
					}}
				>
					<p class="text-[9px] text-text-dim font-mono">Soroban</p>
					<p class="text-[13px] font-medium" style={style({ color: c.accent })}>Identity Registry</p>
				</div>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={{
						background: `color-mix(in oklch, ${c.positive} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.positive} 12%, transparent)`,
					}}
				>
					<p class="text-[9px] text-text-dim font-mono">Soroban</p>
					<p class="text-[13px] font-medium" style={style({ color: c.positive })}>Reputation Registry</p>
				</div>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={{
						background: `color-mix(in oklch, ${c.warning} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.warning} 12%, transparent)`,
					}}
				>
					<p class="text-[9px] text-text-dim font-mono">Soroban</p>
					<p class="text-[13px] font-medium" style={style({ color: c.warning })}>Validation Registry</p>
				</div>
			</div>
			<div class="flex flex-col items-center gap-0.5">
				<div class="w-px h-3" style={style({ background: c.border })} />
				<span
					class="text-[9px] font-mono text-text-dim px-2 py-0.5 rounded"
					style={style({ background: c.overlay })}
				>
					contract events
				</span>
				<div class="w-px h-3" style={style({ background: c.border })} />
			</div>
			<div class="flex justify-center">
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={style({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="text-[9px] text-text-dim font-mono">Real-time</p>
					<p class="text-[13px] font-medium">Event Indexer</p>
				</div>
			</div>
			<div class="flex flex-col items-center gap-0.5">
				<div class="w-px h-3" style={style({ background: c.border })} />
				<span
					class="text-[9px] font-mono text-text-dim px-2 py-0.5 rounded"
					style={style({ background: c.overlay })}
				>
					indexed data
				</span>
				<div class="w-px h-3" style={style({ background: c.border })} />
			</div>
			<div class="flex items-center justify-center gap-3 flex-wrap">
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={style({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="text-[9px] text-text-dim font-mono">PostgreSQL</p>
					<p class="text-[13px] font-medium">Supabase</p>
				</div>
				<span class="text-text-dim">→</span>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={style({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="text-[9px] text-text-dim font-mono">7 endpoints</p>
					<p class="text-[13px] font-medium">REST API</p>
				</div>
			</div>
			<div class="flex flex-col items-center gap-0.5">
				<div class="w-px h-3" style={style({ background: c.border })} />
				<div class="w-px h-3" style={style({ background: c.border })} />
			</div>
			<div class="flex items-center justify-center gap-3 flex-wrap">
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={{
						background: `color-mix(in oklch, ${c.accent} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.accent} 12%, transparent)`,
					}}
				>
					<p class="text-[9px] text-text-dim font-mono">SvelteKit</p>
					<p class="text-[13px] font-medium" style={style({ color: c.accent })}>Explorer</p>
				</div>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={{
						background: `color-mix(in oklch, ${c.positive} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.positive} 12%, transparent)`,
					}}
				>
					<p class="text-[9px] text-text-dim font-mono">TypeScript</p>
					<p class="text-[13px] font-medium" style={style({ color: c.positive })}>SDK</p>
				</div>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={{
						background: `color-mix(in oklch, ${c.warning} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.warning} 12%, transparent)`,
					}}
				>
					<p class="text-[9px] text-text-dim font-mono">USDC</p>
					<p class="text-[13px] font-medium" style={style({ color: c.warning })}>x402 + MPP</p>
				</div>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={style({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="text-[9px] text-text-dim font-mono">Any lang</p>
					<p class="text-[13px] font-medium">Your Agent</p>
				</div>
			</div>
		</div>
		<div class="flex items-center justify-center gap-2 text-[10px] font-mono text-text-dim flex-wrap">
			{#each techStack as t}
				<span class="rounded-full px-2.5 py-0.5" style={style({ border: `1px solid ${c.border}` })}>{t}</span>
			{/each}
		</div>
	</section>

	<!-- Explorer Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.accent })}>
				Web Application
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Explorer — stellar8004.com</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				A live window into the 8004 registry. Search, discover, use, and rate AI agents.
			</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
			<div
				class="rounded-xl overflow-hidden"
				style={style({ border: `1px solid ${c.border}` })}
			>
				<div
					class="flex items-center gap-2 px-3 py-1.5"
					style={style({ background: c.overlay, borderBottom: `1px solid ${c.border}` })}
				>
					<div class="flex gap-1">
						{#each ['oklch(0.45 0.10 25/0.5)', 'oklch(0.48 0.08 70/0.5)', 'oklch(0.42 0.08 162/0.5)'] as bg}
							<div class="h-2 w-2 rounded-full" style={style({ background: bg })} />
						{/each}
					</div>
					<div class="flex-1 mx-2">
						<div
							class="rounded px-2 py-0.5 text-[9px] font-mono text-text-dim"
							style={style({ background: c.surface })}
						>
							stellar8004.com
						</div>
					</div>
				</div>
				<div class="p-3 space-y-2.5" style={style({ background: c.surface })}>
					<div class="flex items-center gap-1.5">
						<div class="h-1 w-1 rounded-full" style={style({ background: c.positive })} />
						<span class="text-[8px] tracking-wider text-text-dim uppercase">Agent Trust Explorer</span>
					</div>
					<p class="text-sm font-light">Explore AI agents on Stellar</p>
					<div class="flex gap-1.5">
						<div
							class="flex-1 rounded-lg px-2.5 py-1.5 text-[11px] text-text-dim"
							style={style({ border: `1px solid ${c.border}`, background: c.raised })}
						>
							Search agents...
						</div>
						<div
							class="rounded-lg px-2.5 py-1.5 text-[11px]"
							style={{
								background: `color-mix(in oklch, ${c.accent} 10%, transparent)`,
								color: c.accent,
								border: `1px solid color-mix(in oklch, ${c.accent} 20%, transparent)`,
							}}
						>
							Search
						</div>
					</div>
					<div
						class="grid grid-cols-3 gap-px rounded-lg overflow-hidden"
						style={style({ border: `1px solid ${c.border}`, background: c.border })}
					>
						{#each [
							{ l: 'Total Agents', v: '12' },
							{ l: 'Feedback', v: '47' },
							{ l: 'Clients', v: '23' },
						] as s}
							<div class="p-2" style={style({ background: c.raised })}>
								<p class="text-[7px] text-text-dim uppercase">{s.l}</p>
								<p class="text-base font-light">{s.v}</p>
							</div>
						{/each}
					</div>
					{#each ['Web Scraper Agent', 'Data Analyst Pro'] as name, i}
						<div
							class="rounded-lg px-2.5 py-1.5 flex items-center justify-between"
							style={style({ border: `1px solid ${c.border}`, background: c.raised })}
						>
							<div>
								<p class="text-[11px] font-medium">{name}</p>
								<p class="text-[8px] text-text-dim">
									Score: {(4.5 - i * 0.4).toFixed(1)} · {12 - i * 3} feedback
								</p>
							</div>
							<div class="flex gap-1">
								{#if i === 0}
									<span style={badgeStyle(c.accent)}>x402</span>
								{/if}
								<span style={badgeStyle(c.positive)}>reputation</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
			<div class="space-y-3">
				{#each explorerFeatures as f}
					<div>
						<p class="text-[10px] font-mono tracking-wider uppercase" style={style({ color: c.accent })}>
							{f.s}
						</p>
						{#each f.items as item}
							<div class="flex items-start gap-1.5 text-[11px] text-text-muted">
								<span class="mt-0.5 text-[8px]" style={style({ color: c.accent })}>▶</span>
								<span>{item}</span>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- x402 Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.warning })}>
				Agent Payments
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">HTTP 402 — Two Payment Protocols</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				Agents charge per request using HTTP 402. We support both x402 and MPP — clients auto-detect.
			</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="p-4 space-y-3" style={cardStyle}>
				<div class="flex items-center gap-2">
					<span
						class="flex h-7 w-7 items-center justify-center rounded-lg font-mono text-[10px] font-bold"
						style={{
							background: `color-mix(in oklch, ${c.accent} 8%, transparent)`,
							color: c.accent,
							border: `1px solid color-mix(in oklch, ${c.accent} 15%, transparent)`,
						}}
					>
						x4
					</span>
					<div>
						<h3 class="text-[14px] font-medium" style={style({ color: c.accent })}>x402</h3>
						<p class="text-[9px] text-text-dim">Facilitator-based</p>
					</div>
				</div>
				<div class="space-y-1.5 text-[12px] text-text-muted">
					<p>• Payment through <strong style={style({ color: c.accent })}>facilitator</strong> (OZ Channels / Coinbase)</p>
					<p>• Facilitator verifies and forwards payment</p>
					<p>• Industry standard, cross-chain compatible</p>
				</div>
				<div
					class="rounded-lg p-2.5 font-mono text-[10px] leading-relaxed"
					style={style({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="text-text-dim">// 402 Response</p>
					<p><span style={style({ color: c.accent })}>X-Payment</span>: x402-stellar</p>
					<p><span style={style({ color: c.accent })}>X-Payment-Amount</span>: 0.01 USDC</p>
				</div>
			</div>
			<div class="p-4 space-y-3" style={cardStyle}>
				<div class="flex items-center gap-2">
					<span
						class="flex h-7 w-7 items-center justify-center rounded-lg font-mono text-[10px] font-bold"
						style={{
							background: `color-mix(in oklch, ${c.positive} 8%, transparent)`,
							color: c.positive,
							border: `1px solid color-mix(in oklch, ${c.positive} 15%, transparent)`,
						}}
					>
						M
					</span>
					<div>
						<h3 class="text-[14px] font-medium" style={style({ color: c.positive })}>MPP</h3>
						<p class="text-[9px] text-text-dim">Machine Payments Protocol</p>
					</div>
				</div>
				<div class="space-y-1.5 text-[12px] text-text-muted">
					<p>• <strong style={style({ color: c.positive })}>Direct on-chain</strong> settlement to agent wallet</p>
					<p>• No facilitator — fully decentralized</p>
					<p>• Supports sponsored transactions</p>
				</div>
				<div
					class="rounded-lg p-2.5 font-mono text-[10px] leading-relaxed"
					style={style({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="text-text-dim">// 402 Response</p>
					<p><span style={style({ color: c.positive })}>X-Payment</span>: mpp-charge</p>
					<p><span style={style({ color: c.positive })}>X-Payment-Destination</span>: GCDE...7KLP</p>
				</div>
			</div>
		</div>
		<div class="flex items-center justify-center gap-2 flex-wrap">
			<span style={neutralPill}>Request</span>
			<span class="text-text-dim">→</span>
			<span style={pillStyle(c.warning)}>402</span>
			<span class="text-text-dim">→</span>
			<span style={neutralPill}>Auto-detect</span>
			<span class="text-text-dim">→</span>
			<span style={pillStyle(c.positive)}>Pay</span>
			<span class="text-text-dim">→</span>
			<span style={neutralPill}>Result</span>
		</div>
		<div class="grid grid-cols-5 gap-2">
			{#each ['No API Keys', '~5s Settlement', 'USDC Stable', 'Auto-detect', 'Both Enabled'] as b}
				<div
					class="rounded-lg px-2 py-1.5 text-center"
					style={style({ background: c.raised, border: `1px solid ${c.border}` })}
				>
					<p class="text-[11px] font-medium" style={style({ color: c.accent })}>{b}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Web Scraper Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.positive })}>
				Live Demo
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Web Scraper Agent</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				A real agent on 8004 — registered on-chain, accepting x402 + MPP, earning USDC.
			</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="p-4 space-y-3" style={cardStyle}>
				<div class="flex items-center gap-2.5">
					<div
						class="h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
						style={style({ background: c.accent, color: '#fff' })}
					>
						S
					</div>
					<div>
						<h3 class="text-[14px] font-medium">Web Scraper Agent</h3>
						<p class="text-[9px] text-text-dim font-mono">stellar:mainnet:CBGP...6X35#1</p>
					</div>
				</div>
				<div class="grid grid-cols-3 gap-2">
					{#each [
						{ v: '4.5', l: 'Score', co: c.positive },
						{ v: '12', l: 'Feedback', co: c.accent },
						{ v: '92%', l: 'Complete', co: c.warning },
					] as s}
						<div class="rounded-lg py-1.5 text-center" style={style({ background: c.overlay })}>
							<p class="text-sm font-medium" style={style({ color: s.co })}>{s.v}</p>
							<p class="text-[8px] text-text-dim uppercase">{s.l}</p>
						</div>
					{/each}
				</div>
				<div
					class="rounded-lg px-3 py-2"
					style={style({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<div class="flex items-center justify-between">
						<span class="text-[13px] font-medium">POST /scrape</span>
						<div class="flex gap-1">
							{#each [
								{ l: 'x402', co: c.warning },
								{ l: 'MPP', co: c.positive },
								{ l: 'web', co: c.accent },
							] as b}
								<span key={b.l} style={badgeStyle(b.co)}>{b.l}</span>
							{/each}
						</div>
					</div>
					<p class="text-[10px] text-text-dim mt-1">Scrapes any URL, returns structured content</p>
				</div>
				<div class="space-y-1 text-[11px] font-mono">
					{#each [
						{ k: 'Trust', v: 'reputation', co: c.positive },
						{ k: 'Payment', v: 'x402 + MPP · $0.01/req', co: c.warning },
						{ k: 'Network', v: 'Stellar mainnet', co: c.muted },
					] as r}
						<div class="flex justify-between">
							<span class="text-text-dim">{r.k}</span>
							<span style={style({ color: r.co })}>{r.v}</span>
						</div>
					{/each}
				</div>
			</div>
			<div class="rounded-xl overflow-hidden" style={style({ border: `1px solid ${c.border}` })}>
				<div
					class="flex items-center gap-1.5 px-3 py-1.5"
					style={style({ background: c.overlay, borderBottom: `1px solid ${c.border}` })}
				>
					<div class="flex gap-1">
						{#each ['oklch(0.45 0.10 25/0.5)', 'oklch(0.48 0.08 70/0.5)', 'oklch(0.42 0.08 162/0.5)'] as bg}
							<div class="h-2 w-2 rounded-full" style={style({ background: bg })} />
						{/each}
					</div>
					<div class="flex-1 mx-2">
						<div
							class="rounded px-2 py-0.5 text-[9px] font-mono text-text-dim"
							style={style({ background: c.surface })}
						>
							stellar8004.com/agents/1
						</div>
					</div>
				</div>
				<div class="p-3.5 space-y-2.5" style={style({ background: c.surface })}>
					<div class="flex items-center justify-between">
						<h4 class="text-[13px] font-medium">Try This Agent</h4>
						<span
							class="text-[8px] rounded-full font-mono px-2 py-0.5"
							style={badgeStyle(c.positive)}
						>
							Live
						</span>
					</div>
					<div
						class="rounded-lg px-2.5 py-1.5 flex items-center justify-between"
						style={style({ background: c.raised, border: `1px solid ${c.border}` })}
					>
						<span class="text-[11px]">POST /scrape</span>
						<span class="text-[9px] font-mono" style={style({ color: c.warning })}>$0.01 USDC</span>
					</div>
					<div>
						<p class="text-[9px] text-text-dim mb-1 font-mono">Request Body</p>
						<div
							class="rounded-lg p-2 font-mono text-[10px]"
							style={style({ background: c.overlay, border: `1px solid ${c.border}` })}
						>
							<p>{'{'}</p>
							<p class="pl-3">
								<span style={style({ color: c.accent })}>"url"</span>
								<span class="text-text-dim">: </span>
								<span style={style({ color: c.positive })}>"https://example.com/news"</span>
							</p>
							<p>{'}'}</p>
						</div>
					</div>
					<button
						class="w-full rounded-lg py-2 text-[13px] font-medium cursor-pointer"
						style={{
							background: `color-mix(in oklch, ${c.accent} 8%, transparent)`,
							color: c.accent,
							border: `1px solid color-mix(in oklch, ${c.accent} 15%, transparent)`,
						}}
					>
						Send Request →
					</button>
					<div
						class="rounded-lg p-2 space-y-1"
						style={{
							background: `color-mix(in oklch, ${c.positive} 5%, transparent)`,
							border: `1px solid color-mix(in oklch, ${c.positive} 12%, transparent)`,
						}}
					>
						<div class="flex items-center justify-between">
							<span class="text-[9px] font-mono" style={style({ color: c.positive })}>HTTP 200 OK</span>
							<span class="text-[8px] font-mono text-text-dim">tx 8f3a...c21d</span>
						</div>
						<div class="font-mono text-[9px] text-text-muted">
							{'{'} <span style={style({ color: c.accent })}>"title"</span>:{' '}
							<span style={style({ color: c.positive })}>"Breaking News..."</span>,{' '}
							<span style={style({ color: c.accent })}>"content"</span>:{' '}
							<span style={style({ color: c.positive })}>"..."</span> {'}'}
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Feedback/Trust Loop Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.positive })}>
				Trust Loop
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Use → Rate → Trust</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				Every interaction builds the trust layer. Feedback is on-chain, permanent, and transparent.
			</p>
		</div>
		<div class="grid gap-6 lg:grid-cols-2">
			<div
				class="flex items-center justify-center py-8 rounded-xl"
				style={style({ background: c.raised, border: `1px solid ${c.border}` })}
			>
				<div class="relative w-56 h-56">
					<div class="absolute inset-0 flex items-center justify-center">
						<div
							class="h-16 w-16 rounded-full flex items-center justify-center"
							style={style({ background: c.overlay, border: `1px solid ${c.accent}30` })}
						>
							<span class="font-medium text-xs text-center leading-tight" style={style({ color: c.accent })}>
								On-chain<br />Trust
							</span>
						</div>
					</div>
					{#each trustLoop as s}
						<div
							class="absolute text-center space-y-1"
							style={style({
								top: s.pos === 'top' ? '0' : s.pos === 'bottom' ? 'auto' : '50%',
								bottom: s.pos === 'bottom' ? '0' : 'auto',
								left: s.pos === 'left' ? '0' : s.pos === 'right' ? 'auto' : '50%',
								right: s.pos === 'right' ? '0' : 'auto',
								transform:
									s.pos === 'top' || s.pos === 'bottom'
										? 'translateX(-50%)'
										: 'translateY(-50%)',
							})}
						>
							<div
								class="mx-auto h-10 w-10 rounded-lg flex items-center justify-center font-mono text-sm font-bold"
								style={{
									background: s.c + '10',
									border: `1px solid ${s.c}20`,
									color: s.c,
								}}
							>
								{s.n}
							</div>
							<p class="text-xs font-medium" style={style({ color: s.c })}>{s.label}</p>
							<p class="text-[9px] text-text-dim">{s.sub}</p>
						</div>
					{/each}
				</div>
			</div>
			<div class="space-y-4">
				<div
					class="space-y-3 rounded-xl p-4"
					style={style({ background: c.raised, border: `1px solid ${c.border}` })}
				>
					<p class="text-[11px] font-mono text-text-dim tracking-wider uppercase">Score Impact</p>
					<div>
						<div class="flex justify-between text-sm mb-1.5">
							<span class="text-text-muted">Before</span>
							<span class="font-mono" style={style({ color: c.accent })}>4.2</span>
						</div>
						<div class="h-2.5 rounded-full overflow-hidden" style={style({ background: c.overlay })}>
							<div class="h-full rounded-full" style={style({ width: '84%', background: c.accent })} />
						</div>
					</div>
					<p class="text-center text-[10px] text-text-dim font-mono">+ feedback: 5/6 "Success Rate"</p>
					<div>
						<div class="flex justify-between text-sm mb-1.5">
							<span class="text-text-muted">After</span>
							<span class="font-mono" style={style({ color: c.positive })}>4.3</span>
						</div>
						<div class="h-2.5 rounded-full overflow-hidden" style={style({ background: c.overlay })}>
							<div class="h-full rounded-full" style={style({ width: '86%', background: c.positive })} />
						</div>
					</div>
				</div>
				<div
					class="space-y-2 rounded-xl p-4"
					style={style({ background: c.raised, border: `1px solid ${c.border}` })}
				>
					<p class="text-[11px] font-mono text-text-dim tracking-wider uppercase">Recent Feedback</p>
					{#each recentFeedback as f}
						<div
							class="rounded-lg px-3 py-2 flex items-center justify-between"
							style={{
								background: f.highlight ? c.positive + '06' : c.overlay,
								border: `1px solid ${f.highlight ? c.positive + '20' : c.border}`,
							}}
						>
							<div class="flex items-center gap-2">
								<div class="flex gap-0.5">
									{#each Array.from({ length: 6 }) as _, j}
										<div
											class="h-1.5 w-1.5 rounded-sm"
											style={style({ background: j < f.score ? c.positive : c.overlay })}
										/>
									{/each}
								</div>
								<span class="text-[10px] font-mono text-text-dim">{f.tag}</span>
							</div>
							<div class="text-right">
								<p class="text-[9px] font-mono text-text-dim">{f.from}</p>
								<p class="text-[8px] text-text-dim">{f.time}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- DevTools Slide -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] tracking-wider uppercase font-medium" style={style({ color: c.accent })}>
				Developer Experience
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Build on 8004 in Minutes</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				TypeScript SDK, Claude Code skills, REST API, and full documentation.
			</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div
				class="space-y-3 rounded-xl p-4"
				style={style({ background: c.raised, border: `1px solid ${c.border}` })}
			>
				<div class="flex items-center justify-between">
					<p class="text-[11px] font-mono tracking-wider uppercase" style={style({ color: c.accent })}>
						TypeScript SDK
					</p>
					<span
						class="text-[9px] font-mono text-text-dim rounded px-2 py-0.5"
						style={style({ background: c.overlay })}
					>
						@trionlabs/stellar8004
					</span>
				</div>
				<div
					class="rounded-lg p-3 font-mono text-[11px] leading-relaxed space-y-0.5"
					style={style({ background: c.surface, border: `1px solid ${c.border}` })}
				>
					<p>
						<span style={style({ color: c.accent })}>import</span> {'{'} IdentityRegistryClient {'}'}
					</p>
					<p class="text-text-dim pl-2">
						<span style={style({ color: c.accent })}>from</span>{' '}
						<span style={style({ color: c.positive })}>'@trionlabs/stellar8004'</span>;
					</p>
					<p class="mt-2">
						<span style={style({ color: c.accent })}>const</span> client ={' '}
						<span style={style({ color: c.accent })}>new</span>{' '}
						<span style={style({ color: c.warning })}>IdentityRegistryClient</span>({'{'}
					</p>
					<p class="pl-2">network: <span style={style({ color: c.positive })}>'mainnet'</span></p>
					<p>{'}'});</p>
					<p class="mt-2 text-text-dim">// Query any agent</p>
					<p>
						<span style={style({ color: c.accent })}>const</span> agent ={' '}
						<span style={style({ color: c.accent })}>await</span> client.
						<span style={style({ color: c.warning })}>getAgent</span>(<span style={style({ color: c.positive })}>1</span>
						);
					</p>
				</div>
			</div>
			<div
				class="space-y-3 rounded-xl p-4"
				style={style({ background: c.raised, border: `1px solid ${c.border}` })}
			>
				<div class="flex items-center justify-between">
					<p class="text-[11px] font-mono tracking-wider uppercase" style={style({ color: c.accent })}>
						Claude Code Skills
					</p>
					<span
						class="text-[9px] font-mono text-text-dim rounded px-2 py-0.5"
						style={style({ background: c.overlay })}
					>
						AI-native DX
					</span>
				</div>
				<div
					class="rounded-lg p-3 font-mono text-[11px] leading-relaxed space-y-2"
					style={style({ background: c.surface, border: `1px solid ${c.border}` })}
				>
					<div>
						<p class="text-text-dim"># Install all skills</p>
						<p>
							<span style={style({ color: c.positive })}>$</span> npx skills add trionlabs/stellar-8004
							--skill '*'
						</p>
					</div>
					<div>
						<p class="text-text-dim"># Use in Claude Code</p>
						<p><span style={style({ color: c.positive })}>$</span> /8004stellar</p>
						<p class="text-text-dim pl-2">Agent trust protocol playbook</p>
					</div>
					<div>
						<p><span style={style({ color: c.positive })}>$</span> /x402stellar</p>
						<p class="text-text-dim pl-2">HTTP micropayment implementation</p>
					</div>
				</div>
			</div>
			<div
				class="space-y-3 rounded-xl p-4"
				style={style({ background: c.raised, border: `1px solid ${c.border}` })}
			>
				<p class="text-[11px] font-mono tracking-wider uppercase" style={style({ color: c.accent })}>
					REST API
				</p>
				<div class="space-y-1.5 font-mono text-[11px]">
					{#each restEndpoints as e}
						<div class="flex items-center gap-2.5">
							<span style={style({ color: c.positive })} class="w-7">
								{e.method}
							</span>
							<span class="flex-1">{e.path}</span>
							<span class="text-text-dim text-[10px]">{e.desc}</span>
						</div>
					{/each}
				</div>
			</div>
			<div
				class="space-y-3 rounded-xl p-4"
				style={style({ background: c.raised, border: `1px solid ${c.border}` })}
			>
				<p class="text-[11px] font-mono tracking-wider uppercase" style={style({ color: c.accent })}>
					5-Step Registration
				</p>
				<div class="space-y-1.5">
					{#each registrationSteps as s}
						<div
							class="flex items-center gap-2.5 rounded-lg px-3 py-1.5"
							style={style({ background: c.overlay })}
						>
							<span class="font-mono text-sm font-bold w-4" style={style({ color: c.accent })}>
								{s.step}
							</span>
							<span class="text-sm font-medium w-24">{s.label}</span>
							<span class="text-xs text-text-dim">{s.desc}</span>
						</div>
					{/each}
				</div>
				<p class="text-[10px] text-text-dim font-mono text-center">
					Register an agent in 60 seconds. On-chain forever.
				</p>
			</div>
		</div>
	</section>

	<!-- Closing Slide -->
	<section class="flex flex-col items-center justify-center text-center gap-8 py-12">
		<div class="flex items-center gap-3">
			<div
				class="h-12 w-12 rounded-xl flex items-center justify-center text-xl font-bold"
				style={style({ background: c.accent, color: '#fff' })}
			>
				8
			</div>
			<span class="text-4xl font-light tracking-tight">
				Stellar<span class="font-semibold" style={style({ color: c.accent })}>8004</span>
			</span>
		</div>
		<div class="flex items-center gap-10 flex-wrap justify-center">
			{#each closingWords as item}
				<div class="text-center space-y-1.5">
					<p class="text-2xl font-medium" style={style({ color: item.c })}>{item.word}</p>
					<p class="text-xs text-text-muted max-w-36">{item.desc}</p>
				</div>
			{/each}
		</div>
		<div
			class="w-24 h-px"
			style={style({ background: `linear-gradient(90deg, transparent, ${c.accent}, transparent)`, opacity: 0.25 })}
		/>
		<div class="flex items-center gap-7 flex-wrap justify-center">
			{#each stats as s}
				<div class="text-center">
					<p class="text-lg font-medium font-mono" style={style({ color: c.accent })}>{s.v}</p>
					<p class="text-[10px] text-text-dim uppercase tracking-wider">{s.l}</p>
				</div>
			{/each}
		</div>
		<div class="space-y-2">
			<p class="text-3xl font-light" style={style({ color: c.accent })}>stellar8004.com</p>
			<p class="text-sm text-text-dim font-mono">Open Source · Mainnet · Trustless</p>
		</div>
		<div class="flex items-center gap-2 text-[10px] font-mono text-text-dim flex-wrap justify-center">
			{#each ['Rust', 'Soroban', 'TypeScript', 'SvelteKit', 'Supabase', 'Stellar'] as t}
				<span class="rounded-full px-3 py-1" style={style({ border: `1px solid ${c.border}` })}>{t}</span>
			{/each}
		</div>
	</section>
</div>
