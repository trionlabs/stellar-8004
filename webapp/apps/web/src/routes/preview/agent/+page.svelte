<script lang="ts">
	import { scoreFormatter, dateFormatter, dateTimeFormatter, shortAddress, TRUST_DESCRIPTIONS } from '$lib/formatters.js';
	import ScoreBreakdown from '$lib/components/ScoreBreakdown.svelte';
	import StarIdenticon from '$lib/components/StarIdenticon.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import TryAgentPanel from '$lib/components/TryAgent/TryAgentPanel.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const tabs = [
		{ id: 'metadata', label: 'Metadata' },
		{ id: 'reputation', label: 'Reputation' }
	] as const;

	type TabId = 'metadata' | 'reputation';
	let activeTab = $state<TabId>('reputation');

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

	const showTryPanel = $derived(data.agent.x402Enabled && data.agent.services.length > 0);
</script>

<svelte:head>
	<title>{data.agent.name} | Preview</title>
</svelte:head>

<div class="space-y-10">
	<!-- Compact Hero: identity + inline trust signals -->
	<section class="space-y-4 reveal">
		<div class="flex items-start gap-4">
			<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-surface-raised/50">
				<StarIdenticon seed={String(data.agent.id)} size={56} />
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
					<Tooltip text={data.agent.owner}>
						<button type="button" onclick={() => copyToClipboard(data.agent.owner)} class="font-mono text-text-dim/50 transition hover:text-text-muted cursor-pointer">
							{shortAddress(data.agent.owner)}
						</button>
					</Tooltip>
					<span class="text-text-dim/25">-</span>
					<span class="text-text-dim/50">{dateFormatter.format(new Date(data.agent.createdAt))}</span>
					<span class="text-text-dim/25">-</span>
					<Tooltip text={`Agent ID: ${data.agent.id}`}>
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
							<p class="truncate font-mono text-[11px] text-text-muted">{service.endpoint}</p>
						</div>
					{/each}
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
					<pre class="overflow-auto rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-text-muted">{data.agent.registrationData}</pre>
				{/if}
			</div>
		</section>
	{:else if activeTab === 'reputation'}
		<section class="space-y-8">
			<div class="overflow-hidden rounded-lg border border-border bg-surface">
				<div class="border-b border-border/40 px-4 py-3">
					<h2 class="text-sm font-medium text-text">Reputation Feed</h2>
				</div>
				{#if data.feedback.length > 0}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead class="bg-surface-raised text-left text-xs tracking-[0.12em] text-text-dim uppercase">
								<tr>
									<th class="px-4 py-2.5 font-medium">Client</th>
									<th class="px-4 py-2.5 text-right font-medium">Score</th>
									<th class="px-4 py-2.5 font-medium">Tag</th>
									<th class="px-4 py-2.5 font-medium">Status</th>
									<th class="px-4 py-2.5 font-medium">Date</th>
								</tr>
							</thead>
							<tbody>
								{#each data.feedback as feedback (feedback.id)}
									<tr class:opacity-40={feedback.isRevoked} class="border-t border-border">
										<td class="px-4 py-2.5 font-mono text-xs text-text-muted">
											{shortAddress(feedback.clientAddress)}
										</td>
										<td class="px-4 py-2.5 text-right font-medium text-positive">
											{scoreFormatter.format(feedback.score)}
										</td>
										<td class="px-4 py-2.5 text-text-muted">
											{#if feedback.tag1}
												<div class="flex flex-wrap gap-1.5">
													<span class="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{feedback.tag1}</span>
													{#if feedback.tag2}
														<span class="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{feedback.tag2}</span>
													{/if}
												</div>
											{:else}
												<span class="text-text-dim">No tags</span>
											{/if}
										</td>
										<td class="px-4 py-2.5 text-xs">
											{#if feedback.isRevoked}
												<span class="rounded-full bg-negative-soft px-2 py-0.5 text-negative">Revoked</span>
											{:else}
												<span class="rounded-full bg-positive-soft px-2 py-0.5 text-positive">Active</span>
											{/if}
										</td>
										<td class="px-4 py-2.5 text-xs text-text-dim">
											{dateTimeFormatter.format(new Date(feedback.createdAt))}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			{#if data.clientBreakdown.length > 0}
				<div class="overflow-hidden rounded-lg border border-border bg-surface">
					<div class="border-b border-border/40 px-4 py-3">
						<h2 class="text-sm font-medium text-text">By Client</h2>
					</div>
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead class="bg-surface-raised text-left text-xs tracking-[0.12em] text-text-dim uppercase">
								<tr>
									<th class="px-4 py-2.5 font-medium">Client</th>
									<th class="px-4 py-2.5 text-right font-medium">Count</th>
									<th class="px-4 py-2.5 text-right font-medium">Avg Score</th>
									<th class="px-4 py-2.5 font-medium">Last Feedback</th>
								</tr>
							</thead>
							<tbody>
								{#each data.clientBreakdown as client (client.clientAddress)}
									<tr class="border-t border-border">
										<td class="px-4 py-2.5 font-mono text-xs text-text-muted">{shortAddress(client.clientAddress)}</td>
										<td class="px-4 py-2.5 text-right text-text">{client.feedbackCount}</td>
										<td class="px-4 py-2.5 text-right font-medium text-positive">{scoreFormatter.format(client.avgScore)}</td>
										<td class="px-4 py-2.5 text-xs text-text-dim">{dateTimeFormatter.format(new Date(client.lastFeedback))}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</section>
	{/if}
</div>

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
</style>
