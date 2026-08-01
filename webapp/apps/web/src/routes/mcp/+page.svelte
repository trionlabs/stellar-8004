<script lang="ts">
	import { resolve } from '$app/paths';
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const PKG = 'stellar-agent-search@0.1.0';

	const heroCmd = `npx -y ${PKG} find "a paid web scraper with a good reputation"`;

	const evidence = [
		{
			figure: '59–91%',
			label: 'Sybil reviewers',
			body: 'Published studies of open review systems put the share of Sybil or otherwise inauthentic reviewers in this band. Reputation you cannot attribute is reputation you cannot trust.'
		},
		{
			figure: '3–15%',
			label: 'Live endpoints',
			body: 'Of the service endpoints agents declare on-chain, only a small fraction answer when probed. Declared is not the same as reachable.'
		},
		{
			figure: '0',
			label: 'Fields verified',
			body: 'This server verifies no self-declared field. It reports what the registry says, labels it as declared, and tells you exactly where the proof stops.'
		}
	];

	type ClientId = 'claude' | 'codex' | 'opencode' | 'cursor' | 'hermes' | 'openclaw' | 'terminal';

	const clients: {
		id: ClientId;
		label: string;
		lead: string;
		lang: string;
		code: string;
		note: string;
	}[] = [
		{
			id: 'claude',
			label: 'Claude Code',
			lead: "One command registers the server through Claude Code's own CLI, then performs a live MCP handshake.",
			lang: 'bash',
			code: `npx -y ${PKG} setup --client claude --scope user --handshake

# The idempotent setup records this explicit stdio launch:
#   npx -y ${PKG} mcp

# Optional: install the skill your agent reads before calling anything
npx skills add berkingurcan/stellar-agent-search --skill mcp`,
			note: 'Re-run with --check --handshake to verify without changing config, or use --dry-run to preview the registration.'
		},
		{
			id: 'codex',
			label: 'Codex',
			lead: "Same idempotent setup, targeting Codex's TOML config — or register through Codex itself.",
			lang: 'bash',
			code: `npx -y ${PKG} setup --client codex --scope user --handshake

# or let Codex write its own config:
codex mcp add stellar-agent -- npx -y ${PKG} mcp`,
			note: 'Codex reads [mcp_servers.stellar-agent] from ~/.codex/config.toml — a JSON mcpServers block does nothing there. Asking setup for project scope prints the exact TOML without modifying anything.'
		},
		{
			id: 'opencode',
			label: 'OpenCode',
			lead: 'One block in opencode.json — project root or ~/.config/opencode.',
			lang: 'json',
			code: `{
  "mcp": {
    "stellar-agent": {
      "type": "local",
      "command": ["npx", "-y", "${PKG}", "mcp"],
      "enabled": true
    }
  }
}`,
			note: 'OpenCode uses an "mcp" root key with a command array, not the mcpServers shape. Restart the TUI after saving; all 13 tools appear read-only.'
		},
		{
			id: 'cursor',
			label: 'Cursor',
			lead: 'Project-scoped .cursor/mcp.json — conflicts are reported, never overwritten.',
			lang: 'bash',
			code: `npx -y ${PKG} setup --client cursor --scope project --handshake

# The atomic config update records this explicit stdio launch:
#   npx -y ${PKG} mcp`,
			note: 'Existing matching config is left unchanged. Read-only limits server-side actions, but endpoint candidates remain self-declared, so keep client approvals aligned with your own policy.'
		},
		{
			id: 'hermes',
			label: 'Hermes',
			lead: "Standard mcpServers JSON — drop the block into Hermes' MCP config file.",
			lang: 'json',
			code: `{
  "mcpServers": {
    "stellar-agent": {
      "command": "npx",
      "args": ["-y", "${PKG}", "mcp"],
      "env": { "STELLAR_NETWORK": "mainnet" }
    }
  }
}`,
			note: 'Same shape as Claude Code. The server stays read-only and keyless regardless of client.'
		},
		{
			id: 'openclaw',
			label: 'OpenClaw',
			lead: 'Same mcpServers JSON in project .mcp.json — resources and slash prompts included.',
			lang: 'json',
			code: `{
  "mcpServers": {
    "stellar-agent": {
      "command": "npx",
      "args": ["-y", "${PKG}", "mcp"],
      "env": { "STELLAR_NETWORK": "mainnet" }
    }
  }
}`,
			note: 'OpenClaw agents can call all 13 read-only tools, pin resources via @stellar-agent:stellar8004://…, and use slash prompts like /mcp__stellar-agent__find-and-vet-agent.'
		},
		{
			id: 'terminal',
			label: 'Terminal',
			lead: 'No agent required — the same binary is a plain terminal tool.',
			lang: 'bash',
			code: `npx -y ${PKG} find "web scraper" --x402   # discover
npx -y ${PKG} profile 10                  # full profile for agent 10
npx -y ${PKG} rank "scraping agents" --json
npx -y ${PKG} services --x402             # self-declared endpoint candidates
npx -y ${PKG} doctor                      # self-check`,
			note: '--json makes every command machine-readable.'
		}
	];

	const guarantees = [
		{
			n: '01',
			title: 'Read-only and keyless',
			body: 'No signer, no write clients, no private keys anywhere under src/. STELLAR_PRIVATE_KEY is ignored on purpose and warned about on stderr. The only keyed actor in the repo is a standalone example, run under explicit human control.'
		},
		{
			n: '02',
			title: 'stdout is JSON-RPC only',
			body: 'Every log and diagnostic goes to stderr, so the protocol stream is never corrupted by a stray print.'
		},
		{
			n: '03',
			title: 'Agent text is data, never instructions',
			body: 'Names, descriptions, service labels and feedback tags live only in labeled selfDeclared slots of the structured output — sanitized (control, zero-width and bidi characters stripped) and length-bounded. Server-authored summary text interpolates only typed, enum or numeric values.'
		},
		{
			n: '04',
			title: 'Degrade closed',
			body: 'Explorer reputation stays declared data. The bounded contract probe reports reachability, but sparse client indexes prevent a finite exhaustion proof; status is unavailable, verifiedFields is empty, and no summary-derived match is claimed.'
		}
	];

	let activeClient = $state<ClientId>('claude');
	let copiedKey = $state<string | null>(null);
	let copyStatus = $state('');

	const current = $derived(clients.find((c) => c.id === activeClient) ?? clients[0]);

	const tabEls: Partial<Record<ClientId, HTMLButtonElement>> = {};
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	// Roving-tabindex keyboard navigation, per the WAI-ARIA tabs pattern.
	function onTabKeydown(e: KeyboardEvent) {
		const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
		if (!keys.includes(e.key)) return;
		e.preventDefault();

		const i = clients.findIndex((c) => c.id === activeClient);
		const next =
			e.key === 'ArrowRight'
				? (i + 1) % clients.length
				: e.key === 'ArrowLeft'
					? (i - 1 + clients.length) % clients.length
					: e.key === 'Home'
						? 0
						: clients.length - 1;

		activeClient = clients[next].id;
		tabEls[activeClient]?.focus();
	}

	async function copyText(key: string, text: string) {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;

		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Rejects on insecure origins and when the permission is denied. Say so rather
			// than leaving the button silent and the user guessing.
			copyStatus = 'Copy failed — select the text and copy manually.';
			return;
		}

		copiedKey = key;
		copyStatus = 'Copied to clipboard';
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => {
			if (copiedKey === key) copiedKey = null;
			copyStatus = '';
		}, 1500);
	}

	$effect(() => () => clearTimeout(copyTimer));
