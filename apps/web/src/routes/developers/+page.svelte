<script lang="ts">
	import { resolve } from '$app/paths';
	import CtaButton from '$lib/components/CtaButton.svelte';

	const skills = [
		{
			name: '8004s',
			slash: '/8004s',
			desc: 'ERC-8004 Agent Trust Protocol on Soroban. Covers IdentityRegistry (registerAgent, updateAgentUri), ReputationRegistry (submitFeedback, getFeedbackByAgent), and ValidationRegistry (requestValidation, submitValidation). Includes testnet contract addresses, nativeToScVal patterns, and Freighter transaction signing.',
			install: 'claude install trionlabs/stellar-8004 --subpath skills/8004s',
			repo: 'https://github.com/trionlabs/stellar-8004',
		},
		{
			name: 'x402s',
			slash: '/x402s',
			desc: 'x402 HTTP-native micropayments on Stellar. Implements HTTP 402 Payment Required flows with USDC on Soroban — pay-per-call API monetization, Soroban authorization entries, facilitator configuration, and @trionlabs/x402-stellar client/server SDK.',
			install: 'claude install trionlabs/stellar-8004 --subpath skills/x402s',
			repo: 'https://github.com/trionlabs/stellar-8004',
		},
		{
			name: 'stellar-dev',
			slash: '/stellar-dev',
			desc: 'End-to-end Stellar development playbook. Soroban smart contracts (Rust SDK), stellar-cli, JS/Python/Go SDKs, Stellar RPC and Horizon API, Assets vs Soroban tokens (SAC bridge), Freighter wallet integration, and testnet/mainnet deployment.',
			install: 'claude install stellar/stellar-dev-skill',
			repo: 'https://github.com/stellar/stellar-dev-skill',
		},
	];

	let copiedIdx = $state<number | null>(null);

	async function copyInstall(idx: number) {
		await navigator.clipboard.writeText(skills[idx].install);
		copiedIdx = idx;
		setTimeout(() => { copiedIdx = null; }, 1500);
	}

	const endpoints = [
		{ method: 'GET', path: '/api/v1/agents', desc: 'List all agents with pagination and filtering' },
		{ method: 'GET', path: '/api/v1/agents/:id', desc: 'Get agent details including metadata and scores' },
		{ method: 'GET', path: '/api/v1/agents/:id/feedback', desc: 'List feedback for a specific agent' },
		{ method: 'GET', path: '/api/v1/accounts/:address/agents', desc: 'List agents owned by a wallet address' },
		{ method: 'GET', path: '/api/v1/search?q=...', desc: 'Full-text search across agents' },
		{ method: 'GET', path: '/api/v1/stats', desc: 'Aggregate network statistics' },
		{ method: 'GET', path: '/api/v1/health', desc: 'Indexer health status' },
	];

	const codeExamples = {
		curl: `# List agents
curl https://stellar8004.trionlabs.dev/api/v1/agents?page=1&limit=10

# Get agent details
curl https://stellar8004.trionlabs.dev/api/v1/agents/1

# Search agents
curl "https://stellar8004.trionlabs.dev/api/v1/search?q=trading"`,
		js: `// List agents
const res = await fetch('https://stellar8004.trionlabs.dev/api/v1/agents?page=1&limit=10');
const { data, meta } = await res.json();

// Get agent details
const agent = await fetch('https://stellar8004.trionlabs.dev/api/v1/agents/1').then(r => r.json());`,
		py: `import requests

# List agents
res = requests.get('https://stellar8004.trionlabs.dev/api/v1/agents', params={'page': 1, 'limit': 10})
data = res.json()

# Get agent details
agent = requests.get('https://stellar8004.trionlabs.dev/api/v1/agents/1').json()`,
	};

	let activeLang = $state<'curl' | 'js' | 'py'>('curl');
</script>

<svelte:head>
	<title>Developer Portal — Stellar8004</title>
	<meta name="description" content="Public REST API for 8004 Agent Trust Protocol on Stellar" />
</svelte:head>

