<script lang="ts">
	import { resolve } from '$app/paths';
	import { scoreFormatter, shortAddress } from '$lib/formatters.js';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import type { PageProps } from './$types';

	import { goto } from '$app/navigation';

	let { data }: PageProps = $props();

	const baseAgentsPath = resolve('/agents');

	let trustReputation = $state(data.filters.trust.includes('reputation'));
	let trustCryptoEconomic = $state(data.filters.trust.includes('crypto-economic'));
	let trustTee = $state(data.filters.trust.includes('tee-attestation'));
	let minScoreValue = $state(data.filters.minScore);
	let servicesOnly = $state(data.filters.hasServices);
	let filtersOpen = $state(data.filters.trust.length > 0 || data.filters.minScore > 0 || data.filters.hasServices);

	function applyFilters() {
		const url = new URL(window.location.href);
		url.searchParams.delete('trust');
		url.searchParams.delete('min_score');
		url.searchParams.delete('services');
		url.searchParams.set('page', '1');

		if (trustReputation) url.searchParams.append('trust', 'reputation');
		if (trustCryptoEconomic) url.searchParams.append('trust', 'crypto-economic');
		if (trustTee) url.searchParams.append('trust', 'tee-attestation');
		const clamped = Math.max(0, Math.min(100, Number(minScoreValue) || 0));
		if (clamped > 0) url.searchParams.set('min_score', String(clamped));
		if (servicesOnly) url.searchParams.set('services', 'true');

		goto(url.toString());
	}

	function clearFilters() {
		trustReputation = false;
		trustCryptoEconomic = false;
		trustTee = false;
		minScoreValue = 0;
		servicesOnly = false;

		const url = new URL(window.location.href);
		url.searchParams.delete('trust');
		url.searchParams.delete('min_score');
		url.searchParams.delete('services');
		url.searchParams.set('page', '1');
		goto(url.toString());
	}

	const hasActiveFilters = $derived(
		data.filters.trust.length > 0 || data.filters.minScore > 0 || data.filters.hasServices
	);

	/** Trust score → 5 mosaic blocks, each represents a 20-point quintile */
	function trustBlocks(score: number | null): { filled: number; level: 'none' | 'low' | 'mid' | 'high' } {
		if (score == null || score === 0) return { filled: 0, level: 'none' };
		const filled = Math.min(5, Math.ceil(score / 20));
		const level = score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';
		return { filled, level };
	}
</script>

<svelte:head>
	<title>Agents | 8004scan Stellar</title>
	<meta
		name="description"
		content="Browse indexed ERC-8004 agents on Stellar with search, score-based ranking, and reputation counts."
	/>
</svelte:head>

