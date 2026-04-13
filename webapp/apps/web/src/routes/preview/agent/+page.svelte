<script lang="ts">
	import { scoreFormatter, dateFormatter, dateTimeFormatter, shortAddress, TRUST_DESCRIPTIONS } from '$lib/formatters.js';
	import ScoreBreakdown from '$lib/components/ScoreBreakdown.svelte';
	import StarIdenticon from '$lib/components/StarIdenticon.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import TryAgentPanel from '$lib/components/TryAgent/TryAgentPanel.svelte';
	import FeedbackForm from '$lib/components/FeedbackForm.svelte';
	import EvidenceViewer from '$lib/components/EvidenceViewer.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const tabs = [
		{ id: 'metadata', label: 'Metadata' },
		{ id: 'reputation', label: 'Reputation' }
	] as const;

	type TabId = 'metadata' | 'reputation';
	let activeTab = $state<TabId>('metadata');

	const TAG_FILTER_OPTIONS = [
		{ value: '', label: 'All' },
		{ value: 'starred', label: 'General' },
		{ value: 'uptime', label: 'Uptime' },
		{ value: 'reachable', label: 'Reachable' },
		{ value: 'successRate', label: 'Success Rate' },
		{ value: 'responseTime', label: 'Response Time' }
	] as const;

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

	const showTryPanel = $derived((data.agent.x402Enabled || data.agent.mppEnabled) && data.agent.services.length > 0);

	// Parse registration data for structured display
	const parsedRegistration = $derived.by(() => {
		if (!data.agent.registrationData) return null;
		try {
			return JSON.parse(data.agent.registrationData);
		} catch {
			return null;
		}
	});
</script>

<svelte:head>
	<title>{data.agent.name} | Preview</title>
</svelte:head>

