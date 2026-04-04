<script lang="ts">
	import { resolve } from '$app/paths';
	import { scoreFormatter, shortAddress } from '$lib/formatters.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatMetric(value: number | null) {
		return scoreFormatter.format(Number(value ?? 0));
	}
</script>

<svelte:head>
	<title>Leaderboard — 8004scan Stellar</title>
</svelte:head>

<div class="space-y-8">
	<div class="space-y-1">
		<h1 class="text-2xl font-light text-text">Leaderboard</h1>
		<p class="text-sm text-text-muted">Global composite score across feedback and validation activity</p>
	</div>

	<div class="overflow-hidden rounded-lg border border-border bg-surface">
		{#if data.leaders.length === 0}
			<p class="py-10 text-center text-sm text-text-dim">No agents registered yet</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="min-w-full text-sm">
					<thead class="bg-surface-raised">
						<tr>
							<th class="w-14 px-4 py-3 text-left text-xs text-text-dim">#</th>
							<th class="px-4 py-3 text-left text-xs text-text-dim">Agent</th>
							<th class="px-4 py-3 text-right text-xs text-text-dim">Total Score</th>
							<th class="px-4 py-3 text-right text-xs text-text-dim">Avg Feedback</th>
							<th class="px-4 py-3 text-right text-xs text-text-dim">Feedback #</th>
							<th class="px-4 py-3 text-right text-xs text-text-dim">Validations</th>
							<th class="px-4 py-3 text-right text-xs text-text-dim">Avg Validation</th>
						</tr>
					</thead>
					<tbody>
						{#each data.leaders as leader, i}
							<tr class="border-t border-border transition hover:bg-surface-raised">
								<td class="px-4 py-3 font-mono text-xs text-text-dim">{data.startRank + i}</td>
								<td class="px-4 py-3">
									<a
										href={resolve('/agents/[id]', { id: String(leader.agent_id) })}
										class="font-medium text-text hover:text-accent"
									>
										{leader.agent_name ?? `Agent #${leader.agent_id}`}
									</a>
									<div class="mt-0.5 font-mono text-[11px] text-text-dim">
										{leader.owner ? shortAddress(leader.owner) : 'Unknown'}
									</div>
								</td>
								<td class="px-4 py-3 text-right">
									<span class="text-sm font-medium text-positive">
										{formatMetric(leader.total_score)}
									</span>
								</td>
								<td class="px-4 py-3 text-right font-mono text-xs text-text-muted">{formatMetric(leader.avg_score)}</td>
								<td class="px-4 py-3 text-right text-xs text-text-muted">{leader.feedback_count ?? 0}</td>
								<td class="px-4 py-3 text-right text-xs text-text-muted">{leader.validation_count ?? 0}</td>
								<td class="px-4 py-3 text-right font-mono text-xs text-text-muted">
									{formatMetric(leader.avg_validation_score)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<div class="flex items-center justify-between">
		{#if data.page > 1}
			<a
				href="{resolve('/leaderboard')}?page={data.page - 1}"
				class="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text transition hover:bg-surface-raised"
			>
				Previous
			</a>
		{:else}
			<div></div>
		{/if}

		<span class="text-xs text-text-dim">Page {data.page}</span>

		{#if data.hasMore}
			<a
				href="{resolve('/leaderboard')}?page={data.page + 1}"
				class="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text transition hover:bg-surface-raised"
			>
				Next
			</a>
		{:else}
			<div></div>
		{/if}
	</div>
</div>
