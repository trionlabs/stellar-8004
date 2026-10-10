<script lang="ts">
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
		gold: 'var(--color-medal-gold)'
	};

	function s(props: Record<string, string | number>): string {
		return Object.entries(props)
			.map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`)
			.join(' ');
	}

	const card = s({
		background: c.raised,
		border: `1px solid ${c.border}`,
		borderRadius: '0.75rem',
		boxShadow: 'var(--shadow-sm)'
	});
	const neutralPill = s({
		background: c.overlay,
		border: `1px solid ${c.border}`,
		borderRadius: '0.5rem',
		padding: '0.375rem 0.875rem',
		fontSize: '13px',
		fontFamily: 'var(--font-mono)'
	});
	const badge = (color: string) =>
		s({
			background: `color-mix(in oklch, ${color} 6%, transparent)`,
			color,
			border: `1px solid color-mix(in oklch, ${color} 15%, transparent)`,
			borderRadius: '9999px',
			padding: '0.125rem 0.5rem',
			fontSize: '10px',
			fontFamily: 'var(--font-mono)',
			fontWeight: 500
		});
	const pill = (color: string) =>
		s({
			background: `color-mix(in oklch, ${color} 6%, transparent)`,
			color,
			border: `1px solid color-mix(in oklch, ${color} 15%, transparent)`,
			borderRadius: '0.5rem',
			padding: '0.375rem 0.875rem',
			fontSize: '13px',
			fontFamily: 'var(--font-mono)'
		});

	const problems = [
		{
			icon: '?',
			title: 'No Discovery',
			desc: 'Thousands of AI agents exist but no unified registry. Each lives in its own silo.'
		},
		{
			icon: '!',
			title: 'No Trust',
			desc: 'No way to verify reliability. No reputation system, no accountability.'
		},
		{
			icon: '$',
			title: 'No Payments',
			desc: 'No native micropayment layer. No agent economy — just free demos or subscriptions.'
		}
	];

	const solutions = [
		{
			label: 'Identity',
			color: c.accent,
			desc: 'Register agents as NFTs with on-chain metadata, wallet binding, and service discovery.'
		},
		{
			label: 'Reputation',
			color: c.positive,
			desc: 'Real users leave feedback. Scores calculated with weighted averaging. Public leaderboard.'
		},
		{
			label: 'Validation',
			color: c.warning,
			desc: 'Third-party organizations formally endorse agents through on-chain attestations.'
		}
	];

	const deliverables = [
		{
			num: '01',
			title: '3 Soroban Contracts',
			color: c.accent,
			items: [
				'Identity Registry (Agent NFTs)',
				'Reputation Registry (Feedback & Scores)',
				'Validation Registry (Attestations)'
			],
			footer: '74 tests · Mainnet · OpenZeppelin'
		},
		{
			num: '02',
			title: 'x402 + MPP Payments',
			color: c.warning,
			items: [
				'Two HTTP 402 protocols: x402 & MPP',
				'MPP: direct on-chain, no facilitator',
				'x402: facilitator-based (OZ / Coinbase)',
				'TryAgent: auto-detects in Explorer'
			],
			footer: 'Pay-per-request · USDC · ~5s settlement'
		},
		{
			num: '03',
			title: 'TypeScript SDK',
			color: c.positive,
			items: [
				'@trionlabs/stellar8004 package',
				'Full contract client wrappers',
				'Agent metadata builder & auto-storage'
			],
			footer: 'Query, register, feedback, validate'
		},
		{
			num: '04',
			title: 'Explorer Web App',
			color: c.accent,
			items: [
				'Agent search & advanced filtering',
				'Agent profiles with scores & services',
				'TryAgent: use & pay in-browser'
			],
			footer: 'SvelteKit · stellar8004.com · Live'
		},
		{
			num: '05',
			title: 'Event Indexer',
			color: c.accent,
			items: [
				'Real-time Soroban event indexing',
				'URI resolution & metadata extraction',
				'REST API with 7 public endpoints'
			],
			footer: 'Supabase Edge Functions · PostgreSQL'
		},
		{
			num: '06',
			title: 'Developer Documentation',
			color: c.accent,
			items: [
				'SDK setup and usage examples',
				'Registration and metadata guide',
				'Public REST API reference'
			],
			footer: 'Guides for building on Stellar8004'
		}
	];

	const identityFeatures = [
		{ label: 'Agent NFTs', desc: 'Each agent minted as a unique NFT on Stellar' },
		{ label: 'On-chain Metadata', desc: 'Name, description, image, services — all immutable' },
		{ label: 'Wallet Binding', desc: 'Link agent to a Stellar wallet with dual-auth' },
		{ label: 'Service Discovery', desc: 'Expose endpoints (MCP, A2A, REST, x402) on-chain' },
		{ label: 'Ownership Transfer', desc: '2-step transfer with OpenZeppelin security model' },
		{ label: 'Timelocked Upgrades', desc: '3-day timelock on contract upgrades for safety' }
	];

	const metadata = [
		{ key: 'name', value: '"Web Scraper Agent"' },
		{ key: 'description', value: '"Scrapes web pages on demand"' },
		{ key: 'services', value: '[{ endpoint, protocol }]' },
		{ key: 'supportedTrust', value: '["reputation"]' },
		{ key: 'x402', value: 'true' }
	];

	const leaderboard = [
		{ name: 'Web Scraper', score: 4.5, feedback: 12, pct: 90 },
		{ name: 'Data Analyst', score: 4.2, feedback: 8, pct: 84 },
		{ name: 'Code Review', score: 3.8, feedback: 15, pct: 76 },
		{ name: 'Translator', score: 3.5, feedback: 6, pct: 70 },
		{ name: 'Summarizer', score: 2.1, feedback: 3, pct: 42 }
	];

	const repFeatures = [
		'Weighted Average Deviation (WAD) scoring',
		"Self-feedback prevention (can't rate own agent)",
		'Categories: Uptime, Success Rate, Reachable',
		'Evidence URIs for verifiable proof',
		'Revokable feedback with on-chain history',
		'Public leaderboard with real-time ranking'
	];

	const validationSteps = [
		{
			n: '1',
			label: 'Request',
			color: c.accent,
			desc: 'Agent owner requests validation from a trusted validator'
		},
		{
			n: '2',
			label: 'Review',
			color: c.warning,
			desc: 'Validator inspects agent, tests functionality'
		},
		{ n: '3', label: 'Attest', color: c.positive, desc: 'Validator submits endorsement on-chain' },
		{
			n: '4',
			label: 'Trust',
			color: c.text,
			desc: 'Agent displays validation badge, verifiable on-chain'
		}
	];

	const validationUses = [
		{ t: 'Security Audits', d: 'Validators attest agent passed security review' },
		{ t: 'Performance Benchmarks', d: 'Third parties certify uptime, latency, accuracy' },
		{ t: 'Organizational Trust', d: 'Companies endorse agents built by their teams' }
	];

	const explorerFeatures = [
		{
			s: 'Discovery',
			items: [
				'Full-text search across agents',
				'Filter by trust type, x402, score',
				'Sort by score, date, feedback'
			]
		},
		{
			s: 'Agent Profile',
			items: [
				'Trust score with visual bar',
				'Service endpoints + protocol badges',
				'On-chain metadata viewer'
			]
		},
		{
			s: 'Reputation',
			items: [
				'Feedback history with score cards',
				'Category tags (Uptime, Success Rate)',
				'Submit feedback with wallet'
			]
		},
		{ s: 'More', items: ['Leaderboard', 'TryAgent (x402/MPP)', '5-step registration'] }
	];

	const trustLoop = [
		{ pos: 'top', n: '1', label: 'Discover', sub: 'Find on Explorer', color: c.accent },
		{ pos: 'right', n: '2', label: 'Use & Pay', sub: 'x402 / MPP', color: c.warning },
		{ pos: 'bottom', n: '3', label: 'Rate', sub: 'Submit feedback', color: c.positive },
		{ pos: 'left', n: '4', label: 'Trust', sub: 'Score updates', color: c.text }
	];

	const recentFeedback = [
		{ score: 5, tag: 'Success Rate', from: 'GBXK...3F2Q', time: 'just now', highlight: true },
		{ score: 4, tag: 'Uptime', from: 'GABC...9XYZ', time: '2 days ago', highlight: false },
		{ score: 5, tag: 'Reachable', from: 'GDEF...4MNO', time: '5 days ago', highlight: false }
	];

	const restEndpoints = [
		{ method: 'GET', path: '/api/v1/agents', desc: 'List all agents' },
		{ method: 'GET', path: '/api/v1/agents/:id', desc: 'Agent details + score' },
		{ method: 'GET', path: '/api/v1/agents/:id/feedback', desc: 'Agent feedback' },
		{ method: 'GET', path: '/api/v1/search?q=...', desc: 'Full-text search' },
		{ method: 'GET', path: '/api/v1/stats', desc: 'Network statistics' }
	];

	const registrationSteps = [
		{ step: '1', label: 'Basic Info', desc: 'Name, description, image URL' },
		{ step: '2', label: 'Services', desc: 'Endpoints, protocols (MCP, A2A, REST)' },
		{ step: '3', label: 'Advanced', desc: 'Trust model, x402/MPP toggle' },
		{ step: '4', label: 'URI', desc: 'Auto data URI or custom IPFS/HTTPS' },
		{ step: '5', label: 'Review', desc: 'Preview, connect wallet, sign tx' }
	];

	const closingWords = [
		{ word: 'Discover.', desc: 'Find any AI agent on Stellar', color: c.accent },
		{ word: 'Use.', desc: 'Pay per request with x402 + MPP', color: c.warning },
		{ word: 'Trust.', desc: 'On-chain reputation from real users', color: c.positive },
		{ word: 'Build.', desc: 'SDK, docs, and open source tools', color: c.text }
	];

	const stats = [
		{ v: '3', l: 'Contracts' },
		{ v: '74', l: 'Tests' },
		{ v: 'Mainnet', l: 'Network' },
		{ v: 'MIT', l: 'License' }
	];
</script>

<svelte:head>
	<title>Stellar8004 — Agent Trust Protocol</title>
	<meta
		name="description"
		content="Find, Use, and Trust AI Agents on Stellar. Agent Trust Protocol with on-chain identity, reputation, and validation."
	/>
</svelte:head>

<div class="space-y-24 pb-24">
	<!-- Title -->
	<section class="flex flex-col items-center justify-center gap-6 py-24 text-center">
		<div class="flex items-center gap-3">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold"
				style={s({ background: c.accent, color: '#fff' })}
			>
				8
			</div>
			<span class="text-4xl font-light tracking-tight"
				>Stellar<span class="font-semibold" style={s({ color: c.accent })}>8004</span></span
			>
		</div>
		<h1 class="max-w-lg text-xl leading-relaxed font-light text-text-muted">
			Find, Use, and Trust AI Agents on Stellar
		</h1>
		<div class="h-px w-16" style={s({ background: c.border })}></div>
		<div class="space-y-2">
			<p class="text-base font-medium" style={s({ color: c.accent })}>Agent Trust Protocol</p>
			<p class="font-mono text-xs text-text-dim">
				On-chain Identity · Reputation · Validation · x402 + MPP Payments
			</p>
		</div>
		<div
			class="mt-4 flex flex-wrap items-center justify-center gap-5 font-mono text-[11px] text-text-dim"
		>
			<span>EIP-8004 Standard</span><span style={s({ color: c.border })}>|</span>
			<span>Stellar / Soroban</span><span style={s({ color: c.border })}>|</span>
			<span>Open Source</span><span style={s({ color: c.border })}>|</span>
			<span style={s({ color: c.positive })}>Mainnet Live</span>
		</div>
	</section>

	<!-- Problem -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.negative })}>
				The Problem
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">
				Thousands of AI agents. <span style={s({ fontWeight: 500, color: c.negative })}
					>Zero trust.</span
				>
			</h2>
		</div>
		<div class="grid gap-4 sm:grid-cols-3">
			{#each problems as p (p.title)}
				<div class="space-y-3 p-5" style={card}>
					<div
						class="flex h-10 w-10 items-center justify-center rounded-lg font-mono text-lg font-bold"
						style={s({
							color: c.negative,
							background: c.negativeSoft,
							border: `1px solid color-mix(in oklch, ${c.negative} 15%, transparent)`
						})}
					>
						{p.icon}
					</div>
					<h3 class="text-base font-medium">{p.title}</h3>
					<p class="text-[13px] leading-relaxed text-text-muted">{p.desc}</p>
				</div>
			{/each}
		</div>
		<p class="text-center text-[13px] text-text-dim">
			AI agents need an open, verifiable trust infrastructure — not another centralized marketplace.
		</p>
	</section>

	<!-- Solution -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.positive })}>
				The Solution
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">
				<span style={s({ fontWeight: 600, color: c.accent })}>8004</span> — Agent Trust Protocol
			</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				An open standard for AI agent identity, reputation, and trust. Three smart contracts on
				Stellar/Soroban.
			</p>
		</div>
		<div class="grid gap-4 sm:grid-cols-3">
			{#each solutions as sol (sol.label)}
				<div class="space-y-3 p-5" style={card}>
					<div class="h-1.5 w-10 rounded-full" style={s({ background: sol.color })}></div>
					<h3 class="text-lg font-medium">{sol.label}</h3>
					<p class="text-[13px] leading-relaxed text-text-muted">{sol.desc}</p>
				</div>
			{/each}
		</div>
		<div class="flex flex-wrap items-center justify-center gap-3">
			<span style={pill(c.accent)}>Register</span><span class="text-text-dim">→</span>
			<span style={pill(c.positive)}>Use & Rate</span><span class="text-text-dim">→</span>
			<span style={pill(c.warning)}>Validate</span><span class="text-text-dim">→</span>
			<span style={neutralPill}>Discover & Trust</span>
		</div>
		<div
			class="flex flex-wrap items-center justify-center gap-3 font-mono text-[11px] text-text-dim"
		>
			{#each ['EIP-8004', 'Stellar / Soroban', '74 Tests', 'Reproducible Builds'] as t (t)}
				<span class="rounded-full px-3 py-1" style={s({ border: `1px solid ${c.border}` })}
					>{t}</span
				>
			{/each}
			<span
				class="rounded-full px-3 py-1"
				style={s({
					color: c.positive,
					border: `1px solid color-mix(in oklch, ${c.positive} 25%, transparent)`
				})}>Mainnet Live</span
			>
		</div>
	</section>

	<!-- What We Built -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.positive })}>
				Hackathon Deliverables
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">What We Built</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				End-to-end infrastructure for AI agent trust on Stellar — from smart contracts to a live
				explorer and a real working agent.
			</p>
		</div>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each deliverables as d (d.num)}
				<div class="space-y-2 p-4" style={card}>
					<div class="flex items-center gap-2">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold"
							style={s({
								background: `color-mix(in oklch, ${d.color} 8%, transparent)`,
								color: d.color,
								border: `1px solid color-mix(in oklch, ${d.color} 15%, transparent)`
							})}>{d.num}</span
						>
						<h3 class="text-[13px] font-medium" style={s({ color: d.color })}>{d.title}</h3>
					</div>
					<ul class="space-y-0.5 text-[12px] text-text-muted">
						{#each d.items as item (item)}
							<li class="flex items-start gap-1.5">
								<span class="mt-0.5 text-[7px]" style={s({ color: d.color })}>▶</span><span
									>{item}</span
								>
							</li>
						{/each}
					</ul>
					<p class="font-mono text-[9px] text-text-dim">{d.footer}</p>
				</div>
			{/each}
		</div>
		<div
			class="rounded-lg px-4 py-2 text-center text-[13px]"
			style={s({
				background: c.positiveSoft,
				border: `1px solid color-mix(in oklch, ${c.positive} 15%, transparent)`
			})}
		>
			<span style={s({ color: c.positive })} class="font-medium">+ Real Working Agent</span>
			<span class="text-text-muted">
				— Web Scraper on 8004, accepting x402 + MPP, earning USDC</span
			>
		</div>
	</section>

	<!-- Identity -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.accent })}>
				Contract 1 of 3
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Identity Registry</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				Every AI agent gets an on-chain identity — discoverable, verifiable, permanent.
			</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="space-y-2">
				{#each identityFeatures as f, i (f.label)}
					<div
						class="flex items-start gap-2.5 rounded-lg p-2.5"
						style={s({ background: c.raised, border: `1px solid ${c.border}` })}
					>
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold"
							style={s({ background: c.accentSoft, color: c.accent })}
							>{String(i + 1).padStart(2, '0')}</span
						>
						<div class="min-w-0">
							<p class="text-[13px] font-medium" style={s({ color: c.accent })}>{f.label}</p>
							<p class="text-[11px] text-text-muted">{f.desc}</p>
						</div>
					</div>
				{/each}
			</div>
			<div class="space-y-3">
				<div
					class="rounded-lg p-4"
					style={s({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p
						class="mb-3 font-mono text-[11px] tracking-widest uppercase"
						style={s({ color: c.accent })}
					>
						Agent Metadata
					</p>
					<div
						class="rounded-lg p-3 font-mono text-[12px] leading-relaxed"
						style={s({ background: c.raised, border: `1px solid ${c.border}` })}
					>
						<p class="text-text-dim">{'{'}</p>
						{#each metadata as m, i (m.key)}
							<p class="pl-4">
								<span style={s({ color: c.accent })}>{m.key}</span><span class="text-text-dim"
									>:
								</span><span style={s({ color: c.positive })}>{m.value}</span
								>{#if i < metadata.length - 1}<span class="text-text-dim">,</span>{/if}
							</p>
						{/each}
						<p class="text-text-dim">}</p>
					</div>
					<p class="mt-2 font-mono text-[10px] text-text-dim">
						Max: 64B keys · 4KB values · 100 keys/agent
					</p>
				</div>
				<div
					class="rounded-lg px-4 py-2.5 font-mono text-[12px]"
					style={s({ background: c.raised, border: `1px solid ${c.border}` })}
				>
					<span class="text-text-dim">Agent ID: </span>
					<span style={s({ color: c.accent })}>stellar</span><span class="text-text-dim">:</span>
					<span style={s({ color: c.positive })}>mainnet</span><span class="text-text-dim">:</span>
					<span style={s({ color: c.warning })}>CBGPDCJI...6X35</span><span class="text-text-dim"
						>#</span
					>
					<span class="font-bold">1</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Reputation -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.positive })}>
				Contract 2 of 3
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Reputation Registry</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				Real users rate agents. Scores calculated on-chain with weighted averaging. No one can fake
				it.
			</p>
		</div>
		<div class="grid gap-5 lg:grid-cols-2">
			<div class="space-y-4 p-4" style={card}>
				<div class="flex items-center justify-between">
					<p class="font-mono text-[11px] tracking-wider text-text-dim uppercase">Leaderboard</p>
					<p class="font-mono text-[11px]" style={s({ color: c.positive })}>Live on-chain</p>
				</div>
				<div class="space-y-2.5">
					{#each leaderboard as a, i (a.name)}
						<div class="flex items-center gap-3">
							<span
								class="w-4 text-right font-mono text-[13px]"
								style={s({ color: i === 0 ? c.gold : c.dim, fontWeight: i === 0 ? 700 : 400 })}
								>{i + 1}</span
							>
							<div class="flex-1">
								<div class="mb-1 flex items-center justify-between">
									<span class="text-[13px] font-medium">{a.name}</span>
									<span class="font-mono text-[11px] text-text-muted"
										>{a.score}/5 · {a.feedback}</span
									>
								</div>
								<div class="h-1.5 rounded-full" style={s({ background: c.overlay })}>
									<div
										class="h-full rounded-full"
										style={s({
											width: `${a.pct}%`,
											background: a.pct >= 80 ? c.positive : a.pct >= 60 ? c.accent : c.negative
										})}
									></div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
			<div class="space-y-2">
				<p class="font-mono text-[11px] tracking-wider text-text-dim uppercase">How it works</p>
				{#each repFeatures as f (f)}
					<div
						class="flex items-start gap-2.5 rounded-lg px-3 py-2"
						style={s({ background: c.raised, border: `1px solid ${c.border}` })}
					>
						<span style={s({ color: c.positive })}>✓</span>
						<p class="text-[13px] text-text-muted">{f}</p>
					</div>
				{/each}
			</div>
		</div>
		<div class="flex items-center justify-center">
			<div
				class="rounded-lg px-5 py-2 font-mono text-[13px] text-text-muted"
				style={s({ background: c.overlay, border: `1px solid ${c.border}` })}
			>
				score = <span style={s({ color: c.accent })}>WAD</span>(feedback[].value) → stored as
				<span style={s({ color: c.positive })}>u64</span> on-chain
			</div>
		</div>
	</section>

	<!-- Validation -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.warning })}>
				Contract 3 of 3
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Validation Registry</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				Third-party organizations formally endorse agents through on-chain attestations.
			</p>
		</div>
		<div
			class="rounded-xl p-5"
			style={s({ background: c.raised, border: `1px solid ${c.border}` })}
		>
			<div class="flex flex-wrap items-center justify-between gap-2">
				{#each validationSteps as vs, i (vs.n)}
					<div class="flex min-w-[140px] flex-1 items-center gap-2">
						<div class="flex-1 space-y-2 text-center">
							<div
								class="mx-auto flex h-10 w-10 items-center justify-center rounded-lg font-mono text-sm font-bold"
								style={s({
									background: `color-mix(in oklch, ${vs.color} 8%, transparent)`,
									border: `1px solid color-mix(in oklch, ${vs.color} 15%, transparent)`,
									color: vs.color
								})}
							>
								{vs.n}
							</div>
							<h4 class="text-[13px] font-medium" style={s({ color: vs.color })}>{vs.label}</h4>
							<p class="text-[11px] leading-snug text-text-muted">{vs.desc}</p>
						</div>
						{#if i < validationSteps.length - 1}<span class="shrink-0 text-text-dim">→</span>{/if}
					</div>
				{/each}
			</div>
		</div>
		<div class="grid gap-3 sm:grid-cols-3">
			{#each validationUses as vu (vu.t)}
				<div
					class="space-y-1 rounded-lg px-4 py-3"
					style={s({ background: c.raised, border: `1px solid ${c.border}` })}
				>
					<p class="text-[13px] font-medium" style={s({ color: c.warning })}>{vu.t}</p>
					<p class="text-[11px] text-text-muted">{vu.d}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Architecture -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.accent })}>
				Architecture
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Full Stack, Open Source</h2>
		</div>
		<div
			class="space-y-2 rounded-xl p-4"
			style={s({ background: c.raised, border: `1px solid ${c.border}` })}
		>
			<div class="flex flex-wrap items-center justify-center gap-3">
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={s({
						background: `color-mix(in oklch, ${c.accent} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.accent} 12%, transparent)`
					})}
				>
					<p class="font-mono text-[9px] text-text-dim">Soroban</p>
					<p class="text-[13px] font-medium" style={s({ color: c.accent })}>Identity Registry</p>
				</div>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={s({
						background: `color-mix(in oklch, ${c.positive} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.positive} 12%, transparent)`
					})}
				>
					<p class="font-mono text-[9px] text-text-dim">Soroban</p>
					<p class="text-[13px] font-medium" style={s({ color: c.positive })}>
						Reputation Registry
					</p>
				</div>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={s({
						background: `color-mix(in oklch, ${c.warning} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.warning} 12%, transparent)`
					})}
				>
					<p class="font-mono text-[9px] text-text-dim">Soroban</p>
					<p class="text-[13px] font-medium" style={s({ color: c.warning })}>Validation Registry</p>
				</div>
			</div>
			<div class="flex flex-col items-center gap-0.5">
				<div class="h-3 w-px" style={s({ background: c.border })}></div>
				<span
					class="rounded px-2 py-0.5 font-mono text-[9px] text-text-dim"
					style={s({ background: c.overlay })}>contract events</span
				>
				<div class="h-3 w-px" style={s({ background: c.border })}></div>
			</div>
			<div class="flex justify-center">
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={s({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="font-mono text-[9px] text-text-dim">Real-time</p>
					<p class="text-[13px] font-medium">Event Indexer</p>
				</div>
			</div>
			<div class="flex flex-col items-center gap-0.5">
				<div class="h-3 w-px" style={s({ background: c.border })}></div>
				<span
					class="rounded px-2 py-0.5 font-mono text-[9px] text-text-dim"
					style={s({ background: c.overlay })}>indexed data</span
				>
				<div class="h-3 w-px" style={s({ background: c.border })}></div>
			</div>
			<div class="flex flex-wrap items-center justify-center gap-3">
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={s({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="font-mono text-[9px] text-text-dim">PostgreSQL</p>
					<p class="text-[13px] font-medium">Supabase</p>
				</div>
				<span class="text-text-dim">→</span>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={s({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="font-mono text-[9px] text-text-dim">7 endpoints</p>
					<p class="text-[13px] font-medium">REST API</p>
				</div>
			</div>
			<div class="flex flex-col items-center gap-0.5">
				<div class="h-3 w-px" style={s({ background: c.border })}></div>
				<div class="h-3 w-px" style={s({ background: c.border })}></div>
			</div>
			<div class="flex flex-wrap items-center justify-center gap-3">
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={s({
						background: `color-mix(in oklch, ${c.accent} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.accent} 12%, transparent)`
					})}
				>
					<p class="font-mono text-[9px] text-text-dim">SvelteKit</p>
					<p class="text-[13px] font-medium" style={s({ color: c.accent })}>Explorer</p>
				</div>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={s({
						background: `color-mix(in oklch, ${c.positive} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.positive} 12%, transparent)`
					})}
				>
					<p class="font-mono text-[9px] text-text-dim">TypeScript</p>
					<p class="text-[13px] font-medium" style={s({ color: c.positive })}>SDK</p>
				</div>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={s({
						background: `color-mix(in oklch, ${c.warning} 6%, transparent)`,
						border: `1px solid color-mix(in oklch, ${c.warning} 12%, transparent)`
					})}
				>
					<p class="font-mono text-[9px] text-text-dim">USDC</p>
					<p class="text-[13px] font-medium" style={s({ color: c.warning })}>x402 + MPP</p>
				</div>
				<div
					class="rounded-lg px-4 py-2 text-center"
					style={s({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="font-mono text-[9px] text-text-dim">Any lang</p>
					<p class="text-[13px] font-medium">Your Agent</p>
				</div>
			</div>
		</div>
		<div
			class="flex flex-wrap items-center justify-center gap-2 font-mono text-[10px] text-text-dim"
		>
			{#each ['Rust / Soroban', 'TypeScript', 'SvelteKit', 'Supabase', 'Stellar SDK', 'OpenZeppelin'] as t (t)}
				<span class="rounded-full px-2.5 py-0.5" style={s({ border: `1px solid ${c.border}` })}
					>{t}</span
				>
			{/each}
		</div>
	</section>

	<!-- Explorer -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.accent })}>
				Web Application
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Explorer — stellar8004.com</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				A live window into the 8004 registry. Search, discover, use, and rate AI agents.
			</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
			<div class="overflow-hidden rounded-xl" style={s({ border: `1px solid ${c.border}` })}>
				<div
					class="flex items-center gap-2 px-3 py-1.5"
					style={s({ background: c.overlay, borderBottom: `1px solid ${c.border}` })}
				>
					<div class="flex gap-1">
						{#each ['oklch(0.45 0.10 25/0.5)', 'oklch(0.48 0.08 70/0.5)', 'oklch(0.42 0.08 162/0.5)'] as bg (bg)}
							<div class="h-2 w-2 rounded-full" style={s({ background: bg })}></div>
						{/each}
					</div>
					<div class="mx-2 flex-1">
						<div
							class="rounded px-2 py-0.5 font-mono text-[9px] text-text-dim"
							style={s({ background: c.surface })}
						>
							stellar8004.com
						</div>
					</div>
				</div>
				<div class="space-y-2.5 p-3" style={s({ background: c.surface })}>
					<div class="flex items-center gap-1.5">
						<div class="h-1 w-1 rounded-full" style={s({ background: c.positive })}></div>
						<span class="text-[8px] tracking-wider text-text-dim uppercase"
							>Agent Trust Explorer</span
						>
					</div>
					<p class="text-sm font-light">Explore AI agents on Stellar</p>
					<div class="flex gap-1.5">
						<div
							class="flex-1 rounded-lg px-2.5 py-1.5 text-[11px] text-text-dim"
							style={s({ border: `1px solid ${c.border}`, background: c.raised })}
						>
							Search agents...
						</div>
						<div
							class="rounded-lg px-2.5 py-1.5 text-[11px]"
							style={s({
								background: `color-mix(in oklch, ${c.accent} 10%, transparent)`,
								color: c.accent,
								border: `1px solid color-mix(in oklch, ${c.accent} 20%, transparent)`
							})}
						>
							Search
						</div>
					</div>
					<div
						class="grid grid-cols-3 gap-px overflow-hidden rounded-lg"
						style={s({ border: `1px solid ${c.border}`, background: c.border })}
					>
						{#each [{ l: 'Total Agents', v: '12' }, { l: 'Feedback', v: '47' }, { l: 'Clients', v: '23' }] as st (st.l)}
							<div class="p-2" style={s({ background: c.raised })}>
								<p class="text-[7px] text-text-dim uppercase">{st.l}</p>
								<p class="text-base font-light">{st.v}</p>
							</div>
						{/each}
					</div>
					{#each ['Web Scraper Agent', 'Data Analyst Pro'] as name, i (name)}
						<div
							class="flex items-center justify-between rounded-lg px-2.5 py-1.5"
							style={s({ border: `1px solid ${c.border}`, background: c.raised })}
						>
							<div>
								<p class="text-[11px] font-medium">{name}</p>
								<p class="text-[8px] text-text-dim">
									Score: {(4.5 - i * 0.4).toFixed(1)} · {12 - i * 3} feedback
								</p>
							</div>
							<div class="flex gap-1">
								{#if i === 0}<span style={badge(c.accent)}>x402</span>{/if}
								<span style={badge(c.positive)}>reputation</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
			<div class="space-y-3">
				{#each explorerFeatures as ef (ef.s)}
					<div>
						<p
							class="font-mono text-[10px] tracking-wider uppercase"
							style={s({ color: c.accent })}
						>
							{ef.s}
						</p>
						{#each ef.items as item (item)}
							<div class="flex items-start gap-1.5 text-[11px] text-text-muted">
								<span class="mt-0.5 text-[8px]" style={s({ color: c.accent })}>▶</span><span
									>{item}</span
								>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- x402 Payments -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.warning })}>
				Agent Payments
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">HTTP 402 — Two Payment Protocols</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				Agents charge per request using HTTP 402. We support both x402 and MPP — clients
				auto-detect.
			</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="space-y-3 p-4" style={card}>
				<div class="flex items-center gap-2">
					<span
						class="flex h-7 w-7 items-center justify-center rounded-lg font-mono text-[10px] font-bold"
						style={s({
							background: `color-mix(in oklch, ${c.accent} 8%, transparent)`,
							color: c.accent,
							border: `1px solid color-mix(in oklch, ${c.accent} 15%, transparent)`
						})}>x4</span
					>
					<div>
						<h3 class="text-[14px] font-medium" style={s({ color: c.accent })}>x402</h3>
						<p class="text-[9px] text-text-dim">Facilitator-based</p>
					</div>
				</div>
				<div class="space-y-1.5 text-[12px] text-text-muted">
					<p>
						• Payment through <strong style={s({ color: c.accent })}>facilitator</strong> (OZ Channels
						/ Coinbase)
					</p>
					<p>• Facilitator verifies and forwards payment</p>
					<p>• Industry standard, cross-chain compatible</p>
				</div>
				<div
					class="rounded-lg p-2.5 font-mono text-[10px] leading-relaxed"
					style={s({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="text-text-dim">// 402 Response</p>
					<p><span style={s({ color: c.accent })}>X-Payment</span>: x402-stellar</p>
					<p><span style={s({ color: c.accent })}>X-Payment-Amount</span>: 0.01 USDC</p>
				</div>
			</div>
			<div class="space-y-3 p-4" style={card}>
				<div class="flex items-center gap-2">
					<span
						class="flex h-7 w-7 items-center justify-center rounded-lg font-mono text-[10px] font-bold"
						style={s({
							background: `color-mix(in oklch, ${c.positive} 8%, transparent)`,
							color: c.positive,
							border: `1px solid color-mix(in oklch, ${c.positive} 15%, transparent)`
						})}>M</span
					>
					<div>
						<h3 class="text-[14px] font-medium" style={s({ color: c.positive })}>MPP</h3>
						<p class="text-[9px] text-text-dim">Machine Payments Protocol</p>
					</div>
				</div>
				<div class="space-y-1.5 text-[12px] text-text-muted">
					<p>
						• <strong style={s({ color: c.positive })}>Direct on-chain</strong> settlement to agent wallet
					</p>
					<p>• No facilitator — fully decentralized</p>
					<p>• Supports sponsored transactions</p>
				</div>
				<div
					class="rounded-lg p-2.5 font-mono text-[10px] leading-relaxed"
					style={s({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<p class="text-text-dim">// 402 Response</p>
					<p><span style={s({ color: c.positive })}>X-Payment</span>: mpp-charge</p>
					<p><span style={s({ color: c.positive })}>X-Payment-Destination</span>: GCDE...7KLP</p>
				</div>
			</div>
		</div>
		<div class="flex flex-wrap items-center justify-center gap-2">
			<span style={neutralPill}>Request</span><span class="text-text-dim">→</span>
			<span style={pill(c.warning)}>402</span><span class="text-text-dim">→</span>
			<span style={neutralPill}>Auto-detect</span><span class="text-text-dim">→</span>
			<span style={pill(c.positive)}>Pay</span><span class="text-text-dim">→</span>
			<span style={neutralPill}>Result</span>
		</div>
		<div class="grid grid-cols-5 gap-2">
			{#each ['No API Keys', '~5s Settlement', 'USDC Stable', 'Auto-detect', 'Both Enabled'] as b (b)}
				<div
					class="rounded-lg px-2 py-1.5 text-center"
					style={s({ background: c.raised, border: `1px solid ${c.border}` })}
				>
					<p class="text-[11px] font-medium" style={s({ color: c.accent })}>{b}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Web Scraper Demo -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.positive })}>
				Live Demo
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Web Scraper Agent</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				A real agent on 8004 — registered on-chain, accepting x402 + MPP, earning USDC.
			</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="space-y-3 p-4" style={card}>
				<div class="flex items-center gap-2.5">
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
						style={s({ background: c.accent, color: '#fff' })}
					>
						S
					</div>
					<div>
						<h3 class="text-[14px] font-medium">Web Scraper Agent</h3>
						<p class="font-mono text-[9px] text-text-dim">stellar:mainnet:CBGP...6X35#1</p>
					</div>
				</div>
				<div class="grid grid-cols-3 gap-2">
					{#each [{ v: '4.5', l: 'Score', co: c.positive }, { v: '12', l: 'Feedback', co: c.accent }, { v: '92%', l: 'Complete', co: c.warning }] as st (st.l)}
						<div class="rounded-lg py-1.5 text-center" style={s({ background: c.overlay })}>
							<p class="text-sm font-medium" style={s({ color: st.co })}>{st.v}</p>
							<p class="text-[8px] text-text-dim uppercase">{st.l}</p>
						</div>
					{/each}
				</div>
				<div
					class="rounded-lg px-3 py-2"
					style={s({ background: c.overlay, border: `1px solid ${c.border}` })}
				>
					<div class="flex items-center justify-between">
						<span class="text-[13px] font-medium">POST /scrape</span>
						<div class="flex gap-1">
							{#each [{ l: 'x402', co: c.warning }, { l: 'MPP', co: c.positive }, { l: 'web', co: c.accent }] as b (b.l)}
								<span style={badge(b.co)}>{b.l}</span>
							{/each}
						</div>
					</div>
					<p class="mt-1 text-[10px] text-text-dim">Scrapes any URL, returns structured content</p>
				</div>
				<div class="space-y-1 font-mono text-[11px]">
					{#each [{ k: 'Trust', v: 'reputation', co: c.positive }, { k: 'Payment', v: 'x402 + MPP · $0.01/req', co: c.warning }, { k: 'Network', v: 'Stellar mainnet', co: c.muted }] as r (r.k)}
						<div class="flex justify-between">
							<span class="text-text-dim">{r.k}</span><span style={s({ color: r.co })}>{r.v}</span>
						</div>
					{/each}
				</div>
			</div>
			<div class="overflow-hidden rounded-xl" style={s({ border: `1px solid ${c.border}` })}>
				<div
					class="flex items-center gap-1.5 px-3 py-1.5"
					style={s({ background: c.overlay, borderBottom: `1px solid ${c.border}` })}
				>
					<div class="flex gap-1">
						{#each ['oklch(0.45 0.10 25/0.5)', 'oklch(0.48 0.08 70/0.5)', 'oklch(0.42 0.08 162/0.5)'] as bg (bg)}
							<div class="h-2 w-2 rounded-full" style={s({ background: bg })}></div>
						{/each}
					</div>
					<div class="mx-2 flex-1">
						<div
							class="rounded px-2 py-0.5 font-mono text-[9px] text-text-dim"
							style={s({ background: c.surface })}
						>
							stellar8004.com/agents/1
						</div>
					</div>
				</div>
				<div class="space-y-2.5 p-3.5" style={s({ background: c.surface })}>
					<div class="flex items-center justify-between">
						<h4 class="text-[13px] font-medium">Try This Agent</h4>
						<span class="rounded-full px-2 py-0.5 font-mono text-[8px]" style={badge(c.positive)}
							>Live</span
						>
					</div>
					<div
						class="flex items-center justify-between rounded-lg px-2.5 py-1.5"
						style={s({ background: c.raised, border: `1px solid ${c.border}` })}
					>
						<span class="text-[11px]">POST /scrape</span>
						<span class="font-mono text-[9px]" style={s({ color: c.warning })}>$0.01 USDC</span>
					</div>
					<div>
						<p class="mb-1 font-mono text-[9px] text-text-dim">Request Body</p>
						<div
							class="rounded-lg p-2 font-mono text-[10px]"
							style={s({ background: c.overlay, border: `1px solid ${c.border}` })}
						>
							<p>{'{'}</p>
							<p class="pl-3">
								<span style={s({ color: c.accent })}>"url"</span><span class="text-text-dim"
									>:
								</span><span style={s({ color: c.positive })}>"https://example.com/news"</span>
							</p>
							<p>}</p>
						</div>
					</div>
					<button
						class="w-full cursor-pointer rounded-lg py-2 text-[13px] font-medium"
						style={s({
							background: `color-mix(in oklch, ${c.accent} 8%, transparent)`,
							color: c.accent,
							border: `1px solid color-mix(in oklch, ${c.accent} 15%, transparent)`
						})}>Send Request →</button
					>
					<div
						class="space-y-1 rounded-lg p-2"
						style={s({
							background: `color-mix(in oklch, ${c.positive} 5%, transparent)`,
							border: `1px solid color-mix(in oklch, ${c.positive} 12%, transparent)`
						})}
					>
						<div class="flex items-center justify-between">
							<span class="font-mono text-[9px]" style={s({ color: c.positive })}>HTTP 200 OK</span>
							<span class="font-mono text-[8px] text-text-dim">tx 8f3a...c21d</span>
						</div>
						<div class="font-mono text-[9px] text-text-muted">
							{'{'} <span style={s({ color: c.accent })}>"title"</span>:
							<span style={s({ color: c.positive })}>"Breaking News..."</span>,
							<span style={s({ color: c.accent })}>"content"</span>:
							<span style={s({ color: c.positive })}>"..."</span> }
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Trust Loop -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.positive })}>
				Trust Loop
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Use → Rate → Trust</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				Every interaction builds the trust layer. Feedback is on-chain, permanent, and transparent.
			</p>
		</div>
		<div class="grid gap-6 lg:grid-cols-2">
			<div
				class="flex items-center justify-center rounded-xl py-8"
				style={s({ background: c.raised, border: `1px solid ${c.border}` })}
			>
				<div class="relative h-56 w-56">
					<div class="absolute inset-0 flex items-center justify-center">
						<div
							class="flex h-16 w-16 items-center justify-center rounded-full"
							style={s({ background: c.overlay, border: `1px solid ${c.accent}30` })}
						>
							<span
								class="text-center text-xs leading-tight font-medium"
								style={s({ color: c.accent })}>On-chain<br />Trust</span
							>
						</div>
					</div>
					{#each trustLoop as tl (tl.pos)}
						<div
							class="absolute space-y-1 text-center"
							style={s({
								top: tl.pos === 'top' ? '0' : tl.pos === 'bottom' ? 'auto' : '50%',
								bottom: tl.pos === 'bottom' ? '0' : 'auto',
								left: tl.pos === 'left' ? '0' : tl.pos === 'right' ? 'auto' : '50%',
								right: tl.pos === 'right' ? '0' : 'auto',
								transform:
									tl.pos === 'top' || tl.pos === 'bottom' ? 'translateX(-50%)' : 'translateY(-50%)'
							})}
						>
							<div
								class="mx-auto flex h-10 w-10 items-center justify-center rounded-lg font-mono text-sm font-bold"
								style={s({
									background: tl.color + '10',
									border: `1px solid ${tl.color}20`,
									color: tl.color
								})}
							>
								{tl.n}
							</div>
							<p class="text-xs font-medium" style={s({ color: tl.color })}>{tl.label}</p>
							<p class="text-[9px] text-text-dim">{tl.sub}</p>
						</div>
					{/each}
				</div>
			</div>
			<div class="space-y-4">
				<div
					class="space-y-3 rounded-xl p-4"
					style={s({ background: c.raised, border: `1px solid ${c.border}` })}
				>
					<p class="font-mono text-[11px] tracking-wider text-text-dim uppercase">Score Impact</p>
					<div>
						<div class="mb-1.5 flex justify-between text-sm">
							<span class="text-text-muted">Before</span><span
								class="font-mono"
								style={s({ color: c.accent })}>4.2</span
							>
						</div>
						<div class="h-2.5 overflow-hidden rounded-full" style={s({ background: c.overlay })}>
							<div
								class="h-full rounded-full"
								style={s({ width: '84%', background: c.accent })}
							></div>
						</div>
					</div>
					<p class="text-center font-mono text-[10px] text-text-dim">
						+ feedback: 5/6 "Success Rate"
					</p>
					<div>
						<div class="mb-1.5 flex justify-between text-sm">
							<span class="text-text-muted">After</span><span
								class="font-mono"
								style={s({ color: c.positive })}>4.3</span
							>
						</div>
						<div class="h-2.5 overflow-hidden rounded-full" style={s({ background: c.overlay })}>
							<div
								class="h-full rounded-full"
								style={s({ width: '86%', background: c.positive })}
							></div>
						</div>
					</div>
				</div>
				<div
					class="space-y-2 rounded-xl p-4"
					style={s({ background: c.raised, border: `1px solid ${c.border}` })}
				>
					<p class="font-mono text-[11px] tracking-wider text-text-dim uppercase">
						Recent Feedback
					</p>
					{#each recentFeedback as rf (rf.from)}
						<div
							class="flex items-center justify-between rounded-lg px-3 py-2"
							style={s({
								background: rf.highlight ? c.positive + '06' : c.overlay,
								border: `1px solid ${rf.highlight ? c.positive + '20' : c.border}`
							})}
						>
							<div class="flex items-center gap-2">
								<div class="flex gap-0.5">
									{#each [0, 1, 2, 3, 4, 5] as j (j)}
										<div
											class="h-1.5 w-1.5 rounded-sm"
											style={s({ background: j < rf.score ? c.positive : c.overlay })}
										></div>
									{/each}
								</div>
								<span class="font-mono text-[10px] text-text-dim">{rf.tag}</span>
							</div>
							<div class="text-right">
								<p class="font-mono text-[9px] text-text-dim">{rf.from}</p>
								<p class="text-[8px] text-text-dim">{rf.time}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- DevTools -->
	<section class="space-y-6">
		<div>
			<p class="text-[11px] font-medium tracking-wider uppercase" style={s({ color: c.accent })}>
				Developer Experience
			</p>
			<h2 class="mt-2 text-3xl font-light tracking-tight">Build on 8004 in Minutes</h2>
			<p class="mt-2 text-[15px] text-text-muted">
				TypeScript SDK, REST API, and registration examples.
			</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div
				class="space-y-3 rounded-xl p-4"
				style={s({ background: c.raised, border: `1px solid ${c.border}` })}
			>
				<div class="flex items-center justify-between">
					<p class="font-mono text-[11px] tracking-wider uppercase" style={s({ color: c.accent })}>
						TypeScript SDK
					</p>
					<span
						class="rounded px-2 py-0.5 font-mono text-[9px] text-text-dim"
						style={s({ background: c.overlay })}>@trionlabs/stellar8004</span
					>
				</div>
				<div
					class="space-y-0.5 rounded-lg p-3 font-mono text-[11px] leading-relaxed"
					style={s({ background: c.surface, border: `1px solid ${c.border}` })}
				>
					<p>
						<span style={s({ color: c.accent })}>import</span>
						{'{'} IdentityClient, MAINNET_CONFIG }
					</p>
					<p class="pl-2 text-text-dim">
						<span style={s({ color: c.accent })}>from</span>
						<span style={s({ color: c.positive })}>'@trionlabs/stellar8004'</span>;
					</p>
					<p class="mt-2">
						<span style={s({ color: c.accent })}>const</span> identity =
						<span style={s({ color: c.accent })}>new</span>
						<span style={s({ color: c.warning })}>IdentityClient</span>({'{'}
					</p>
					<p class="pl-2">rpcUrl: MAINNET_CONFIG.rpcUrl,</p>
					<p class="pl-2">networkPassphrase: MAINNET_CONFIG.networkPassphrase,</p>
					<p class="pl-2">contractId: MAINNET_CONFIG.contracts.identity</p>
					<p>});</p>
					<p class="mt-2">
						<span style={s({ color: c.accent })}>const</span>
						{'{'} result: owner } =
						<span style={s({ color: c.accent })}>await</span> identity.<span
							style={s({ color: c.warning })}>owner_of</span
						>({'{'} token_id: <span style={s({ color: c.positive })}>1</span> });
					</p>
					<p>console.log(owner);</p>
				</div>
			</div>
			<div
				class="space-y-3 rounded-xl p-4"
				style={s({ background: c.raised, border: `1px solid ${c.border}` })}
			>
				<div class="flex items-center justify-between">
					<p class="font-mono text-[11px] tracking-wider uppercase" style={s({ color: c.accent })}>
						Stellar Development Skills
					</p>
					<span
						class="rounded px-2 py-0.5 font-mono text-[9px] text-text-dim"
						style={s({ background: c.overlay })}>Official Stellar skills</span
					>
				</div>
				<div
					class="space-y-2 rounded-lg p-3 font-mono text-[11px] leading-relaxed"
					style={s({ background: c.surface, border: `1px solid ${c.border}` })}
				>
					<div>
						<p class="text-text-dim"># Install the official Stellar skills</p>
						<p>
							<span style={s({ color: c.positive })}>$</span> npx skills add https://github.com/stellar/stellar-dev-skill
						</p>
					</div>
					<div>
						<p class="text-text-dim">Choose the skills relevant to your project.</p>
						<p class="text-text-dim">Smart contracts, dapps, data, and payments</p>
					</div>
				</div>
			</div>
			<div
				class="space-y-3 rounded-xl p-4"
				style={s({ background: c.raised, border: `1px solid ${c.border}` })}
			>
				<p class="font-mono text-[11px] tracking-wider uppercase" style={s({ color: c.accent })}>
					REST API
				</p>
				<div class="space-y-1.5 font-mono text-[11px]">
					{#each restEndpoints as e (e.path)}
						<div class="flex items-center gap-2.5">
							<span style={s({ color: c.positive })} class="w-7">{e.method}</span>
							<span class="flex-1">{e.path}</span>
							<span class="text-[10px] text-text-dim">{e.desc}</span>
						</div>
					{/each}
				</div>
			</div>
			<div
				class="space-y-3 rounded-xl p-4"
				style={s({ background: c.raised, border: `1px solid ${c.border}` })}
			>
				<p class="font-mono text-[11px] tracking-wider uppercase" style={s({ color: c.accent })}>
					5-Step Registration
				</p>
				<div class="space-y-1.5">
					{#each registrationSteps as rs (rs.step)}
						<div
							class="flex items-center gap-2.5 rounded-lg px-3 py-1.5"
							style={s({ background: c.overlay })}
						>
							<span class="w-4 font-mono text-sm font-bold" style={s({ color: c.accent })}
								>{rs.step}</span
							>
							<span class="w-24 text-sm font-medium">{rs.label}</span>
							<span class="text-xs text-text-dim">{rs.desc}</span>
						</div>
					{/each}
				</div>
				<p class="text-center font-mono text-[10px] text-text-dim">
					Register an agent in 60 seconds. On-chain forever.
				</p>
			</div>
		</div>
	</section>

	<!-- Closing -->
	<section class="flex flex-col items-center justify-center gap-8 py-12 text-center">
		<div class="flex items-center gap-3">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold"
				style={s({ background: c.accent, color: '#fff' })}
			>
				8
			</div>
			<span class="text-4xl font-light tracking-tight"
				>Stellar<span class="font-semibold" style={s({ color: c.accent })}>8004</span></span
			>
		</div>
		<div class="flex flex-wrap items-center justify-center gap-10">
			{#each closingWords as cw (cw.word)}
				<div class="space-y-1.5 text-center">
					<p class="text-2xl font-medium" style={s({ color: cw.color })}>{cw.word}</p>
					<p class="max-w-36 text-xs text-text-muted">{cw.desc}</p>
				</div>
			{/each}
		</div>
		<div
			class="h-px w-24"
			style={s({
				background: `linear-gradient(90deg, transparent, ${c.accent}, transparent)`,
				opacity: 0.25
			})}
		></div>
		<div class="flex flex-wrap items-center justify-center gap-7">
			{#each stats as st (st.l)}
				<div class="text-center">
					<p class="font-mono text-lg font-medium" style={s({ color: c.accent })}>{st.v}</p>
					<p class="text-[10px] tracking-wider text-text-dim uppercase">{st.l}</p>
				</div>
			{/each}
		</div>
		<div class="space-y-2">
			<p class="text-3xl font-light" style={s({ color: c.accent })}>stellar8004.com</p>
			<p class="font-mono text-sm text-text-dim">Open Source · Mainnet · Trustless</p>
		</div>
		<div
			class="flex flex-wrap items-center justify-center gap-2 font-mono text-[10px] text-text-dim"
		>
			{#each ['Rust', 'Soroban', 'TypeScript', 'SvelteKit', 'Supabase', 'Stellar'] as t (t)}
				<span class="rounded-full px-3 py-1" style={s({ border: `1px solid ${c.border}` })}
					>{t}</span
				>
			{/each}
		</div>
	</section>
</div>