<div class="space-y-10">
	<!-- Compact Hero -->
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
				{#if data.agent.supportedTrust.length > 0 || data.agent.x402Enabled || data.agent.mppEnabled}
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
						{#if data.agent.mppEnabled}
							<Tooltip text="Accepts MPP Charge payments (direct settlement)">
							<span class="rounded-full border border-accent/15 bg-accent/4 px-2 py-0.5 text-[10px] text-accent">mpp</span>
							</Tooltip>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</section>

	<!-- Trust stats -->
	<section class="reveal reveal-d1">
		<div class="stat-row grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border/30">
			<div class="stat-cell px-4 py-3">
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
			<div class="stat-cell px-4 py-3">
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
			<div class="stat-cell px-4 py-3">
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

	<!-- TRY PANEL -->
	{#if showTryPanel}
		<section class="reveal reveal-d2">
			<TryAgentPanel
				services={data.agent.services}
				x402Enabled={data.agent.x402Enabled}
				mppEnabled={data.agent.mppEnabled}
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
		<!-- Services -->
		{#if data.agent.services.length > 0}
			<section class="space-y-4">
				<div>
					<h2 class="text-sm font-medium text-text">Services</h2>
					<p class="mt-1 text-xs text-text-dim">Endpoints exposed by this agent</p>
				</div>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each data.agent.services as service}
						<div class="rounded-lg border border-border bg-surface p-4 space-y-2.5 glass-card">
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
							{#if service.description}
								<p class="text-[11px] text-text-dim">{service.description}</p>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- On-chain Metadata + Registration side by side -->
		<section class="space-y-6">
			<!-- On-chain metadata -->
			{#if data.metadata.length > 0}
				<div class="space-y-3">
					<h2 class="text-sm font-medium text-text">On-chain Metadata</h2>
					<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each data.metadata as entry (entry.key)}
							<div class="rounded-lg border border-border/40 bg-surface px-3.5 py-2.5 glass-card">
								<p class="text-[10px] text-text-dim/50 uppercase tracking-wider">{entry.key}</p>
								<p class="mt-0.5 text-sm text-text-muted">{entry.value ?? ''}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Registration payload — parsed fields + raw JSON toggle -->
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-sm font-medium text-text">Registration Payload</h2>
						{#if data.agent.agentUri}
							<p class="mt-0.5 truncate font-mono text-[11px] text-text-dim/50">{data.agent.agentUri}</p>
						{/if}
					</div>
					{#if data.agent.registrationData}
						<button
							type="button"
							onclick={() => copyToClipboard(data.agent.registrationData ?? '')}
							class="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text-dim transition hover:text-text hover:border-border"
						>
							{#if copySuccess === data.agent.registrationData}
								<svg class="h-3 w-3 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
								Copied
							{:else}
								<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
								Copy JSON
							{/if}
						</button>
					{/if}
				</div>

				{#if parsedRegistration}
					<div class="rounded-lg border border-border/40 bg-surface overflow-hidden glass-card">
						<!-- Parsed key-value rows -->
						{#each Object.entries(parsedRegistration) as [key, val]}
							<div class="flex items-start gap-3 border-t border-border/30 px-4 py-2.5 first:border-t-0 {typeof val === 'object' ? '' : ''}">
								<span class="w-32 shrink-0 text-[11px] font-medium text-accent/70 pt-0.5">{key}</span>
								<div class="min-w-0 flex-1 text-[12px] text-text-muted">
									{#if val === null}
										<span class="text-text-dim/30">null</span>
									{:else if typeof val === 'boolean'}
										<span class="{val ? 'text-positive' : 'text-text-dim'}">{val}</span>
									{:else if typeof val === 'string'}
										{val}
									{:else if Array.isArray(val)}
										<div class="flex flex-wrap gap-1.5">
											{#each val as item}
												{#if typeof item === 'string'}
													<span class="rounded-md border border-border/40 bg-surface-raised px-2 py-0.5 text-[11px]">{item}</span>
												{:else if typeof item === 'object' && item !== null}
													<div class="w-full rounded-md border border-border/30 bg-surface-raised px-3 py-2 mt-1 first:mt-0">
														{#each Object.entries(item) as [k, v]}
															<div class="flex gap-2 text-[11px] py-0.5">
																<span class="text-text-dim/50 shrink-0">{k}:</span>
																<span class="text-text-muted truncate">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
															</div>
														{/each}
													</div>
												{:else}
													<span class="rounded-md border border-border/40 bg-surface-raised px-2 py-0.5 text-[11px]">{JSON.stringify(item)}</span>
												{/if}
											{/each}
										</div>
									{:else}
										{JSON.stringify(val)}
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{:else if data.agent.registrationData}
					<pre class="overflow-auto rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-text-muted">{data.agent.registrationData}</pre>
				{:else}
					<div class="rounded-lg border border-dashed border-border/40 p-6 text-center text-sm text-text-dim">
						No structured registration payload
					</div>
				{/if}
			</div>
		</section>

	{:else if activeTab === 'reputation'}
		<section class="space-y-6">
			<!-- Feedback form -->
			<FeedbackForm agentId={data.agent.id} />

			<!-- Tag filter pills -->
			<div class="flex items-center gap-2">
				<span class="text-[11px] text-text-dim/50 uppercase tracking-wider">Filter</span>
				<div class="flex flex-wrap gap-1.5">
					{#each TAG_FILTER_OPTIONS as tag}
						<button
							type="button"
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
							<div class="feedback-card__score {feedback.score >= 60 ? 'text-positive' : feedback.score >= 30 ? 'text-warning' : 'text-negative'}">
								{scoreFormatter.format(feedback.score)}
							</div>
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
								<EvidenceViewer
									feedbackUri={feedback.feedbackUri}
									feedbackHash={feedback.feedbackHash}
								/>
							</div>
						</div>
					{/each}
				{:else}
					<div class="rounded-lg border border-dashed border-border/40 px-4 py-8 text-center text-sm text-text-dim">
						No feedback submitted yet.
					</div>
				{/if}
			</div>

			<!-- Client breakdown -->
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

<style>
	.stat-row {
		background: var(--color-border-subtle);
	}
	.stat-cell {
		background: var(--color-glass-raised);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		transition: background 0.2s ease;
	}
	.stat-cell:hover {
		background: var(--color-surface-overlay);
	}

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