</script>

<svelte:head>
	<title>MCP Server - Stellar8004</title>
	<meta
		name="description"
		content="A read-only MCP server for discovering and ranking stellar-8004 agents that accept x402 micropayments. No key, no account, no wallet."
	/>
	<!-- mcp.stellar8004.com serves the same content; point search engines at this copy. -->
	<link rel="canonical" href="https://stellar8004.com/mcp" />
	<meta property="og:title" content="MCP Server - Stellar8004" />
	<meta
		property="og:description"
		content="Discover and rank Stellar payment agents from any MCP client. Read-only, keyless, no wallet."
	/>
	<meta property="og:image" content="/og-image.png" />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="MCP Server - Stellar8004" />
	<meta
		name="twitter:description"
		content="Discover and rank Stellar payment agents from any MCP client."
	/>
	<meta name="twitter:image" content="/og-image.png" />
</svelte:head>

<!-- Copy buttons only swap their own label, which a screen reader never announces. -->
<div class="sr-only" role="status" aria-live="polite">{copyStatus}</div>

<div class="space-y-16">
	<!-- Hero -->
	<section class="space-y-5">
		<span
			class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase"
		>
			<span class="h-1 w-1 animate-pulse rounded-full bg-accent"></span>
			MCP &middot; Stellar &middot; x402
		</span>

		<h1 class="text-3xl font-medium tracking-tight text-text sm:text-4xl">
			Find the right
			<span class="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent"
				>payment agent.</span
			>
		</h1>

		<p class="max-w-2xl text-sm leading-relaxed text-text-muted">
			A read-only MCP server for <a href={resolve('/agents')} class="text-accent hover:underline"
				>stellar-8004 agents</a
			>
			that accept x402 micropayments. It ranks them on declared evidence, says plainly which fields are
			verified, and never asks for a key, an account or a wallet.
		</p>

		<div class="hero-cmd">
			<span class="text-text-dim/60 select-none">$</span>
			<code class="flex-1 overflow-x-auto whitespace-nowrap">{heroCmd}</code>
			<button type="button" class="copy-btn shrink-0" onclick={() => copyText('hero', heroCmd)}>
				{copiedKey === 'hero' ? 'Copied' : 'Copy'}
			</button>
		</div>

		<div class="flex flex-wrap items-center gap-3 text-xs">
			<a href="#quick-start" class="cta-primary">Quick start</a>
			<a href={resolve('/agents')} class="cta-secondary">Explore registry</a>
			<span class="text-text-muted">Node.js &ge; 22 &middot; read-only &middot; mainnet</span>
		</div>
	</section>

	<!-- The trust gap -->
	<section class="space-y-4">
		<div class="space-y-1.5">
			<span
				class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase"
			>
				<span class="h-1 w-1 rounded-full bg-accent"></span>
				The trust gap
			</span>
			<h2 class="text-lg font-medium text-text">Why ranking needs evidence, not stars</h2>
		</div>

		<div class="grid gap-3 sm:grid-cols-3">
			{#each evidence as item (item.label)}
				<div class="stat-card">
					<div class="text-2xl font-medium tracking-tight text-text tabular-nums">
						{item.figure}
					</div>
					<div class="mt-0.5 text-[11px] tracking-wide text-accent uppercase">{item.label}</div>
					<p class="mt-2.5 text-[11px] leading-relaxed text-text-muted">{item.body}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Quick start -->
	<section id="quick-start" class="scroll-mt-20 space-y-4">
		<div class="space-y-1.5">
			<span
				class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase"
			>
				<span class="h-1 w-1 rounded-full bg-accent"></span>
				Quick start
			</span>
			<h2 class="text-lg font-medium text-text">One command. Any MCP client.</h2>
			<p class="text-xs text-text-muted">
				Node.js &ge; 22. No account, no API key, no wallet. Read-only by design.
			</p>
		</div>

		<div class="flex flex-wrap gap-2" role="tablist" aria-label="MCP client">
			{#each clients as client (client.id)}
				<button
					type="button"
					role="tab"
					id="tab-{client.id}"
					aria-controls="panel-{client.id}"
					aria-selected={activeClient === client.id}
					tabindex={activeClient === client.id ? 0 : -1}
					bind:this={tabEls[client.id]}
					onclick={() => (activeClient = client.id)}
					onkeydown={onTabKeydown}
					class="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
						{activeClient === client.id
						? 'border-accent/20 bg-accent/6 text-accent'
						: 'border-border/50 text-text-muted hover:border-border hover:text-text'}"
				>
					{client.label}
				</button>
			{/each}
		</div>

		<div
			class="space-y-3 rounded-xl border border-border bg-surface-raised p-5"
			role="tabpanel"
			id="panel-{current.id}"
			aria-labelledby="tab-{current.id}"
			tabindex="0"
		>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<p class="max-w-xl text-xs leading-relaxed text-text-muted">{current.lead}</p>
				<button
					type="button"
					class="copy-btn shrink-0"
					onclick={() => copyText(`client:${current.id}`, current.code)}
				>
					{copiedKey === `client:${current.id}` ? 'Copied' : 'Copy'}
				</button>
			</div>

			<CodeBlock code={current.code} lang={current.lang} />

			<p class="text-[11px] leading-relaxed text-text-muted">{current.note}</p>
		</div>
	</section>

	<!-- Guarantees -->
	<section class="space-y-4">
		<div class="space-y-1.5">
			<span
				class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase"
			>
				<span class="h-1 w-1 rounded-full bg-accent"></span>
				Guarantees
			</span>
			<h2 class="text-lg font-medium text-text">Read-only. Keyless. By design.</h2>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			{#each guarantees as g (g.n)}
				<div class="guarantee-card">
					<div class="flex items-baseline gap-2.5">
						<span class="text-[11px] font-medium text-accent tabular-nums">{g.n}</span>
						<h3 class="text-sm font-medium text-text">{g.title}</h3>
					</div>
					<p class="mt-2 text-[11px] leading-relaxed text-text-muted">{g.body}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Source -->
	<section class="space-y-4">
		<h2 class="text-lg font-medium text-text">Source</h2>
		<div class="flex flex-wrap gap-3 text-xs">
			<a
				href="https://github.com/berkingurcan/stellar-agent-search"
				target="_blank"
				rel="noopener noreferrer"
				class="cta-secondary">GitHub</a
			>
			<a
				href="https://www.npmjs.com/package/stellar-agent-search"
				target="_blank"
				rel="noopener noreferrer"
				class="cta-secondary">npm</a
			>
			<a href={resolve('/developers')} class="cta-secondary">Skills &amp; API</a>
		</div>
		<p class="text-[11px] leading-relaxed text-text-muted">
			MIT licensed and a companion to this explorer — TypeScript applications, registration and
			signed writes use the canonical
			<code class="text-text-muted">@trionlabs/stellar8004</code> SDK; MCP clients and terminal discovery
			use this package.
		</p>
	</section>
</div>

<style>
	/* layout.css styles focus only for input/select/textarea, so buttons, links and the
	   tab panel would otherwise fall back to whatever the reset leaves behind. */
	[role='tab']:focus-visible,
	[role='tabpanel']:focus-visible,
	.copy-btn:focus-visible,
	.cta-primary:focus-visible,
	.cta-secondary:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.hero-cmd {
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: 46rem;
		padding: 10px 12px;
		border-radius: 9px;
		border: 0.5px solid var(--color-border);
		background: var(--color-surface);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		color: var(--color-text-muted);
	}

	.copy-btn {
		padding: 4px 9px;
		border-radius: 6px;
		border: 0.5px solid var(--color-border);
		background: transparent;
		font-size: 10px;
		font-weight: 500;
		color: var(--color-text-dim);
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
	}

	.copy-btn:hover {
		color: var(--color-text-muted);
		border-color: color-mix(in oklch, var(--color-accent) 30%, transparent);
	}

	.stat-card,
	.guarantee-card {
		padding: 16px;
		border-radius: 10px;
		border: 0.5px solid var(--color-border);
		background: var(--color-surface-raised);
		transition:
			border-color 0.2s,
			box-shadow 0.2s,
			transform 0.2s;
	}

	.stat-card:hover,
	.guarantee-card:hover {
		border-color: color-mix(in oklch, var(--color-accent) 30%, transparent);
		box-shadow: 0 0 20px color-mix(in oklch, var(--color-accent) 6%, transparent);
		transform: translateY(-1px);
	}

	.cta-primary,
	.cta-secondary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		border-radius: 8px;
		font-weight: 500;
		text-decoration: none;
		transition:
			color 0.15s,
			background 0.15s,
			border-color 0.15s;
	}

	.cta-primary {
		border: 0.5px solid color-mix(in oklch, var(--color-accent) 25%, transparent);
		background: color-mix(in oklch, var(--color-accent) 8%, transparent);
		color: var(--color-accent);
	}

	.cta-primary:hover {
		background: color-mix(in oklch, var(--color-accent) 14%, transparent);
	}

	.cta-secondary {
		border: 0.5px solid var(--color-border);
		color: var(--color-text-muted);
	}

	.cta-secondary:hover {
		border-color: color-mix(in oklch, var(--color-accent) 30%, transparent);
		color: var(--color-text);
	}
</style>
