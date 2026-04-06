<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { scoreFormatter, shortAddress } from '$lib/formatters.js';
	import { wallet } from '$lib/wallet.svelte.js';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import StarIdenticon from '$lib/components/StarIdenticon.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const baseAgentsPath = resolve('/agents');

	let trustReputation = $state(data.filters.trust.includes('reputation'));
	let trustCryptoEconomic = $state(data.filters.trust.includes('crypto-economic'));
	let trustTee = $state(data.filters.trust.includes('tee-attestation'));
	let minScoreValue = $state(data.filters.minScore);
	let servicesOnly = $state(data.filters.hasServices);

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

	const activeFilterCount = $derived(
		(trustReputation ? 1 : 0) + (trustCryptoEconomic ? 1 : 0) + (trustTee ? 1 : 0) + (servicesOnly ? 1 : 0) + (minScoreValue > 0 ? 1 : 0)
	);

	function trustBlocks(score: number | null): { filled: number; level: 'none' | 'low' | 'mid' | 'high' } {
		if (score == null || score === 0) return { filled: 0, level: 'none' };
		const filled = Math.min(5, Math.ceil(score / 20));
		const level = score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';
		return { filled, level };
	}

	// Mouse-tracking glow for agent rows
	function handleRowMouse(e: MouseEvent) {
		const row = (e.currentTarget as HTMLElement);
		const rect = row.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		row.style.setProperty('--mx', `${x}px`);
		row.style.setProperty('--my', `${y}px`);
	}
</script>

<svelte:head>
	<title>Agents | Stellar8004</title>
	<meta name="description" content="Browse indexed 8004 for Stellar agents with search, score-based ranking, and reputation counts." />
</svelte:head>

