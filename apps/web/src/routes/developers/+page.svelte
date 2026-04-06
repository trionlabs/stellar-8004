<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const skills = [
		{
			name: '8004s',
			slash: '/8004s',
			desc: 'ERC-8004 Agent Trust Protocol on Soroban. Covers IdentityRegistry (registerAgent, updateAgentUri), ReputationRegistry (submitFeedback, getFeedbackByAgent), and ValidationRegistry (requestValidation, submitValidation). Includes testnet contract addresses, nativeToScVal patterns, and Freighter transaction signing.',
			install: 'claude install trionlabs/stellar-8004 --subpath skills/8004s',
			repo: 'https://github.com/trionlabs/stellar-8004'
		},
		{
			name: 'x402s',
			slash: '/x402s',
			desc: 'x402 HTTP-native micropayments on Stellar. Implements HTTP 402 Payment Required flows with USDC on Soroban — pay-per-call API monetization, Soroban authorization entries, facilitator configuration, and @trionlabs/x402-stellar client/server SDK.',
			install: 'claude install trionlabs/stellar-8004 --subpath skills/x402s',
			repo: 'https://github.com/trionlabs/stellar-8004'
		},
		{
			name: 'stellar-dev',
			slash: '/stellar-dev',
			desc: 'End-to-end Stellar development playbook. Soroban smart contracts (Rust SDK), stellar-cli, JS/Python/Go SDKs, Stellar RPC and Horizon API, Assets vs Soroban tokens (SAC bridge), Freighter wallet integration, and testnet/mainnet deployment.',
			install: 'claude install stellar/stellar-dev-skill',
			repo: 'https://github.com/stellar/stellar-dev-skill'
		}
	];

	const endpoints = [
		{ method: 'GET', path: '/api/v1/agents', desc: 'List all agents with pagination and filtering' },
		{ method: 'GET', path: '/api/v1/agents/:id', desc: 'Get agent details including metadata and scores' },
		{ method: 'GET', path: '/api/v1/agents/:id/feedback', desc: 'List feedback for a specific agent' },
		{ method: 'GET', path: '/api/v1/accounts/:address/agents', desc: 'List agents owned by a wallet address' },
		{ method: 'GET', path: '/api/v1/search?q=...', desc: 'Full-text search across agents' },
		{ method: 'GET', path: '/api/v1/stats', desc: 'Aggregate network statistics' },
		{ method: 'GET', path: '/api/v1/health', desc: 'Indexer health status' }
	];

	const codeExamples = {
		curl: `# List agents
curl https://stellar8004.com/api/v1/agents?page=1&limit=10

# Get agent details
curl https://stellar8004.com/api/v1/agents/1

# Search agents
curl "https://stellar8004.com/api/v1/search?q=trading"`,
		js: `// List agents
const res = await fetch('https://stellar8004.com/api/v1/agents?page=1&limit=10');
const { data, meta } = await res.json();

// Get agent details
const agent = await fetch('https://stellar8004.com/api/v1/agents/1').then((r) => r.json());`,
		py: `import requests

# List agents
res = requests.get('https://stellar8004.com/api/v1/agents', params={'page': 1, 'limit': 10})
data = res.json()

# Get agent details
agent = requests.get('https://stellar8004.com/api/v1/agents/1').json()`
	};

	const codeExampleLang = {
		curl: 'bash',
		js: 'ts',
		py: 'python'
	} as const;

	const sdkInstallCommand = `pnpm add @trionlabs/8004s-sdk @stellar/stellar-sdk
pnpm add -D tsx

# Optional: browser signer support
pnpm add @stellar/freighter-api`;

	const sdkQuickStart = `import { Keypair } from '@stellar/stellar-sdk';
import {
  AutoStorage,
  SorobanClient,
  TESTNET_CONFIG,
  buildMetadataJson,
  fundTestnet,
  getMetadataSize,
  wrapBasicSigner
} from '@trionlabs/8004s-sdk';

const secret = process.env.STELLAR_SECRET_KEY;
if (!secret) {
  throw new Error('Set STELLAR_SECRET_KEY before running this script');
}

const keypair = Keypair.fromSecret(secret);
const signer = wrapBasicSigner(keypair, TESTNET_CONFIG.networkPassphrase);
const client = new SorobanClient(signer, TESTNET_CONFIG);

await fundTestnet(signer.publicKey);

const metadata = buildMetadataJson({
  name: 'DataBot',
  description: 'Real-time market data feed',
  imageUrl: 'https://example.com/avatar.png',
  services: [
    {
      name: 'quotes',
      endpoint: 'https://api.example.com/quotes',
      version: 'v1'
    }
  ],
  supportedTrust: ['crypto-economic'],
  x402Enabled: true
});

console.log('Metadata bytes:', getMetadataSize(metadata));

const storage = new AutoStorage({
  pinataJwt: process.env.PINATA_JWT
});

const agentUri = await storage.upload(metadata);
const result = await client.registerAgent(agentUri);

console.log('Registered agent:', result.agentId);
console.log('Transaction hash:', result.hash);`;

	const registrationFlowDiagram = `Developer App
    |
    | 1. buildMetadataJson()
    v
SDK Metadata Builder
    |
    | 2. AutoStorage.upload()
    |    - data: URI if <= 8KB
    |    - Pinata/IPFS if > 8KB
    v
Agent URI
    |
    | 3. SorobanClient.registerAgent(uri)
    v
Soroban RPC
    |
    | 4. simulate -> assemble -> sign -> send
    v
IdentityRegistry Contract
    |
    | 5. register_with_uri(owner, uri)
    v
On-chain agent id + tx hash
    |
    | 6. Indexer ingests ledger + resolves URI
    v
stellar8004.com Explorer API
    |
    | 7. ExplorerClient.getAgent(id)
    v
Verified public agent profile`;

	const registerScript = `import { setTimeout as sleep } from 'node:timers/promises';
import { Keypair } from '@stellar/stellar-sdk';
import {
  AutoStorage,
  ExplorerClient,
  SorobanClient,
  TESTNET_CONFIG,
  buildMetadataJson,
  fundTestnet,
  getMetadataSize,
  wrapBasicSigner
} from '@trionlabs/8004s-sdk';

const secret = process.env.STELLAR_SECRET_KEY;
if (!secret) {
  throw new Error('Missing STELLAR_SECRET_KEY');
}

const keypair = Keypair.fromSecret(secret);
const signer = wrapBasicSigner(keypair, TESTNET_CONFIG.networkPassphrase);
const client = new SorobanClient(signer, TESTNET_CONFIG);
const explorer = new ExplorerClient('https://stellar8004.com');

const metadata = buildMetadataJson({
  name: 'Weather Concierge',
  description: 'Summarises local weather and issues severe alerts',
  imageUrl: 'https://example.com/weather.png',
  services: [
    {
      name: 'forecast',
      endpoint: 'https://api.example.com/weather',
      version: 'v1'
    }
  ],
  supportedTrust: ['crypto-economic', 'tee-attestation'],
  x402Enabled: false
});

console.log('Metadata bytes:', getMetadataSize(metadata));
await fundTestnet(signer.publicKey);

const storage = new AutoStorage({
  pinataJwt: process.env.PINATA_JWT
});

const agentUri = await storage.upload(metadata);
console.log('Agent URI:', agentUri);

const { agentId, hash } = await client.registerAgent(agentUri);
console.log('Submitted tx:', hash);
console.log('Waiting for indexer...');

for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    const response = await explorer.getAgent(agentId);
    console.log('Indexed agent:', response.data.name ?? '(unnamed)');
    console.log('Explorer URL:', 'https://stellar8004.com/agents/' + agentId);
    process.exit(0);
  } catch (error) {
    if (attempt === 12) {
      throw error;
    }

    console.log('Indexer not ready yet (' + attempt + '/12), retrying in 10s...');
    await sleep(10_000);
  }
}`;

	const apiClientExample = `import { ExplorerClient } from '@trionlabs/8004s-sdk';

const explorer = new ExplorerClient('https://stellar8004.com');

const latestAgents = await explorer.getAgents({ page: 1, limit: 5 });
console.log('Newest agents:', latestAgents.data.map((agent) => agent.name ?? agent.id));

const searchResults = await explorer.search('trading', { limit: 3 });
console.log('Search hits:', searchResults.data.length);

const stats = await explorer.getStats();
console.log('Total indexed agents:', stats.data.totalAgents);

const health = await explorer.health();
console.log('Indexer status:', health.data.status);`;

	const responseFormatExample = `{
  "success": true,
  "data": { "...": "payload" },
  "meta": {
    "version": "1.0.0",
    "chain": "stellar",
    "network": "testnet",
    "timestamp": "2026-04-06T00:00:00.000Z",
    "requestId": "uuid",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "hasMore": true,
      "nextPage": 2
    }
  }
}`;

	const sdkLinks = [
		{
			title: 'ERC-8004 spec',
			href: 'https://eips.ethereum.org/EIPS/eip-8004',
			desc: 'Canonical protocol definition, metadata type URI, and registry model.'
		},
		{
			title: 'Contract source',
			href: 'https://github.com/trionlabs/stellar-8004',
			desc: 'Identity, reputation, and validation registry source for Stellar.'
		},
		{
			title: 'Testnet faucet',
			href: 'https://lab.stellar.org/account/fund',
			desc: 'Fund a fresh Stellar keypair with testnet XLM before registering.'
		},
		{
			title: 'Best practices',
			href: 'https://best-practices.8004scan.io/docs/implementation/agent-metadata-parsing',
			desc: 'Practical metadata parsing and validation guidance for ERC-8004.'
		},
		{
			title: 'Metadata size helper',
			href: 'https://stellar8004.com/register',
			desc: 'Use the live register flow to watch metadata byte size before uploading.'
		}
	];

	const prerequisites = [
		{
			title: 'Stellar keypairs',
			desc: 'Use Keypair.random() for a disposable testnet identity or Keypair.fromSecret(secret) to automate an existing wallet.'
		},
		{
			title: 'Funding',
			desc: 'On testnet you can use fundTestnet() or the Stellar Lab faucet. On mainnet you must provide your own XLM and override TESTNET_CONFIG.'
		},
		{
			title: 'Pinata JWT',
			desc: 'Optional. AutoStorage only needs PINATA_JWT when metadata grows past the 8KB data URI limit.'
		}
	];

	const sdkChecklist = [
		'Install the SDK and tsx for one-file scripts.',
		'Create or load a Stellar keypair and fund it on testnet.',
		'Build metadata with buildMetadataJson() and inspect its byte size.',
		'Upload through AutoStorage so small payloads stay as data URIs.',
		'Register on Soroban, then verify through the Explorer API.'
	];

	let copiedKey = $state<string | null>(null);
	let activeLang = $state<'curl' | 'js' | 'py'>('curl');

	async function copyText(key: string, text: string) {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;

		await navigator.clipboard.writeText(text);
		copiedKey = key;
		setTimeout(() => {
			if (copiedKey === key) copiedKey = null;
		}, 1500);
	}