<div class="mx-auto max-w-4xl space-y-10">
	<!-- Claude Code Skills — hero position -->
	<section class="cta-banner group/cta relative overflow-hidden rounded-2xl border border-accent/8 bg-linear-to-br from-surface-raised via-surface-overlay to-surface-raised p-8 sm:p-10">
		<div class="pointer-events-none absolute inset-0 cta-noise"></div>
		<div class="cta-leak cta-leak--warm"></div>
		<div class="cta-leak cta-leak--cool"></div>

		<div class="relative z-10 space-y-6">
			<div class="space-y-2">
				<div class="flex items-center gap-3">
					<span class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase">
						<span class="h-1 w-1 rounded-full bg-accent animate-pulse"></span>
						Claude Code Skills
					</span>
				</div>
				<h2 class="text-2xl font-light tracking-tight text-text">
					Build on <span class="text-accent">Stellar8004</span> from your terminal
				</h2>
				<p class="max-w-2xl text-[13px] leading-relaxed text-text-muted">
					Open-source skills that give Claude Code full context on 8004 smart contracts, Stellar SDK patterns, and x402 payment flows. One command to install — then use slash commands like <code class="rounded bg-accent/8 px-1.5 py-0.5 text-[11px] text-accent">/8004s</code> directly in Claude Code.
				</p>
			</div>

			<div class="grid gap-3 sm:grid-cols-3">
				{#each skills as skill, i (skill.name)}
					<div class="skill-card">
						<div class="flex items-center justify-between">
							<code class="text-[13px] font-semibold text-accent">{skill.slash}</code>
							<a href={skill.repo} target="_blank" rel="noopener noreferrer" class="text-text-dim/30 transition hover:text-accent" aria-label="GitHub repo for {skill.name}">
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
							</a>
						</div>
						<p class="mt-2 text-[11px] text-text-dim/70 leading-[1.6]">{skill.desc}</p>
						<button
							type="button"
							onclick={() => copyInstall(i)}
							class="install-cmd group/cmd"
						>
							<code class="flex-1 truncate">{skill.install}</code>
							{#if copiedIdx === i}
								<svg class="h-3.5 w-3.5 shrink-0 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
							{:else}
								<svg class="h-3.5 w-3.5 shrink-0 text-text-dim/25 transition group-hover/cmd:text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
							{/if}
						</button>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- REST API -->
	<div class="space-y-4">
		<span class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase">
			<span class="h-1 w-1 rounded-full bg-accent"></span>
			REST API v1
		</span>
		<h1 class="text-3xl font-light tracking-tight text-text">API Reference</h1>
		<p class="text-sm text-text-muted">
			Public read-only API for all indexed agent data. No authentication required. Base URL: <code class="rounded bg-surface-raised px-1.5 py-0.5 text-[11px] text-text font-mono">https://stellar8004.trionlabs.dev</code>
		</p>
	</div>

	<section class="space-y-4">
		<h2 class="text-lg font-medium text-text">Endpoints</h2>
		<div class="overflow-hidden rounded-lg border border-border bg-surface">
			<table class="min-w-full text-sm">
				<thead class="bg-surface-raised text-left text-xs tracking-[0.12em] text-text-dim uppercase">
					<tr>
						<th class="px-6 py-3 font-medium">Method</th>
						<th class="px-6 py-3 font-medium">Path</th>
						<th class="px-6 py-3 font-medium">Description</th>
					</tr>
				</thead>
				<tbody>
					{#each endpoints as ep (ep.path)}
						<tr class="border-t border-border">
							<td class="px-6 py-3">
								<span class="rounded-full bg-accent/5 px-2 py-0.5 text-[10px] font-medium text-accent">{ep.method}</span>
							</td>
							<td class="px-6 py-3 font-mono text-xs text-text">{ep.path}</td>
							<td class="px-6 py-3 text-text-muted">{ep.desc}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="space-y-4">
		<h2 class="text-lg font-medium text-text">Quick Start</h2>
		<div class="flex gap-2">
			{#each [
				{ id: 'curl' as const, label: 'cURL' },
				{ id: 'js' as const, label: 'JavaScript' },
				{ id: 'py' as const, label: 'Python' }
			] as lang (lang.id)}
				<button
					type="button"
					onclick={() => activeLang = lang.id}
					class="rounded-lg border px-4 py-2 text-xs font-medium transition-colors
						{activeLang === lang.id
							? 'border-accent/20 bg-accent/6 text-accent'
							: 'border-border/50 text-text-dim hover:text-text-muted hover:border-border'}"
				>
					{lang.label}
				</button>
			{/each}
		</div>
		<div class="rounded-lg border border-border bg-surface p-4">
			<pre class="overflow-auto text-xs leading-relaxed text-text-muted">{codeExamples[activeLang]}</pre>
		</div>
	</section>

	<section class="space-y-4">
		<h2 class="text-lg font-medium text-text">Response Format</h2>
		<div class="rounded-lg border border-border bg-surface p-4">
			<pre class="overflow-auto text-xs leading-relaxed text-text-muted">{`{
  "success": true,
  "data": { ... },
  "meta": {
    "version": "1.0.0",
    "chain": "stellar",
    "network": "testnet",
    "timestamp": "2026-04-06T...",
    "requestId": "uuid",
    "pagination": { "page": 1, "limit": 20, "total": 45, "hasMore": true }
  }
}`}</pre>
		</div>
	</section>

	<section class="space-y-4">
		<h2 class="text-lg font-medium text-text">Rate Limits</h2>
		<div class="overflow-hidden rounded-lg border border-border bg-surface">
			<table class="min-w-full text-sm">
				<thead class="bg-surface-raised text-left text-xs tracking-[0.12em] text-text-dim uppercase">
					<tr>
						<th class="px-6 py-3 font-medium">Access</th>
						<th class="px-6 py-3 font-medium">Limit</th>
						<th class="px-6 py-3 font-medium">Notes</th>
					</tr>
				</thead>
				<tbody>
					<tr class="border-t border-border">
						<td class="px-6 py-3 text-text">Anonymous</td>
						<td class="px-6 py-3 font-mono text-text">30 req/min</td>
						<td class="px-6 py-3 text-text-muted">IP-based, best-effort</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<section class="space-y-4">
		<h2 class="text-lg font-medium text-text">Error Responses</h2>
		<div class="overflow-hidden rounded-lg border border-border bg-surface">
			<table class="min-w-full text-sm">
				<thead class="bg-surface-raised text-left text-xs tracking-[0.12em] text-text-dim uppercase">
					<tr>
						<th class="px-6 py-3 font-medium">Code</th>
						<th class="px-6 py-3 font-medium">HTTP</th>
						<th class="px-6 py-3 font-medium">Description</th>
					</tr>
				</thead>
				<tbody>
					<tr class="border-t border-border">
						<td class="px-6 py-3 font-mono text-xs">INVALID_PARAMS</td>
						<td class="px-6 py-3">400</td>
						<td class="px-6 py-3 text-text-muted">Missing or invalid query parameters</td>
					</tr>
					<tr class="border-t border-border">
						<td class="px-6 py-3 font-mono text-xs">NOT_FOUND</td>
						<td class="px-6 py-3">404</td>
						<td class="px-6 py-3 text-text-muted">Agent or endpoint not found</td>
					</tr>
					<tr class="border-t border-border">
						<td class="px-6 py-3 font-mono text-xs">RATE_LIMITED</td>
						<td class="px-6 py-3">429</td>
						<td class="px-6 py-3 text-text-muted">Too many requests — try again later</td>
					</tr>
					<tr class="border-t border-border">
						<td class="px-6 py-3 font-mono text-xs">INTERNAL_ERROR</td>
						<td class="px-6 py-3">500</td>
						<td class="px-6 py-3 text-text-muted">Server error — retry with backoff</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>
</div>

<style>
	.skill-card {
		padding: 16px;
		border-radius: 10px;
		border: 0.5px solid oklch(0.24 0.016 250 / 0.5);
		background: oklch(0.13 0.014 250 / 0.6);
		transition: border-color 0.2s, box-shadow 0.2s;
	}
	.skill-card:hover {
		border-color: oklch(0.74 0.07 250 / 0.15);
		box-shadow: 0 0 20px oklch(0.74 0.07 250 / 0.04);
	}
	.install-cmd {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		margin-top: 12px;
		padding: 8px 10px;
		border-radius: 7px;
		border: 0.5px solid oklch(0.24 0.016 250 / 0.4);
		background: oklch(0.11 0.012 250 / 0.8);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 10px;
		color: oklch(0.48 0.012 250);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}
	.install-cmd:hover {
		border-color: oklch(0.74 0.07 250 / 0.2);
		color: oklch(0.64 0.012 250);
	}
</style>
