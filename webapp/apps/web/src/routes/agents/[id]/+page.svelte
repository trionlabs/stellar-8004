<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { getClients } from '$lib/sdk-client.js';
	import { validateAgentUri } from '@trionlabs/8004-sdk';
	import { wallet } from '$lib/wallet.svelte.js';
	import { explorerTxUrl } from '$lib/explorer.js';
	import { scoreFormatter, dateFormatter, dateTimeFormatter, shortAddress, sanitizeImageUrl, TRUST_DESCRIPTIONS } from '$lib/formatters.js';
	import FeedbackForm from '$lib/components/FeedbackForm.svelte';
	import ScoreBreakdown from '$lib/components/ScoreBreakdown.svelte';
	import EvidenceViewer from '$lib/components/EvidenceViewer.svelte';
	import StarIdenticon from '$lib/components/StarIdenticon.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import TryAgentPanel from '$lib/components/TryAgent/TryAgentPanel.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// --- Polling for transitional states ---
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let pollCount = $state(0);
	const MAX_POLLS = 18; // 18 x 10s = 3 minutes
	const pollTimedOut = $derived(data.state === 'indexing' && pollCount >= MAX_POLLS);

	onMount(() => {
		if (data.state === 'indexing' || data.state === 'resolving') {
			pollTimer = setInterval(() => {
				pollCount++;
				if (pollCount >= MAX_POLLS) {
					clearInterval(pollTimer!);
					pollTimer = null;
					return;
				}
				invalidateAll();
			}, 10_000);
		}

		return () => {
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
		};
	});

	$effect(() => {
		if (data.state !== 'indexing' && data.state !== 'resolving') {
			if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
		}
	});

	// --- URI update ---
	let showUriEditor = $state(false);
	let newUri = $state('');
	let uriUpdateStatus = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let uriUpdateError = $state('');

	async function submitUriUpdate() {
		if (!newUri.trim()) return;
		const caller = wallet.address;
		if (!caller) {
			uriUpdateError = 'Wallet disconnected. Reconnect and try again.';
			uriUpdateStatus = 'error';
			return;
		}
		uriUpdateStatus = 'submitting';
		uriUpdateError = '';
		try {
			validateAgentUri(newUri.trim());
			const { identity } = getClients();
			const tx = await identity.set_agent_uri({
				caller,
				agent_id: data.agent.id,
				new_uri: newUri.trim(),
			});
			await tx.signAndSend();
			uriUpdateStatus = 'success';
			setTimeout(() => {
				showUriEditor = false;
				uriUpdateStatus = 'idle';
			}, 1500);
			invalidateAll();
		} catch (err) {
			uriUpdateError = err instanceof Error ? err.message : 'Update failed';
			uriUpdateStatus = 'error';
		}
	}

	const showTryPanel = $derived(
		data.agent.x402Enabled && data.agent.services.length > 0 && data.state === 'ready'
	);

	const tabs = [
		{ id: 'metadata', label: 'Metadata' },
		{ id: 'reputation', label: 'Reputation' }
	] as const;

	type TabId = 'metadata' | 'reputation';

	let activeTab = $state<TabId>('reputation');

	const TAG_FILTER_OPTIONS = [
		{ value: '', label: 'All' },
		{ value: 'starred', label: 'General' },
		{ value: 'uptime', label: 'Uptime' },
		{ value: 'reachable', label: 'Reachable' },
		{ value: 'successRate', label: 'Success Rate' },
		{ value: 'responseTime', label: 'Response Time' }
	] as const;

	const isOwner = $derived.by(
		() => wallet.address?.toUpperCase() === data.agent.owner.toUpperCase()
	);

	const PROTOCOL_ICONS: Record<string, string> = {
		MCP: 'M',
		A2A: 'A',
		Web: 'W'
	};

	let copySuccess = $state<string | null>(null);

	async function copyToClipboard(text: string) {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(text);
		copySuccess = text;
		setTimeout(() => { copySuccess = null; }, 1500);
	}
</script>

<svelte:head>
	<title>{data.agent.name} | Stellar8004</title>
	<meta
		name="description"
		content="Inspect on-chain metadata, feedback, and aggregate trust scores for a 8004 for Stellar agent."
	/>