</script>

<svelte:head>
	<title>Developer Portal — Stellar8004</title>
	<meta
		name="description"
		content="Public REST API and TypeScript SDK docs for the 8004 Agent Trust Protocol on Stellar."
	/>
</svelte:head>

<div class="space-y-10">
	<section class="cta-banner group/cta relative overflow-hidden rounded-2xl border border-border/50 bg-linear-to-br from-surface-raised via-surface-overlay to-surface-raised p-5 sm:p-10">
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

			<div class="grid gap-3 sm:grid-cols-2">
				{#each skills as skill, i (skill.name)}
					<div class="skill-card {i === 0 ? 'sm:col-span-2' : ''}">
						<div class="flex items-center justify-between">
							<code class="text-[13px] font-semibold text-accent">{skill.slash}</code>
							<a href={skill.repo} target="_blank" rel="noopener noreferrer" class="text-text-muted/50 transition hover:text-accent" aria-label={`GitHub repo for ${skill.name}`}>
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
							</a>
						</div>
						<p class="mt-2 text-[12px] text-text/70 leading-[1.6]">{skill.desc}</p>
						<button
							type="button"
							onclick={() => copyText(`skill:${skill.name}`, skill.install)}
							class="install-cmd group/cmd"
						>
							<code class="flex-1 truncate">{skill.install}</code>
							{#if copiedKey === `skill:${skill.name}`}
								<svg class="h-3.5 w-3.5 shrink-0 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
							{:else}
								<svg class="h-3.5 w-3.5 shrink-0 text-text-dim transition group-hover/cmd:text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
							{/if}
						</button>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<div class="space-y-4">
		<span class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase">
			<span class="h-1 w-1 rounded-full bg-accent"></span>
			REST API v1
		</span>
		<h1 class="text-2xl font-light tracking-tight text-text sm:text-3xl">API Reference</h1>
		<p class="text-sm text-text-muted">
			Public read-only API for indexed agent data and the matching TypeScript SDK for writes plus explorer reads. Base URL: <code class="rounded bg-surface-raised px-1.5 py-0.5 text-[11px] text-text font-mono">https://stellar8004.com</code>
		</p>
	</div>

	<section class="space-y-4">
		<h2 class="text-lg font-medium text-text">Endpoints</h2>

		<div class="hidden overflow-x-auto rounded-lg border border-border bg-surface sm:block">
			<table class="min-w-full text-sm">
				<thead class="bg-surface-raised text-left text-xs tracking-[0.12em] text-text-dim uppercase">
					<tr>
						<th class="px-4 py-3 font-medium">Method</th>
						<th class="px-4 py-3 font-medium">Path</th>
						<th class="px-4 py-3 font-medium">Description</th>
					</tr>
				</thead>
				<tbody>
					{#each endpoints as ep (ep.path)}
						<tr class="border-t border-border">
							<td class="px-4 py-3">
								<span class="rounded-full bg-accent/5 px-2 py-0.5 text-[10px] font-medium text-accent">{ep.method}</span>
							</td>
							<td class="px-4 py-3 font-mono text-xs text-text">{ep.path}</td>
							<td class="px-4 py-3 text-text-muted">{ep.desc}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="space-y-2 sm:hidden">
			{#each endpoints as ep (ep.path)}
				<div class="rounded-lg border border-border bg-surface p-3 space-y-1.5">
					<div class="flex items-center gap-2">
						<span class="rounded-full bg-accent/5 px-2 py-0.5 text-[10px] font-medium text-accent">{ep.method}</span>
						<code class="truncate font-mono text-[11px] text-text">{ep.path}</code>
					</div>
					<p class="text-[12px] text-text-muted">{ep.desc}</p>
				</div>
			{/each}
		</div>
	</section>

	<section class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-medium text-text">Quick Start</h2>
			<button type="button" class="copy-btn" onclick={() => copyText(`rest:${activeLang}`, codeExamples[activeLang])}>
				{#if copiedKey === `rest:${activeLang}`}
					Copied
				{:else}
					Copy example
				{/if}
			</button>
		</div>
		<div class="flex flex-wrap gap-2">
			{#each [
				{ id: 'curl' as const, label: 'cURL' },
				{ id: 'js' as const, label: 'JS' },
				{ id: 'py' as const, label: 'Python' }
			] as lang (lang.id)}
				<button
					type="button"
					onclick={() => activeLang = lang.id}
					class="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
						{activeLang === lang.id
							? 'border-accent/20 bg-accent/6 text-accent'
							: 'border-border/50 text-text-dim hover:border-border hover:text-text-muted'}"
				>
					{lang.label}
				</button>
			{/each}
		</div>
		<CodeBlock code={codeExamples[activeLang]} lang={codeExampleLang[activeLang]} />
	</section>

	<section class="space-y-6">
		<div class="space-y-3">
			<span class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase">
				<span class="h-1 w-1 rounded-full bg-accent"></span>
				TypeScript SDK
			</span>
			<h2 class="text-2xl font-light tracking-tight text-text">SDK Quick Start</h2>
			<p class="max-w-3xl text-sm leading-relaxed text-text-muted">
				The SDK gives you one surface for testnet funding, metadata building, automatic storage selection, Soroban contract writes, and read-only explorer queries. The fastest onboarding path is: fund → signer → client → metadata → storage → register.
			</p>
		</div>

		<div class="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<div class="flex items-center justify-between gap-3">
					<h3 class="text-sm font-medium text-text">Install</h3>
					<button type="button" class="copy-btn" onclick={() => copyText('sdk:install', sdkInstallCommand)}>
						{#if copiedKey === 'sdk:install'}Copied{:else}Copy{/if}
					</button>
				</div>
				<CodeBlock code={sdkInstallCommand} lang="bash" />
				<div class="grid gap-2 sm:grid-cols-2">
					{#each sdkLinks as link (link.title)}
						<a href={link.href} target="_blank" rel="noopener noreferrer" class="doc-card hover:border-accent/20 hover:text-text">
							<div class="flex items-center justify-between gap-3">
								<h4 class="text-sm font-medium text-text">{link.title}</h4>
								<svg class="h-3.5 w-3.5 shrink-0 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H18m0 0v4.5M18 6l-7.5 7.5M6 10.5v7.5h7.5" />
								</svg>
							</div>
							<p class="mt-2 text-[12px] leading-relaxed text-text-muted">{link.desc}</p>
						</a>
					{/each}
				</div>
			</div>

			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<h3 class="text-sm font-medium text-text">Prerequisites</h3>
				<div class="space-y-3">
					{#each prerequisites as item (item.title)}
						<div class="rounded-lg border border-border/70 bg-surface-raised px-4 py-3">
							<p class="text-sm font-medium text-text">{item.title}</p>
							<p class="mt-1 text-[12px] leading-relaxed text-text-muted">{item.desc}</p>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="grid gap-4 lg:grid-cols-[0.8fr,1.2fr]">
			<div class="rounded-xl border border-border bg-surface p-5">
				<h3 class="text-sm font-medium text-text">Five-step flow</h3>
				<ol class="mt-4 space-y-3">
					{#each sdkChecklist as item, index (item)}
						<li class="flex items-start gap-3">
							<span class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/6 text-[10px] font-semibold text-accent">{index + 1}</span>
							<p class="text-[13px] leading-relaxed text-text-muted">{item}</p>
						</li>
					{/each}
				</ol>
			</div>

			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<div class="flex items-center justify-between gap-3">
					<h3 class="text-sm font-medium text-text">Minimal register example</h3>
					<button type="button" class="copy-btn" onclick={() => copyText('sdk:quickstart', sdkQuickStart)}>
						{#if copiedKey === 'sdk:quickstart'}Copied{:else}Copy{/if}
					</button>
				</div>
				<CodeBlock code={sdkQuickStart} lang="ts" />
			</div>
		</div>
	</section>

	<section class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-medium text-text">Registration Flow</h2>
			<button type="button" class="copy-btn" onclick={() => copyText('sdk:flow', registrationFlowDiagram)}>
				{#if copiedKey === 'sdk:flow'}Copied{:else}Copy diagram{/if}
			</button>
		</div>
		<p class="text-sm text-text-muted">
			The diagram below shows the happy path from local script or browser app to on-chain registration and indexed discovery.
		</p>
		<CodeBlock code={registrationFlowDiagram} lang="text" />
	</section>

	<section class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-lg font-medium text-text">Example Register Script</h2>
				<p class="mt-1 text-sm text-text-muted">
					Save as <code class="rounded bg-surface-raised px-1.5 py-0.5 text-[11px] font-mono">register.ts</code> and run <code class="rounded bg-surface-raised px-1.5 py-0.5 text-[11px] font-mono">npx tsx register.ts</code>.
				</p>
			</div>
			<button type="button" class="copy-btn" onclick={() => copyText('sdk:script', registerScript)}>
				{#if copiedKey === 'sdk:script'}Copied{:else}Copy script{/if}
			</button>
		</div>
		<CodeBlock code={registerScript} lang="ts" />
	</section>

	<section class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-medium text-text">API Client Examples</h2>
			<button type="button" class="copy-btn" onclick={() => copyText('sdk:api', apiClientExample)}>
				{#if copiedKey === 'sdk:api'}Copied{:else}Copy example{/if}
			</button>
		</div>
		<div class="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<CodeBlock code={apiClientExample} lang="ts" />
			</div>
			<div class="rounded-xl border border-border bg-surface p-5 space-y-4">
				<h3 class="text-sm font-medium text-text">Browser and CORS notes</h3>
				<ul class="space-y-3 text-[13px] leading-relaxed text-text-muted">
					<li>ExplorerClient wraps the same public GET endpoints documented above, so it works anywhere <code class="rounded bg-surface-raised px-1.5 py-0.5 text-[11px] font-mono">fetch</code> is available.</li>
					<li>For browser apps, point it at <code class="rounded bg-surface-raised px-1.5 py-0.5 text-[11px] font-mono">https://stellar8004.com</code> for direct public reads.</li>
					<li>If your own mirror or proxy tightens cross-origin rules, call the explorer from your backend instead and keep the client code unchanged.</li>
					<li>Writes still go through <code class="rounded bg-surface-raised px-1.5 py-0.5 text-[11px] font-mono">SorobanClient</code>, which signs locally and submits directly to Soroban RPC.</li>
				</ul>
			</div>
		</div>
	</section>

	<section class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-medium text-text">Response Format</h2>
			<button type="button" class="copy-btn" onclick={() => copyText('rest:response', responseFormatExample)}>
				{#if copiedKey === 'rest:response'}Copied{:else}Copy schema{/if}
			</button>
		</div>
		<CodeBlock code={responseFormatExample} lang="json" />
	</section>

	<section class="space-y-4">
		<h2 class="text-lg font-medium text-text">Rate Limits</h2>
		<div class="rounded-lg border border-border bg-surface p-4">
			<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<span class="text-sm text-text">Anonymous</span>
				<code class="font-mono text-sm text-accent">30 req/min</code>
				<span class="text-xs text-text-dim">IP-based, best-effort</span>
			</div>
		</div>
	</section>

	<section class="space-y-4">
		<h2 class="text-lg font-medium text-text">Error Responses</h2>

		<div class="hidden overflow-x-auto rounded-lg border border-border bg-surface sm:block">
			<table class="min-w-full text-sm">
				<thead class="bg-surface-raised text-left text-xs tracking-[0.12em] text-text-dim uppercase">
					<tr>
						<th class="px-4 py-3 font-medium">Code</th>
						<th class="px-4 py-3 font-medium">HTTP</th>
						<th class="px-4 py-3 font-medium">Description</th>
					</tr>
				</thead>
				<tbody>
					<tr class="border-t border-border">
						<td class="px-4 py-3 font-mono text-xs">INVALID_PARAMS</td>
						<td class="px-4 py-3">400</td>
						<td class="px-4 py-3 text-text-muted">Missing or invalid query parameters</td>
					</tr>
					<tr class="border-t border-border">
						<td class="px-4 py-3 font-mono text-xs">NOT_FOUND</td>
						<td class="px-4 py-3">404</td>
						<td class="px-4 py-3 text-text-muted">Agent or endpoint not found</td>
					</tr>
					<tr class="border-t border-border">
						<td class="px-4 py-3 font-mono text-xs">RATE_LIMITED</td>
						<td class="px-4 py-3">429</td>
						<td class="px-4 py-3 text-text-muted">Too many requests — try again later</td>
					</tr>
					<tr class="border-t border-border">
						<td class="px-4 py-3 font-mono text-xs">INTERNAL_ERROR</td>
						<td class="px-4 py-3">500</td>
						<td class="px-4 py-3 text-text-muted">Server error — retry with backoff</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div class="space-y-2 sm:hidden">
			{#each [
				{ code: 'INVALID_PARAMS', http: '400', desc: 'Missing or invalid query parameters' },
				{ code: 'NOT_FOUND', http: '404', desc: 'Agent or endpoint not found' },
				{ code: 'RATE_LIMITED', http: '429', desc: 'Too many requests — try again later' },
				{ code: 'INTERNAL_ERROR', http: '500', desc: 'Server error — retry with backoff' }
			] as err (err.code)}
				<div class="rounded-lg border border-border bg-surface p-3 space-y-1">
					<div class="flex items-center gap-2">
						<span class="rounded bg-negative/6 px-1.5 py-0.5 font-mono text-[10px] text-negative">{err.http}</span>
						<code class="font-mono text-[11px] text-text">{err.code}</code>
					</div>
					<p class="text-[12px] text-text-muted">{err.desc}</p>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.skill-card,
	.doc-card {
		padding: 16px;
		border-radius: 10px;
		border: 0.5px solid var(--color-border);
		background: var(--color-surface-raised);
		transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
	}

	.skill-card:hover,
	.doc-card:hover {
		border-color: color-mix(in oklch, var(--color-accent) 30%, transparent);
		box-shadow: 0 0 20px color-mix(in oklch, var(--color-accent) 6%, transparent);
		transform: translateY(-1px);
	}

	.install-cmd {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		margin-top: 12px;
		padding: 8px 10px;
		border-radius: 7px;
		border: 0.5px solid var(--color-border);
		background: var(--color-surface);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 10px;
		color: var(--color-text-muted);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.install-cmd:hover {
		border-color: color-mix(in oklch, var(--color-accent) 30%, transparent);
		color: var(--color-text);
	}

	.copy-btn {
		border-radius: 999px;
		border: 0.5px solid color-mix(in oklch, var(--color-accent) 18%, var(--color-border));
		background: color-mix(in oklch, var(--color-accent) 4%, var(--color-surface));
		padding: 6px 10px;
		font-size: 11px;
		font-weight: 600;
		color: var(--color-accent);
		transition: border-color 0.15s, background 0.15s, color 0.15s;
	}

	.copy-btn:hover {
		border-color: color-mix(in oklch, var(--color-accent) 35%, transparent);
		background: color-mix(in oklch, var(--color-accent) 8%, var(--color-surface));
	}
</style>
