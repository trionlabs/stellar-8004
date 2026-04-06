<script lang="ts">
	import { resolve } from '$app/paths';
	import { scoreFormatter, shortAddress } from '$lib/formatters.js';
	import StarIdenticon from '$lib/components/StarIdenticon.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function fmt(v: number | null) { return scoreFormatter.format(Number(v ?? 0)); }

	const lbPath = resolve('/leaderboard');

	function handleRowMouse(e: MouseEvent) {
		const row = (e.currentTarget as HTMLElement);
		const rect = row.getBoundingClientRect();
		row.style.setProperty('--mx', `${e.clientX - rect.left}px`);
		row.style.setProperty('--my', `${e.clientY - rect.top}px`);
	}
</script>

<svelte:head>
	<title>Leaderboard — Stellar8004</title>
</svelte:head>

<div class="space-y-10">
	<!-- ── Header ── -->
	<header class="space-y-1">
		<div class="flex items-center gap-2.5">
			<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
			<span class="text-[11px] tracking-[0.25em] text-text-muted uppercase">Ranked by score</span>
		</div>
		<h1 class="text-xl font-light tracking-tight text-text">Leaderboard</h1>
	</header>

	{#if data.leaders.length === 0}
		<div class="py-24 text-center space-y-3">
			<p class="text-sm text-text-muted">No agents ranked yet</p>
			<p class="text-[11px] text-text-dim">Register an agent and submit feedback to populate the leaderboard</p>
		</div>
	{:else}
		<!-- ── Column headers ── -->
		<div class="flex items-center gap-3 px-4 text-[10px] uppercase tracking-wider text-text-dim/50">
			<span class="w-5 text-right">#</span>
			<span class="w-8"></span>
			<span class="flex-1">Agent</span>
			<span class="w-14 text-right">Score</span>
			<span class="hidden w-14 text-right lg:block">Avg</span>
			<span class="hidden w-14 text-right xl:block">Val</span>
			<span class="w-3"></span>
		</div>

		<!-- ── Unified list ── -->
		<div class="grid-wrap">
			{#each data.leaders as leader, idx (leader.agent_id)}
				{@const rank = (data.page === 1 ? 1 : data.startRank) + idx}
				{@const isTop3 = data.page === 1 && idx < 3}
				<a href={resolve('/agents/[id]', { id: String(leader.agent_id) })}
					class="row group"
					class:row--top={isTop3}
					style="--i:{idx}"
					onmousemove={handleRowMouse}
				>
					<!-- Rank -->
					<span class="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums {isTop3 ? 'text-accent' : 'text-text-dim/30'}">
						{rank}
					</span>

					<!-- Avatar -->
					<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-surface-raised/50">
						{#if leader.agent_image}
							<img src={leader.agent_image} alt="" class="h-full w-full object-cover" />
						{:else if leader.owner}
							<StarIdenticon seed={String(leader.agent_id)} size={32} />
						{:else}
							<span class="text-[10px] text-text-dim">?</span>
						{/if}
					</div>

					<!-- Name + owner -->
					<div class="min-w-0 flex-1">
						<p class="truncate text-[13px] font-medium text-text transition-colors group-hover:text-accent">
							{leader.agent_name ?? `Agent #${leader.agent_id}`}
						</p>
						<div class="flex items-center gap-3 mt-0.5">
							<span class="font-mono text-[10px] text-text-dim/50">{leader.owner ? shortAddress(leader.owner) : ''}</span>
							{#if (leader.feedback_count ?? 0) > 0 || (leader.validation_count ?? 0) > 0}
								<span class="text-[9px] text-text-dim/40">
									{leader.feedback_count ?? 0} fb · {leader.validation_count ?? 0} val · {leader.unique_clients ?? 0} clients
								</span>
							{/if}
						</div>
					</div>

					<!-- Score -->
					<span class="w-14 text-right tabular-nums text-sm font-semibold tracking-tight {isTop3 ? 'text-accent' : 'text-accent/70'}">
						{fmt(leader.total_score)}
					</span>

					<!-- Avg score -->
					<div class="hidden w-14 text-right lg:block">
						{#if (leader.feedback_count ?? 0) > 0}
							<p class="tabular-nums text-xs text-text-muted">{fmt(leader.avg_score)}</p>
							<p class="text-[9px] text-text-dim/40">{leader.feedback_count}</p>
						{:else}
							<p class="text-text-dim/20">—</p>
						{/if}
					</div>

					<!-- Validation score -->
					<div class="hidden w-14 text-right xl:block">
						{#if (leader.validation_count ?? 0) > 0}
							<p class="tabular-nums text-xs text-text-muted">{fmt(leader.avg_validation_score)}</p>
							<p class="text-[9px] text-text-dim/40">{leader.validation_count}</p>
						{:else}
							<p class="text-text-dim/20">—</p>
						{/if}
					</div>

					<svg class="h-3 w-3 shrink-0 text-text-dim/15 transition-all group-hover:text-accent group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
				</a>
			{/each}
		</div>
	{/if}

	<!-- ── Pagination ── -->
	{#if data.page > 1 || data.hasMore}
		<nav class="flex items-center justify-center gap-1">
			{#if data.page > 1}
				<a href="{lbPath}?page={data.page - 1}" class="pager" aria-label="Previous page">
					<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
				</a>
			{/if}
			<span class="px-3 font-mono text-[11px] tabular-nums text-text-dim/50">{data.page}</span>
			{#if data.hasMore}
				<a href="{lbPath}?page={data.page + 1}" class="pager" aria-label="Next page">
					<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
				</a>
			{/if}
		</nav>
	{/if}
</div>

<style>
	/* ── Grid ── */
	.grid-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.5px;
		border-radius: 10px;
		overflow: hidden;
		border: 0.5px solid var(--color-border-subtle);
		background: var(--color-border-subtle);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 16px;
		background: var(--color-surface);
		text-decoration: none;
		transition: background 0.15s, box-shadow 0.15s;
		animation: fade-up 0.25s ease both;
		animation-delay: calc(var(--i) * 18ms);
	}
	.row--top {
		background: color-mix(in oklch, var(--color-accent) 3%, var(--color-surface));
		box-shadow: inset 2px 0 0 color-mix(in oklch, var(--color-accent) 20%, transparent);
	}
	.row:hover {
		background:
			radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), color-mix(in oklch, var(--color-accent) 4%, transparent), transparent 70%),
			var(--color-surface-raised);
		box-shadow: inset 2px 0 0 color-mix(in oklch, var(--color-accent) 30%, transparent);
	}
	@keyframes fade-up {
		from { opacity:0; transform:translateY(3px) }
		to { opacity:1; transform:none }
	}

	/* ── Pager ── */
	.pager {
		display:flex; align-items:center; justify-content:center;
		width:28px; height:28px; border-radius:7px;
		border: 0.5px solid var(--color-border-subtle);
		color: var(--color-text-dim);
		background:transparent; cursor:pointer;
		text-decoration: none;
		transition: all 0.15s;
	}
	.pager:hover {
		border-color: color-mix(in oklch, var(--color-accent) 20%, transparent);
		color: var(--color-accent);
		background: color-mix(in oklch, var(--color-accent) 4%, transparent);
	}
</style>