</svelte:head>

{#if data.state === 'indexing'}
	<!-- Full-page indexing UI -->
	<div class="mx-auto max-w-lg space-y-8 py-12">
		<div class="rounded-2xl border border-border bg-surface-raised/40 p-8 text-center space-y-6">
			{#if !pollTimedOut}
				<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/12 bg-accent/4">
					<svg class="h-8 w-8 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
						<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
						<path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
				</div>
				<div class="space-y-2">
					<h1 class="text-xl font-light text-text">Indexing Agent #{data.agent.id}</h1>
					<p class="text-sm text-text-muted">
						Your registration was confirmed on Stellar. The indexer scans for new agents every 60 seconds.
					</p>
				</div>
				<div class="flex items-center justify-center gap-2 text-xs text-text-dim">
					<span class="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"></span>
					Waiting for indexer...
				</div>
			{:else}
				<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-warning/12 bg-warning/5">
					<svg class="h-8 w-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
				</div>
				<div class="space-y-2">
					<h1 class="text-xl font-light text-text">Indexer hasn't caught up yet</h1>
					<p class="text-sm text-text-muted">
						This can happen during high network load. Try refreshing the page, or check the transaction on Stellar Explorer.
					</p>
				</div>
			{/if}

			{#if data.txHash}
				<div class="rounded-lg border border-border bg-surface p-3">
					<p class="text-[10px] text-text-dim uppercase tracking-wider">Transaction</p>
					<a
						href={explorerTxUrl(data.txHash)}
						target="_blank"
						rel="noopener noreferrer"
						class="mt-1 block font-mono text-xs text-accent hover:underline break-all"
					>{data.txHash}</a>
				</div>
			{/if}

			<div class="flex flex-wrap justify-center gap-3 pt-2">
				<a href={resolve('/register')}
					class="text-xs text-text-muted hover:text-accent transition">
					Register another agent
				</a>
				{#if wallet.connected}
					<span class="text-text-dim">-</span>
					<a href={resolve('/agents') + `?owner=${wallet.address}`}
						class="text-xs text-text-muted hover:text-accent transition">
						My agents
					</a>
				{/if}
			</div>
		</div>
	</div>
{:else}
<div class="space-y-10">
	{#if data.justRegistered && data.state === 'ready'}
		<div class="flex items-center justify-between rounded-xl border border-positive/12 bg-positive/4 px-4 py-3">
			<div class="flex items-center gap-2">
				<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
				<p class="text-sm text-positive">Agent registered</p>
			</div>
			<div class="flex items-center gap-3 text-xs">
				<a href={resolve('/register')} class="text-text-muted hover:text-text transition">Register another</a>
				{#if wallet.connected}
					<a href={resolve('/agents') + `?owner=${wallet.address}`} class="text-accent hover:text-text transition">My agents</a>
				{/if}
			</div>
		</div>
	{/if}
	<!-- State banners -->
	{#if data.state === 'resolving'}
		<div class="flex items-center gap-3 rounded-xl border border-accent/15 bg-accent/4 px-4 py-3">
			<svg class="h-4 w-4 shrink-0 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
				<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
				<path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
			<p class="text-sm text-accent">Resolving metadata from agent URI. This usually takes under a minute.</p>
		</div>
	{:else if data.state === 'failed'}
		<div class="flex items-start gap-3 rounded-xl border border-warning/15 bg-warning/5 px-4 py-3">
			<svg class="mt-0.5 h-4 w-4 shrink-0 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<div class="flex-1 space-y-1">
				<p class="text-sm font-medium text-warning">Metadata resolution failed</p>
				<p class="text-xs text-text-muted">
					<span class="font-mono">{data.agent.agentUri}</span> could not be resolved after {data.uriResolveAttempts} attempts.
					Verify the URL is accessible and returns valid JSON.
				</p>
				{#if wallet.connected && isOwner}
					<button onclick={() => { showUriEditor = true; newUri = data.agent.agentUri ?? ''; }}
						class="mt-2 rounded-lg bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning transition hover:bg-warning/15">
						Update URI
					</button>
				{/if}
			</div>
		</div>
	{:else if data.state === 'no-uri'}
		<div class="flex items-center gap-3 rounded-xl border border-border bg-surface-raised/40 px-4 py-3">
			<svg class="h-4 w-4 shrink-0 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
			</svg>
			<p class="text-sm text-text-muted">
				This agent was registered without a metadata URI. Name, description, and services can be set by updating the agent URI on-chain.
			</p>
		</div>
	{/if}

	{#if showUriEditor}
		<div class="rounded-xl border border-border bg-surface p-4 space-y-3">
			<label class="text-xs font-medium text-text-muted" for="new-uri">New Metadata URI</label>
			<input id="new-uri" type="text" bind:value={newUri}
				placeholder="https://... or ipfs://..."
				class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none" />
			<div class="flex items-center gap-2">
				<button onclick={submitUriUpdate}
					disabled={uriUpdateStatus === 'submitting' || !newUri.trim()}
					class="rounded-lg border border-accent/30 bg-accent-fill px-4 py-2 text-sm text-accent disabled:opacity-50 hover:bg-accent-fill-hover hover:border-accent/45 transition-colors">
					{#if uriUpdateStatus === 'submitting'}
						Submitting...
					{:else}
						Update URI
					{/if}
				</button>
				<button onclick={() => { showUriEditor = false; uriUpdateStatus = 'idle'; }}
					class="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-raised">
					Cancel
				</button>
				{#if uriUpdateStatus === 'success'}
					<span class="text-xs text-positive">URI updated - waiting for indexer to re-resolve...</span>
				{/if}
			</div>
			{#if uriUpdateStatus === 'error'}
				<p class="text-xs text-negative">{uriUpdateError}</p>
			{/if}
		</div>
	{/if}

	<!-- Compact Hero: identity + inline trust signals -->
	<section class="space-y-4 reveal">
		<div class="flex items-start gap-4">
			<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-surface-raised/50">
				{#if data.agent.image}
					<img src={sanitizeImageUrl(data.agent.image)} alt="" class="h-full w-full object-cover" />
				{:else}
					<StarIdenticon seed={String(data.agent.id)} size={56} />
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-3">
					<h1 class="truncate text-xl font-light tracking-tight text-text">{data.agent.name}</h1>
					{#if data.scores?.totalScore != null}
						<Tooltip text={`Rank #${data.scores.rank ?? '?'} of ${data.scores.totalAgents ?? '?'} agents`}>
							<span class="shrink-0 rounded-full border border-positive/20 bg-positive/5 px-2 py-0.5 text-xs font-medium tabular-nums text-positive">
								{scoreFormatter.format(data.scores.totalScore)}
							</span>
						</Tooltip>
					{/if}
					{#if data.scores && data.scores.feedbackCount > 0}
						<span class="shrink-0 text-[11px] tabular-nums text-text-dim">
							{data.scores.feedbackCount} review{data.scores.feedbackCount !== 1 ? 's' : ''}
						</span>
					{/if}
				</div>
				<div class="mt-1 flex items-center gap-2 text-[11px]">
					<Tooltip text={copySuccess === data.agent.owner ? 'Copied!' : data.agent.owner}>
						<button type="button" onclick={() => copyToClipboard(data.agent.owner)} class="font-mono text-text-dim/50 transition hover:text-text-muted cursor-pointer">
							{shortAddress(data.agent.owner)}
						</button>
					</Tooltip>
					<span class="text-text-dim/25">-</span>
					<span class="text-text-dim/50">{dateFormatter.format(new Date(data.agent.createdAt))}</span>
					<span class="text-text-dim/25">-</span>
					<Tooltip text={copySuccess === String(data.agent.id) ? 'Copied!' : `Agent ID: ${data.agent.id}`}>
						<button type="button" onclick={() => copyToClipboard(String(data.agent.id))} class="text-accent/60 transition hover:text-accent cursor-pointer">
							#{data.agent.id}
						</button>
					</Tooltip>
				</div>
				{#if data.agent.description}
					<p class="mt-2 line-clamp-2 text-sm leading-relaxed text-text-muted">{data.agent.description}</p>
				{/if}
				{#if data.agent.supportedTrust.length > 0 || data.agent.x402Enabled}
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#each data.agent.supportedTrust as trust}
							<Tooltip text={TRUST_DESCRIPTIONS[trust] ?? trust}>
							<span class="rounded-full border border-positive/15 bg-positive/4 px-2 py-0.5 text-[10px] text-positive">{trust}</span>
							</Tooltip>
						{/each}
						{#if data.agent.x402Enabled}
							<Tooltip text="Accepts x402 micropayments">
							<span class="rounded-full border border-accent/15 bg-accent/4 px-2 py-0.5 text-[10px] text-accent">x402</span>
							</Tooltip>
						{/if}
					</div>
				{/if}
			</div>
			{#if wallet.connected && isOwner && (data.state === 'ready' || data.state === 'no-uri' || data.state === 'failed')}
				<a href={resolve(`/agents/${data.agent.id}/edit`)}
					class="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-fill-hover px-3 py-1.5
					       border border-accent/25 text-xs font-medium text-accent
					       hover:border-accent/40 transition-all">
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round"
							d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
					</svg>
					Edit
				</a>
			{/if}
		</div>
	</section>

	<!-- Trust stats — compact horizontal bar -->
	<section class="reveal reveal-d1">
		<div class="stat-row grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border/30">
			<div class="stat-cell px-4 py-3" title="Aggregate trust score from feedback and volume">
				<p class="text-[10px] tracking-wide text-text-dim/50 uppercase">Score</p>
				<p class="mt-1 text-lg font-light tabular-nums text-positive">
					{#if data.scores?.totalScore != null}
						{scoreFormatter.format(data.scores.totalScore)}
					{:else}
						<span class="text-text-dim/30">--</span>
					{/if}
				</p>
				{#if data.scores?.rank != null}
					<p class="mt-0.5 text-[10px] text-text-dim/40">
						#{data.scores.rank}{data.scores.totalAgents ? ` / ${data.scores.totalAgents}` : ''}
					</p>
				{/if}
			</div>
			<div class="stat-cell px-4 py-3" title="Total feedback submissions from clients">
				<p class="text-[10px] tracking-wide text-text-dim/50 uppercase">Feedback</p>
				<p class="mt-1 text-lg font-light tabular-nums text-text">{data.scores?.feedbackCount ?? 0}</p>
				{#if data.scores && data.scores.feedbackCount > 0}
					<p class="mt-0.5 text-[10px] text-text-dim/40">
						{data.scores.uniqueClients} client{data.scores.uniqueClients !== 1 ? 's' : ''}
					</p>
				{/if}
				{#if data.recentFeedbackCount > 0}
					<p class="mt-0.5 text-[10px] text-accent/50">{data.recentFeedbackCount} in 7d</p>
				{/if}
			</div>
			<div class="stat-cell px-4 py-3" title={data.metadataMissing.length > 0 ? `Missing: ${data.metadataMissing.join(', ')}` : 'All metadata fields complete'}>
				<p class="text-[10px] tracking-wide text-text-dim/50 uppercase">Metadata</p>
				<p class="mt-1 text-lg font-light tabular-nums {data.metadataCompleteness >= 80 ? 'text-positive' : data.metadataCompleteness >= 40 ? 'text-warning' : 'text-negative'}">
					{data.metadataCompleteness}%
				</p>
			</div>
		</div>
		{#if data.scores}
			<div class="mt-3">
				<ScoreBreakdown
					feedbackCount={data.scores.feedbackCount ?? 0}
					totalScore={data.scores.totalScore ?? 0}
				/>
			</div>
		{/if}
	</section>

	<!-- TRY PANEL — after stats -->
	{#if showTryPanel}
		<section class="reveal reveal-d2">
			<TryAgentPanel
				services={data.agent.services}
				x402Enabled={data.agent.x402Enabled}
				autoOpen={true}
			/>
		</section>
	{/if}

	<!-- Tabs -->
	<section>
		<nav class="flex gap-1 border-b border-border/30 pb-px">
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					onclick={() => (activeTab = tab.id)}
					class="relative px-3 py-2 text-[13px] transition {activeTab === tab.id ? 'text-accent' : 'text-text-dim hover:text-text-muted'}"
				>
					{tab.label}
					{#if activeTab === tab.id}
						<span class="absolute inset-x-0 -bottom-px h-px bg-accent/60"></span>
					{/if}
				</button>
			{/each}
		</nav>
	</section>

	{#if activeTab === 'metadata'}
		{#if data.agent.services.length > 0}
			<section class="space-y-4">
				<div>
					<h2 class="text-sm font-medium text-text">Services</h2>
					<p class="mt-1 text-xs text-text-dim">Endpoints exposed by this agent</p>
				</div>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each data.agent.services as service}
						<div class="rounded-lg border border-border bg-surface p-4 space-y-2.5">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span class="flex h-7 w-7 items-center justify-center rounded-md border border-accent/20 bg-accent/5 text-xs font-medium text-accent">
										{PROTOCOL_ICONS[service.name] ?? service.name.charAt(0)}
									</span>
									<span class="text-sm font-medium text-text">{service.name}</span>
								</div>
								{#if service.version}
									<span class="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[10px] text-text-dim">
										v{service.version}
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-1.5">
								<p class="min-w-0 flex-1 truncate font-mono text-[11px] text-text-muted">{service.endpoint}</p>
								<button
									type="button"
									onclick={() => copyToClipboard(service.endpoint)}
									class="shrink-0 rounded-md border border-border bg-surface-raised p-1 text-text-dim transition hover:text-text"
									title="Copy endpoint URL"
								>
									{#if copySuccess === service.endpoint}
										<svg class="h-3.5 w-3.5 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
									{:else}
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
									{/if}
								</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{:else}
			<section>
				<div class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-dim">
					{#if data.state === 'resolving'}
						Services will appear after metadata is resolved from the agent URI.
					{:else if data.state === 'failed'}
						Service discovery requires a valid metadata URI.
					{:else}
						No services registered
					{/if}
				</div>
			</section>
		{/if}

		<section class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
			<div class="space-y-4">
				<div>
					<h2 class="text-sm font-medium text-text">On-chain Metadata</h2>
					<p class="mt-1 text-xs text-text-dim">Additional key-value entries indexed for this agent</p>
				</div>

				{#if data.metadata.length > 0}
					<div class="overflow-hidden rounded-lg border border-border bg-surface">
						{#each data.metadata as entry (entry.key)}
							<div class="flex border-t border-border px-4 py-3 text-xs font-mono">
								<span class="w-40 shrink-0 text-accent">{entry.key}</span>
								<span class="text-text-muted">{entry.value ?? ''}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-dim">
						No extra metadata indexed
					</div>
				{/if}
			</div>

			<div class="space-y-4">
				<div>
					<h2 class="text-sm font-medium text-text">Registration Payload</h2>
					<p class="mt-1 text-xs text-text-dim">Decoded agent_uri_data payload</p>
				</div>

				{#if data.agent.agentUri}
					<div class="rounded-lg border border-border bg-surface p-4">
						<p class="text-xs text-text-dim">Agent URI</p>
						<p class="mt-1.5 break-all font-mono text-xs text-text-muted">{data.agent.agentUri}</p>
					</div>
				{/if}

				{#if data.agent.registrationData}
					<pre
						class="overflow-auto rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-text-muted">{data
							.agent.registrationData}</pre>
				{:else}
					<div class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-dim">
						No structured registration payload
					</div>
				{/if}
			</div>
		</section>
	{:else if activeTab === 'reputation'}
		<section class="space-y-6">
			<!-- Give Feedback -->
			{#if wallet.connected}
				{#if isOwner}
					<div class="rounded-lg border border-border/40 bg-surface-raised/30 px-4 py-3">
						<p class="text-sm text-text-dim">You cannot give feedback to your own agent.</p>
					</div>
				{:else}
					<FeedbackForm agentId={data.agent.id} />
				{/if}
			{:else}
				<FeedbackForm agentId={data.agent.id} />
			{/if}

			<!-- Tag filter pills -->
			<div class="flex items-center gap-2">
				<span class="text-[11px] text-text-dim/50 uppercase tracking-wider">Filter</span>
				<div class="flex flex-wrap gap-1.5">
					{#each TAG_FILTER_OPTIONS as tag}
						<button
							type="button"
							onclick={() => {
								const url = new URL(window.location.href);
								if (tag.value) {
									url.searchParams.set('tag', tag.value);
								} else {
									url.searchParams.delete('tag');
								}
								goto(url.toString(), { replaceState: true, invalidateAll: true });
							}}
							class="rounded-md px-2.5 py-1 text-[11px] transition
								{data.tag === tag.value
									? 'bg-accent/10 text-accent border border-accent/25'
									: 'text-text-dim hover:text-text-muted border border-transparent hover:border-border/40'}"
						>
							{tag.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Feedback cards -->
			<div class="space-y-2">
				{#if data.feedback.length > 0}
					{#each data.feedback as feedback (feedback.id)}
						<div class="feedback-card" class:feedback-card--revoked={feedback.isRevoked}>
							<!-- Score -->
							<div class="feedback-card__score {feedback.score >= 60 ? 'text-positive' : feedback.score >= 30 ? 'text-warning' : 'text-negative'}">
								{scoreFormatter.format(feedback.score)}
							</div>

							<!-- Main content -->
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="font-mono text-xs text-text-muted">{shortAddress(feedback.clientAddress)}</span>
									{#if feedback.tag1}
										<span class="rounded-md bg-accent/6 px-1.5 py-0.5 text-[10px] text-accent">{feedback.tag1}</span>
									{/if}
									{#if feedback.tag2}
										<span class="rounded-md bg-accent/6 px-1.5 py-0.5 text-[10px] text-accent">{feedback.tag2}</span>
									{/if}
									{#if feedback.isRevoked}
										<span class="rounded-md bg-negative/8 px-1.5 py-0.5 text-[10px] text-negative">Revoked</span>
									{/if}
								</div>

								<div class="mt-1 flex items-center gap-3 text-[11px] text-text-dim/50">
									<span>{dateTimeFormatter.format(new Date(feedback.createdAt))}</span>
									{#if feedback.responses.length > 0}
										<span>{feedback.responses.length} response{feedback.responses.length !== 1 ? 's' : ''}</span>
									{/if}
								</div>

								<!-- Evidence (inline) -->
								<EvidenceViewer
									feedbackUri={feedback.feedbackUri}
									feedbackHash={feedback.feedbackHash}
								/>
							</div>
						</div>
					{/each}
				{:else}
					<div class="rounded-lg border border-dashed border-border/40 px-4 py-8 text-center text-sm text-text-dim">
						{#if data.state === 'resolving'}
							Reputation entries will appear after clients submit feedback.
						{:else}
							No feedback submitted yet.
						{/if}
					</div>
				{/if}
			</div>

			<!-- Client breakdown (only if 3+ feedbacks) -->
			{#if data.clientBreakdown.length >= 2}
				<div class="space-y-3">
					<h3 class="text-[11px] text-text-dim/50 uppercase tracking-wider">By Client</h3>
					<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each data.clientBreakdown as client (client.clientAddress)}
							<div class="flex items-center gap-3 rounded-lg border border-border/30 bg-surface px-3 py-2.5">
								<span class="text-sm font-medium tabular-nums text-positive">{scoreFormatter.format(client.avgScore)}</span>
								<div class="min-w-0 flex-1">
									<p class="truncate font-mono text-[11px] text-text-muted">{shortAddress(client.clientAddress)}</p>
									<p class="text-[10px] text-text-dim/40">{client.feedbackCount} review{client.feedbackCount !== 1 ? 's' : ''}</p>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	{/if}
</div>
{/if}

<style>
	.stat-row {
		background: var(--color-border-subtle);
	}
	.stat-cell {
		background: var(--color-surface-raised);
		transition: background 0.2s ease;
	}
	.stat-cell:hover {
		background: var(--color-surface-overlay);
	}

	/* Feedback cards */
	.feedback-card {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border, oklch(0.3 0 0 / 0.3));
		transition: border-color 0.15s;
	}
	.feedback-card:hover {
		border-color: color-mix(in oklch, var(--color-border) 100%, transparent);
	}
	.feedback-card--revoked {
		opacity: 0.45;
	}
	.feedback-card__score {
		font-size: 1.125rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		padding-top: 2px;
		min-width: 2.5rem;
		text-align: right;
		flex-shrink: 0;
	}
</style>
