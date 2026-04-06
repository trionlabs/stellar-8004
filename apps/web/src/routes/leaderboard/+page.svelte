<script lang="ts">
	import { resolve } from '$app/paths';
	import { scoreFormatter, shortAddress } from '$lib/formatters.js';
	import StarIdenticon from '$lib/components/StarIdenticon.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function fmt(v: number | null) { return scoreFormatter.format(Number(v ?? 0)); }

	const lbPath = resolve('/leaderboard');

	// Split top 3 from the rest (only on page 1)
	const podium = $derived(data.page === 1 ? data.leaders.slice(0, 3) : []);
	const rest = $derived(data.page === 1 ? data.leaders.slice(3) : data.leaders);
	const restStartRank = $derived(data.page === 1 ? 4 : data.startRank);

	const medalColors = [
		{ text: 'text-medal-gold', border: 'border-medal-gold/25', bg: 'bg-medal-gold/4', glow: '0 0 30px color-mix(in oklch, var(--color-medal-gold) 8%, transparent)' },
		{ text: 'text-text-muted', border: 'border-text-dim/15', bg: 'bg-surface-raised/30', glow: 'none' },
		{ text: 'text-medal-bronze', border: 'border-medal-bronze/20', bg: 'bg-medal-bronze/3', glow: 'none' },
	];

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
	<header class="flex items-baseline gap-2">
		<span class="font-mono text-xl tabular-nums text-positive/50 font-light">{data.leaders.length}</span>
		<h1 class="text-xl font-light tracking-tight text-text">Leaderboard</h1>
	</header>

	{#if data.leaders.length === 0}
		<div class="empty-state">
			<!-- Decorative podium silhouette -->
			<svg class="empty-podium" viewBox="0 0 200 120" fill="none">
				<rect x="10" y="50" width="50" height="70" rx="4" fill="var(--color-border)" opacity="0.3" />
				<rect x="75" y="20" width="50" height="100" rx="4" fill="var(--color-border)" opacity="0.4" />
				<rect x="140" y="65" width="50" height="55" rx="4" fill="var(--color-border)" opacity="0.25" />
				<text x="35" y="42" text-anchor="middle" fill="var(--color-text-dim)" opacity="0.4" font-size="14" font-weight="300">2</text>
				<text x="100" y="14" text-anchor="middle" fill="var(--color-accent)" opacity="0.4" font-size="14" font-weight="300">1</text>
				<text x="165" y="58" text-anchor="middle" fill="var(--color-text-dim)" opacity="0.3" font-size="14" font-weight="300">3</text>
			</svg>
			<p class="text-[13px] text-text-muted">No agents ranked yet</p>
			<p class="text-[11px] text-text-dim/50">Register an agent and submit feedback to populate the leaderboard</p>
		</div>
	{:else}

		<!-- ── Podium: top 3 as hero cards (page 1 only) ── -->
		{#if podium.length > 0}
			<section class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				{#each podium as leader, i (leader.agent_id)}
					{@const m = medalColors[i]}
					<a href={resolve('/agents/[id]', { id: String(leader.agent_id) })}
						class="podium-card group {m.border} {m.bg}"
						style="box-shadow: {m.glow}"
					>
						<!-- Rank -->
						<span class="absolute top-3 left-4 font-mono text-[2.5rem] font-thin leading-none tabular-nums {m.text} opacity-20">
							{i + 1}
						</span>

						<div class="relative z-10 flex flex-col items-center gap-3 pt-6 pb-4 px-4 text-center">
							<!-- Avatar -->
							<div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border {m.border} bg-surface-raised/50">
								{#if leader.agent_image}
									<img src={leader.agent_image} alt="" class="h-full w-full object-cover" />
								{:else if leader.owner}
									<StarIdenticon seed={String(leader.agent_id)} size={48} />
								{:else}
									<span class="text-sm text-text-dim">?</span>
								{/if}
							</div>

							<!-- Name -->
							<div>
								<p class="text-[13px] font-medium text-text transition-colors group-hover:text-accent">{leader.agent_name ?? `Agent #${leader.agent_id}`}</p>
								<p class="mt-0.5 font-mono text-[10px] text-text-dim/50">{leader.owner ? shortAddress(leader.owner) : ''}</p>
							</div>

							<!-- Score — the hero number -->
							<span class="font-mono text-2xl font-semibold tabular-nums tracking-tight {m.text}">
								{fmt(leader.total_score)}
							</span>

							<!-- Micro stats -->
							<div class="flex gap-4 text-[10px] text-text-dim/60">
								<span>{leader.feedback_count ?? 0} fb</span>
								<span>{leader.validation_count ?? 0} val</span>
								<span>{leader.unique_clients ?? 0} clients</span>
							</div>
						</div>
					</a>
				{/each}
			</section>
		{/if}

		<!-- ── Rest of the list ── -->
		{#if rest.length > 0}
			<div class="grid-wrap">
				{#each rest as leader, idx (leader.agent_id)}
					{@const rank = restStartRank + idx}
					<a href={resolve('/agents/[id]', { id: String(leader.agent_id) })} class="row group" style="--i:{idx}" onmousemove={handleRowMouse}>
						<span class="w-5 shrink-0 text-right font-mono text-[10px] tabular-nums text-text-dim/30">{rank}</span>

						<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-surface-raised/50">
							{#if leader.agent_image}
								<img src={leader.agent_image} alt="" class="h-full w-full object-cover" />
							{:else if leader.owner}
								<StarIdenticon seed={String(leader.agent_id)} size={32} />
							{:else}
								<span class="text-[10px] text-text-dim">?</span>
							{/if}
						</div>

						<div class="min-w-0 flex-1">
							<p class="truncate text-[13px] font-medium text-text transition-colors group-hover:text-accent">{leader.agent_name ?? `Agent #${leader.agent_id}`}</p>
							<p class="font-mono text-[10px] text-text-dim/50">{leader.owner ? shortAddress(leader.owner) : ''}</p>
						</div>

						<span class="w-12 text-right tabular-nums text-sm font-semibold tracking-tight text-accent">
							{fmt(leader.total_score)}
						</span>

						<div class="hidden w-14 text-right lg:block">
							{#if (leader.feedback_count ?? 0) > 0}
								<p class="tabular-nums text-xs text-text-muted">{fmt(leader.avg_score)}</p>
								<p class="text-[9px] text-text-dim/40">{leader.feedback_count}</p>
							{:else}
								<p class="text-text-dim/20">—</p>
							{/if}
						</div>

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
	/* ── Empty state ── */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 64px 0;
		text-align: center;
	}
	.empty-podium {
		width: 160px;
		height: auto;
		opacity: 0.7;
		margin-bottom: 8px;
	}

	/* ── Podium cards ── */
	.podium-card {
		position: relative;
		overflow: hidden;
		border-radius: 12px;
		border: 0.5px solid;
		text-decoration: none;
		transition: transform 0.2s ease, box-shadow 0.3s ease;
	}
	.podium-card:hover {
		transform: translateY(-2px);
	}

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
		text-decoration: none;
		transition: all 0.15s;
	}
	.pager:hover {
		border-color: color-mix(in oklch, var(--color-accent) 20%, transparent);
		color: var(--color-accent);
		background: color-mix(in oklch, var(--color-accent) 4%, transparent);
	}
</style>