<div class="space-y-8">
	<!-- ── Header ── -->
	<header class="flex items-center justify-between">
		<div class="flex items-baseline gap-2">
			<span class="font-mono text-xl tabular-nums text-accent/60 font-light">{data.agents.length}</span>
			<h1 class="text-xl font-light tracking-tight text-text">{data.ownerFilter ? 'My Agents' : 'Agents'}</h1>
		</div>
		<div class="flex items-center gap-3">
			{#if wallet.connected && !data.ownerFilter}
				<CtaButton href="{baseAgentsPath}?owner={wallet.address}" variant="ghost" size="sm">My Agents</CtaButton>
			{/if}
			{#if data.ownerFilter}
				<CtaButton href={baseAgentsPath} variant="ghost" size="sm">all</CtaButton>
			{/if}
			<CtaButton href={resolve('/register')} size="sm">+ Register</CtaButton>
		</div>
	</header>

	<!-- ── Search: unified command bar ── -->
	<form action={baseAgentsPath} method="get" class="group">
		<input type="hidden" name="order" value={data.order} />
		{#if data.ownerFilter}<input type="hidden" name="owner" value={data.ownerFilter} />{/if}
		<div class="search-bar">
			<svg class="h-4 w-4 shrink-0 text-text-dim/40 transition group-focus-within:text-accent/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
			<input
				type="text"
				name="q"
				value={data.query}
				placeholder="Search agents..."
				class="flex-1 border-0 bg-transparent text-[13px] text-text placeholder:text-text-dim/30 focus:outline-none"
			/>
			<div class="flex items-center gap-px">
				<select name="sort" class="sort-select">
					<option value="created_at" selected={data.sort === 'created_at'}>Newest</option>
					<option value="score" selected={data.sort === 'score'}>Score</option>
					<option value="feedback" selected={data.sort === 'feedback'}>Feedback</option>
				</select>
				<button type="submit" class="search-go">Go</button>
			</div>
		</div>
	</form>

	<!-- ── Filter strip ── -->
	<nav class="flex flex-wrap items-center gap-1.5">
		<form action={baseAgentsPath} method="get" class="contents">
			<input type="hidden" name="sort" value={data.sort} />
			<input type="hidden" name="page" value="1" />
			<input type="hidden" name="order" value={data.order === 'asc' ? 'desc' : 'asc'} />
			{#if data.query}<input type="hidden" name="q" value={data.query} />{/if}
			{#if data.ownerFilter}<input type="hidden" name="owner" value={data.ownerFilter} />{/if}
			<button type="submit" class="chip">
				<svg class="h-3 w-3 transition-transform {data.order === 'asc' ? '' : 'rotate-180'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" /></svg>
				{data.order === 'asc' ? 'Asc' : 'Desc'}
			</button>
		</form>

		<span class="divider"></span>

		<button type="button" onclick={() => { trustReputation = !trustReputation; applyFilters(); }} class="chip" class:chip--on={trustReputation}>
			{#if trustReputation}<span class="dot"></span>{/if}Reputation
		</button>
		<button type="button" onclick={() => { trustCryptoEconomic = !trustCryptoEconomic; applyFilters(); }} class="chip" class:chip--on={trustCryptoEconomic}>
			{#if trustCryptoEconomic}<span class="dot"></span>{/if}Crypto-economic
		</button>
		<button type="button" onclick={() => { trustTee = !trustTee; applyFilters(); }} class="chip" class:chip--on={trustTee}>
			{#if trustTee}<span class="dot"></span>{/if}TEE
		</button>
		<button type="button" onclick={() => { servicesOnly = !servicesOnly; applyFilters(); }} class="chip" class:chip--on-green={servicesOnly}>
			{#if servicesOnly}<span class="dot dot--green"></span>{/if}Services
		</button>

		<span class="divider"></span>

		<div class="chip focus-within:border-accent/25">
			<span class="text-text-dim/50">&ge;</span>
			<input type="number" min="0" max="100" bind:value={minScoreValue} onchange={applyFilters} placeholder="—"
				class="w-7 border-0 bg-transparent p-0 text-center text-[11px] tabular-nums text-text-muted focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
		</div>

		{#if hasActiveFilters}
			<button type="button" onclick={clearFilters} class="ml-auto text-[10px] text-text-dim/40 transition hover:text-negative">
				clear {activeFilterCount}
			</button>
		{/if}
	</nav>

	<!-- ── Agent list ── -->
	{#if data.agents.length > 0}
		<div class="grid-wrap">
			{#each data.agents as agent, idx (agent.id)}
				{@const trust = trustBlocks(agent.totalScore)}
				<a href={resolve('/agents/[id]', { id: String(agent.id) })} class="row group" style="--i:{idx}" onmousemove={handleRowMouse}>
					<div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-surface-raised/50">
						{#if agent.image}
							<img src={agent.image} alt="" class="h-full w-full object-cover" />
						{:else}
							<StarIdenticon seed={String(agent.id)} size={36} />
						{/if}
					</div>

					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-1.5">
							<p class="truncate text-[13px] font-medium text-text transition-colors group-hover:text-accent">{agent.name}</p>
							{#if wallet.connected && wallet.address?.toUpperCase() === agent.owner.toUpperCase()}
								<span class="shrink-0 rounded bg-positive/8 px-1 py-px text-[8px] font-semibold text-positive ring-1 ring-positive/12">YOU</span>
							{/if}
						</div>
						<p class="font-mono text-[10px] text-text-dim/50">{shortAddress(agent.owner)}</p>
					</div>

					<div class="flex items-center gap-2.5">
						<div class="hidden w-16 md:flex gap-[2px]">
							{#each { length: 5 } as _, i}
								<div class="h-[3px] flex-1 rounded-full {i < trust.filled
									? trust.level === 'high' ? 'bg-positive' : trust.level === 'mid' ? 'bg-accent' : 'bg-warning'
									: 'bg-border/20'}"></div>
							{/each}
						</div>
						<span class="w-10 text-right tabular-nums text-sm font-semibold tracking-tight
							{trust.level === 'high' ? 'text-positive' : trust.level === 'mid' ? 'text-accent' : trust.level === 'low' ? 'text-warning' : 'text-text-dim/25'}">
							{agent.totalScore != null ? scoreFormatter.format(agent.totalScore) : '—'}
						</span>
					</div>

					<div class="hidden w-14 text-right lg:block">
						{#if agent.feedbackCount > 0}
							<p class="tabular-nums text-xs text-text-muted">{scoreFormatter.format(agent.avgScore ?? 0)}</p>
							<p class="text-[9px] text-text-dim/40">{agent.feedbackCount}</p>
						{:else}
							<p class="text-text-dim/20">—</p>
						{/if}
					</div>

					<div class="hidden w-14 text-right xl:block">
						{#if agent.validationCount > 0}
							<p class="tabular-nums text-xs text-text-muted">{scoreFormatter.format(agent.avgValidationScore ?? 0)}</p>
							<p class="text-[9px] text-text-dim/40">{agent.validationCount}</p>
						{:else}
							<p class="text-text-dim/20">—</p>
						{/if}
					</div>

					<svg class="h-3 w-3 shrink-0 text-text-dim/15 transition-all group-hover:text-accent group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
				</a>
			{/each}
		</div>
	{:else}
		<div class="py-24 text-center">
			{#if data.ownerFilter}
				<p class="text-sm text-text-muted">No agents registered yet</p>
				<div class="mt-4"><CtaButton href={resolve('/register')} size="sm">Register Agent</CtaButton></div>
			{:else}
				<p class="text-sm text-text-muted">No matches</p>
				<p class="mt-1 text-[11px] text-text-dim">{hasActiveFilters ? 'Try fewer filters' : 'Try a broader search'}</p>
				{#if hasActiveFilters}
					<button type="button" onclick={clearFilters} class="mt-3 text-[11px] text-text-dim transition hover:text-text-muted">Clear filters</button>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- ── Pagination ── -->
	{#if data.page > 1 || data.hasMore}
		<nav class="flex items-center justify-center gap-1">
			{#if data.page > 1}
				<form action={baseAgentsPath} method="get">
					<input type="hidden" name="page" value={data.page - 1} />
					<input type="hidden" name="sort" value={data.sort} />
					{#if data.query}<input type="hidden" name="q" value={data.query} />{/if}
					{#if data.order !== 'desc'}<input type="hidden" name="order" value={data.order} />{/if}
					{#each data.filters.trust as t}<input type="hidden" name="trust" value={t} />{/each}
					{#if data.filters.minScore > 0}<input type="hidden" name="min_score" value={data.filters.minScore} />{/if}
					{#if data.filters.hasServices}<input type="hidden" name="services" value="true" />{/if}
					{#if data.ownerFilter}<input type="hidden" name="owner" value={data.ownerFilter} />{/if}
					<button type="submit" class="pager">
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
					</button>
				</form>
			{/if}
			<span class="px-3 font-mono text-[11px] tabular-nums text-text-dim/50">{data.page}</span>
			{#if data.hasMore}
				<form action={baseAgentsPath} method="get">
					<input type="hidden" name="page" value={data.page + 1} />
					<input type="hidden" name="sort" value={data.sort} />
					{#if data.query}<input type="hidden" name="q" value={data.query} />{/if}
					{#if data.order !== 'desc'}<input type="hidden" name="order" value={data.order} />{/if}
					{#each data.filters.trust as t}<input type="hidden" name="trust" value={t} />{/each}
					{#if data.filters.minScore > 0}<input type="hidden" name="min_score" value={data.filters.minScore} />{/if}
					{#if data.filters.hasServices}<input type="hidden" name="services" value="true" />{/if}
					{#if data.ownerFilter}<input type="hidden" name="owner" value={data.ownerFilter} />{/if}
					<button type="submit" class="pager">
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
					</button>
				</form>
			{/if}
		</nav>
	{/if}
</div>

<style>
	/* ── Search bar ── */
	.search-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 3px 7px 14px;
		border-radius: 10px;
		border: 0.5px solid color-mix(in oklch, var(--color-border) 50%, transparent);
		transition: border-color 0.2s, box-shadow 0.3s;
	}
	.search-bar:focus-within {
		border-color: color-mix(in oklch, var(--color-accent) 20%, transparent);
		box-shadow: 0 0 20px color-mix(in oklch, var(--color-accent) 4%, transparent);
	}
	.sort-select {
		appearance: none;
		background: transparent;
		border: 0;
		padding: 5px 8px;
		font-size: 11px;
		color: var(--color-text-dim);
		cursor: pointer;
		transition: color 0.15s;
	}
	.sort-select:hover { color: var(--color-text-muted); }
	.sort-select:focus { color: var(--color-accent); outline: none; }
	.search-go {
		padding: 5px 14px;
		border-radius: 7px;
		background: color-mix(in oklch, var(--color-accent) 6%, transparent);
		border: 0.5px solid color-mix(in oklch, var(--color-accent) 15%, transparent);
		font-size: 11px;
		font-weight: 500;
		color: color-mix(in oklch, var(--color-accent) 80%, transparent);
		cursor: pointer;
		transition: all 0.15s;
	}
	.search-go:hover {
		background: color-mix(in oklch, var(--color-accent) 10%, transparent);
		border-color: color-mix(in oklch, var(--color-accent) 30%, transparent);
		color: var(--color-accent);
	}

	/* ── Chips ── */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 9px;
		border-radius: 6px;
		border: 0.5px solid color-mix(in oklch, var(--color-border) 40%, transparent);
		font-size: 11px;
		color: var(--color-text-dim);
		background: transparent;
		cursor: pointer;
		user-select: none;
		transition: all 0.15s ease;
	}
	.chip:hover {
		border-color: color-mix(in oklch, var(--color-border) 70%, transparent);
		color: var(--color-text-muted);
	}
	.chip:active { transform: scale(0.97); }
	.chip--on {
		background: color-mix(in oklch, var(--color-accent) 5%, transparent);
		border-color: color-mix(in oklch, var(--color-accent) 20%, transparent);
		color: var(--color-accent);
		box-shadow: 0 0 10px color-mix(in oklch, var(--color-accent) 4%, transparent);
	}
	.chip--on-green {
		background: color-mix(in oklch, var(--color-positive) 5%, transparent);
		border-color: color-mix(in oklch, var(--color-positive) 20%, transparent);
		color: var(--color-positive);
		box-shadow: 0 0 10px color-mix(in oklch, var(--color-positive) 4%, transparent);
	}
	.dot {
		width: 3.5px; height: 3.5px; border-radius: 50%;
		background: var(--color-accent);
		animation: blink 2.5s ease-in-out infinite;
	}
	.dot--green { background: var(--color-positive); }
	@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
	.divider { width:0.5px; height:12px; margin:0 4px; background: color-mix(in oklch, var(--color-border) 25%, transparent); }

	/* ── Grid ── */
	.grid-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.5px;
		border-radius: 10px;
		overflow: hidden;
		border: 0.5px solid color-mix(in oklch, var(--color-border) 40%, transparent);
		background: color-mix(in oklch, var(--color-surface-overlay) 15%, transparent);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 16px;
		background: var(--color-surface);
		text-decoration: none;
		transition: background 0.1s, box-shadow 0.15s;
		animation: fade-up 0.25s ease both;
		animation-delay: calc(var(--i) * 18ms);
	}
	.row:hover {
		background:
			radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), color-mix(in oklch, var(--color-accent) 4%, transparent), transparent 70%),
			var(--color-surface-raised);
		box-shadow: inset 1.5px 0 0 color-mix(in oklch, var(--color-accent) 35%, transparent);
	}
	@keyframes fade-up {
		from { opacity:0; transform:translateY(3px) }
		to { opacity:1; transform:none }
	}

	/* ── Pager ── */
	.pager {
		display:flex; align-items:center; justify-content:center;
		width:28px; height:28px; border-radius:7px;
		border: 0.5px solid color-mix(in oklch, var(--color-border) 35%, transparent);
		color: var(--color-text-dim);
		background:transparent; cursor:pointer;
		transition: all 0.15s;
	}
	.pager:hover {
		border-color: color-mix(in oklch, var(--color-accent) 20%, transparent);
		color: var(--color-accent);
		background: color-mix(in oklch, var(--color-accent) 4%, transparent);
	}
</style>