<div class="space-y-8">
	<div class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-4">
			<div class="flex items-center gap-2.5">
				<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
				<span class="text-[11px] tracking-[0.25em] text-text-muted uppercase">Directory</span>
			</div>
			<h1 class="text-2xl font-light tracking-tight text-text sm:text-3xl">Indexed Agents</h1>
		</div>

		<CtaButton href={resolve('/register')} size="sm">
			Register Agent
		</CtaButton>
	</div>

	<div class="flex flex-col gap-3 lg:flex-row">
		<form action={baseAgentsPath} method="get" class="flex flex-1 flex-col gap-3 md:flex-row">
			<input type="hidden" name="order" value={data.order} />
			<input
				type="text"
				name="q"
				value={data.query}
				placeholder="Search agents..."
				class="min-w-0 flex-1 rounded-xl border border-border bg-surface-raised/50 px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors"
			/>
			<select
				name="sort"
				class="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-muted focus:border-accent/50 focus:outline-none transition-colors"
			>
				<option value="created_at" selected={data.sort === 'created_at'}>Newest</option>
				<option value="score" selected={data.sort === 'score'}>Trust Score</option>
				<option value="feedback" selected={data.sort === 'feedback'}>Feedback</option>
			</select>
			<button
				type="submit"
				class="rounded-xl bg-accent-soft px-5 py-3 text-sm text-accent transition-all hover:bg-accent-medium"
			>
				Apply
			</button>
		</form>

		<form action={baseAgentsPath} method="get">
			<input type="hidden" name="sort" value={data.sort} />
			<input type="hidden" name="page" value="1" />
			<input type="hidden" name="order" value={data.order === 'asc' ? 'desc' : 'asc'} />
			{#if data.query}
				<input type="hidden" name="q" value={data.query} />
			{/if}
			<button
				type="submit"
				class="inline-flex h-full items-center justify-center rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-muted transition hover:bg-surface-raised hover:text-text"
			>
				{data.order === 'asc' ? 'Asc' : 'Desc'}
			</button>
		</form>
	</div>

	<!-- Filter panel -->
	<div class="space-y-3">
		<button
			type="button"
			onclick={() => (filtersOpen = !filtersOpen)}
			class="flex items-center gap-1.5 text-xs text-text-muted transition hover:text-text"
		>
			<svg class="h-3 w-3 transition-transform {filtersOpen ? 'rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
			Advanced Filters
			{#if hasActiveFilters}
				<span class="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">active</span>
			{/if}
		</button>

		{#if filtersOpen}
			<div class="rounded-xl border border-border bg-surface p-4 space-y-4">
				<div class="flex flex-wrap gap-6">
					<div class="space-y-2">
						<p class="text-xs font-medium text-text-dim">Trust Mechanisms</p>
						<div class="flex flex-wrap gap-3">
							<label class="flex items-center gap-1.5 text-sm text-text-muted">
								<input type="checkbox" bind:checked={trustReputation} class="rounded border-border" />
								reputation
							</label>
							<label class="flex items-center gap-1.5 text-sm text-text-muted">
								<input type="checkbox" bind:checked={trustCryptoEconomic} class="rounded border-border" />
								crypto-economic
							</label>
							<label class="flex items-center gap-1.5 text-sm text-text-muted">
								<input type="checkbox" bind:checked={trustTee} class="rounded border-border" />
								tee-attestation
							</label>
						</div>
					</div>

					<div class="space-y-2">
						<label for="min-score" class="text-xs font-medium text-text-dim">Min Score</label>
						<input
							id="min-score"
							type="number"
							min="0"
							max="100"
							bind:value={minScoreValue}
							class="w-20 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-text-muted focus:border-accent/50 focus:outline-none"
						/>
					</div>

					<div class="space-y-2">
						<p class="text-xs font-medium text-text-dim">Services</p>
						<label class="flex items-center gap-1.5 text-sm text-text-muted">
							<input type="checkbox" bind:checked={servicesOnly} class="rounded border-border" />
							Only with services
						</label>
					</div>
				</div>

				<div class="flex gap-2">
					<button
						type="button"
						onclick={applyFilters}
						class="rounded-lg bg-accent-soft px-4 py-1.5 text-sm text-accent transition hover:bg-accent-medium"
					>
						Apply Filters
					</button>
					{#if hasActiveFilters}
						<button
							type="button"
							onclick={clearFilters}
							class="rounded-lg border border-border px-4 py-1.5 text-sm text-text-muted transition hover:bg-surface-raised"
						>
							Clear All
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Results header -->
	<div class="flex items-center justify-between text-xs text-text-dim">
		<span>{data.query ? `Results for "${data.query}"` : hasActiveFilters ? 'Filtered agents' : 'All indexed agents'}</span>
		<span>Page {data.page}</span>
	</div>

	{#if data.agents.length > 0}
		<div class="space-y-2">
			{#each data.agents as agent (agent.id)}
				{@const trust = trustBlocks(agent.totalScore)}
				<a
					href={resolve('/agents/[id]', { id: String(agent.id) })}
					class="group block rounded-xl border border-border bg-surface transition-colors hover:bg-surface-raised hover:border-border-subtle"
				>
					<div class="flex items-center gap-4 px-5 py-4 sm:gap-6">
						<!-- Avatar + Name -->
						<div class="flex min-w-0 flex-1 items-center gap-3.5">
							<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-raised text-sm font-medium text-accent">
								{#if agent.image}
									<img src={agent.image} alt="" class="h-full w-full object-cover" />
								{:else}
									{agent.name.charAt(0)}
								{/if}
							</div>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-text transition-colors group-hover:text-accent">{agent.name}</p>
								<p class="mt-0.5 font-mono text-[11px] text-text-dim">{shortAddress(agent.owner)}</p>
							</div>
						</div>

						<!-- Metrics row -->
						<div class="hidden items-center gap-8 opacity-70 transition-opacity duration-200 group-hover:opacity-100 sm:flex">
							<!-- Trust Score — 5-block mosaic bar -->
							<div class="w-24 space-y-1.5">
								<div class="flex items-center justify-between">
									<span class="text-[10px] text-text-dim">Trust</span>
									<span class="tabular-nums text-xs font-medium {trust.level === 'high' ? 'text-positive' : trust.level === 'mid' ? 'text-accent' : trust.level === 'low' ? 'text-warning' : 'text-text-dim'}">
										{agent.totalScore != null ? scoreFormatter.format(agent.totalScore) : '—'}
									</span>
								</div>
								<div class="flex gap-0.5">
									{#each { length: 5 } as _, i}
										<div class="h-1 flex-1 rounded-full transition-colors {i < trust.filled
											? trust.level === 'high' ? 'bg-positive' : trust.level === 'mid' ? 'bg-accent' : 'bg-warning'
											: 'bg-border'}"></div>
									{/each}
								</div>
							</div>

							<!-- Reputation — avg score + count -->
							<div class="w-28 space-y-1.5">
								<div class="flex items-center justify-between">
									<span class="text-[10px] text-text-dim">Reputation</span>
									<span class="text-xs text-text-muted">
										{#if agent.avgScore != null && agent.feedbackCount > 0}
											<span class="font-medium tabular-nums text-text">{scoreFormatter.format(agent.avgScore)}</span>
											<span class="text-text-dim"> · {agent.feedbackCount}</span>
										{:else}
											<span class="text-text-dim">—</span>
										{/if}
									</span>
								</div>
								<!-- Mini heat blocks: each represents ~20 feedback cap -->
								<div class="flex gap-px">
									{#each { length: 5 } as _, i}
										{@const blockActive = agent.feedbackCount > i * 4}
										<div class="h-1 flex-1 rounded-sm transition-colors {blockActive ? 'bg-accent/50' : 'bg-border/50'}"></div>
									{/each}
								</div>
							</div>

							<!-- Endorsements — validation avg + count -->
							<div class="w-28 space-y-1.5">
								<div class="flex items-center justify-between">
									<span class="text-[10px] text-text-dim">Endorsed</span>
									<span class="text-xs text-text-muted">
										{#if agent.avgValidationScore != null && agent.validationCount > 0}
											<span class="font-medium tabular-nums text-text">{scoreFormatter.format(agent.avgValidationScore)}</span>
											<span class="text-text-dim"> · {agent.validationCount}</span>
										{:else}
											<span class="text-text-dim">—</span>
										{/if}
									</span>
								</div>
								<div class="flex gap-1">
									{#each { length: Math.max(3, Math.min(agent.validationCount, 7)) } as _, i}
										<div class="h-1.5 w-1.5 rounded-full {i < agent.validationCount ? 'bg-positive/60' : 'bg-border'}"></div>
									{/each}
								</div>
							</div>

							<!-- Unique clients -->
							<div class="w-12 text-right">
								<p class="text-[10px] text-text-dim">Clients</p>
								<p class="mt-1 tabular-nums text-xs font-medium text-text-muted">{agent.uniqueClients}</p>
							</div>
						</div>

						<!-- Mobile: compact metrics -->
						<div class="flex items-center gap-3 sm:hidden">
							{#if agent.totalScore != null}
								<span class="tabular-nums text-sm font-medium {trust.level === 'high' ? 'text-positive' : trust.level === 'mid' ? 'text-accent' : 'text-warning'}">
									{scoreFormatter.format(agent.totalScore)}
								</span>
							{:else}
								<span class="text-xs text-text-dim">New</span>
							{/if}
						</div>
					</div>
				</a>
			{/each}
		</div>
	{:else}
		<div class="rounded-xl border border-dashed border-border p-12 text-center">
			<p class="text-sm text-text">No agents matched {hasActiveFilters ? 'these filters' : 'this query'}</p>
			<p class="mt-1 text-xs text-text-dim">{hasActiveFilters ? 'Try removing some filters' : 'Try a broader search term'}</p>
			{#if hasActiveFilters}
				<button type="button" onclick={clearFilters} class="mt-3 rounded-lg border border-border px-4 py-1.5 text-sm text-text-muted transition hover:bg-surface-raised">
					Clear all filters
				</button>
			{/if}
		</div>
	{/if}

	<!-- Pagination -->
	<div class="flex items-center justify-between gap-4">
		{#if data.page > 1}
			<form action={baseAgentsPath} method="get">
				<input type="hidden" name="page" value={data.page - 1} />
				<input type="hidden" name="sort" value={data.sort} />
				{#if data.query}<input type="hidden" name="q" value={data.query} />{/if}
				{#if data.order !== 'desc'}<input type="hidden" name="order" value={data.order} />{/if}
				{#each data.filters.trust as t}<input type="hidden" name="trust" value={t} />{/each}
				{#if data.filters.minScore > 0}<input type="hidden" name="min_score" value={data.filters.minScore} />{/if}
				{#if data.filters.hasServices}<input type="hidden" name="services" value="true" />{/if}
				<button type="submit" class="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-muted transition hover:bg-surface-raised hover:text-text">
					Previous
				</button>
			</form>
		{:else}
			<div></div>
		{/if}

		{#if data.hasMore}
			<form action={baseAgentsPath} method="get">
				<input type="hidden" name="page" value={data.page + 1} />
				<input type="hidden" name="sort" value={data.sort} />
				{#if data.query}<input type="hidden" name="q" value={data.query} />{/if}
				{#if data.order !== 'desc'}<input type="hidden" name="order" value={data.order} />{/if}
				{#each data.filters.trust as t}<input type="hidden" name="trust" value={t} />{/each}
				{#if data.filters.minScore > 0}<input type="hidden" name="min_score" value={data.filters.minScore} />{/if}
				{#if data.filters.hasServices}<input type="hidden" name="services" value="true" />{/if}
				<button type="submit" class="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-muted transition hover:bg-surface-raised hover:text-text">
					Next
				</button>
			</form>
		{:else}
			<div></div>
		{/if}
	</div>
</div>
