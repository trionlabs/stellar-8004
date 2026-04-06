<script lang="ts">
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
	<div class="space-y-4">
		<span class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase">
			<span class="h-1 w-1 rounded-full bg-accent"></span>
			API v1
		</span>
		<h1 class="text-3xl font-light tracking-tight text-text">Developer Portal</h1>
		<p class="text-sm text-text-muted">
			Public REST API for the 8004 Agent Trust Protocol on Stellar.
			No authentication required — read-only access to all indexed agent data.
		</p>
	</div>

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
						<td class="px-6 py-3 font-mono text-text">10 req/min</td>
						<td class="px-6 py-3 text-text-muted">IP-based, best-effort</td>
					</tr>
				</tbody>
			</table>
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
					class="rounded-xl border px-4 py-2 text-xs font-medium transition-colors
						{activeLang === lang.id
							? 'border-accent bg-accent/8 text-accent'
							: 'border-border text-text-muted hover:bg-surface-raised'}"
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
