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

<div class="space-y-6">
	<div class="space-y-2">
		<h1 class="text-2xl font-bold">Leaderboard</h1>
		<p class="text-sm text-gray-400">
			Global composite score across feedback and validation activity.
		</p>
	</div>

	<div class="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
		{#if data.leaders.length === 0}
			<p class="py-10 text-center text-sm text-gray-500">No agents registered yet.</p>
		{:else}
			<table class="min-w-full text-sm">
				<thead class="bg-gray-800/50">
					<tr>
						<th class="w-16 px-4 py-3 text-left font-medium text-gray-400">#</th>
						<th class="px-4 py-3 text-left font-medium text-gray-400">Agent</th>
						<th class="px-4 py-3 text-right font-medium text-gray-400">Total Score</th>
						<th class="px-4 py-3 text-right font-medium text-gray-400">Avg Feedback</th>
						<th class="px-4 py-3 text-right font-medium text-gray-400">Feedback #</th>
						<th class="px-4 py-3 text-right font-medium text-gray-400">Validations</th>
						<th class="px-4 py-3 text-right font-medium text-gray-400">Avg Validation</th>
					</tr>
				</thead>
				<tbody>
					{#each data.leaders as leader, i}
						<tr class="border-t border-gray-800 transition hover:bg-gray-800/30">
							<td class="px-4 py-3 font-mono text-gray-500">{data.startRank + i}</td>
							<td class="px-4 py-3">
								<a
									href={resolve('/agents/[id]', { id: String(leader.agent_id) })}
									class="font-medium text-indigo-400 hover:text-indigo-300"
								>
									{leader.agent_name ?? `Agent #${leader.agent_id}`}
								</a>
								<div class="mt-0.5 font-mono text-xs text-gray-600">
									{leader.owner ? shortAddress(leader.owner) : 'Unknown'}
								</div>
							</td>
							<td class="px-4 py-3 text-right">
								<span class="text-lg font-bold text-green-400">
									{formatMetric(leader.total_score)}
								</span>
							</td>
							<td class="px-4 py-3 text-right font-mono">{formatMetric(leader.avg_score)}</td>
							<td class="px-4 py-3 text-right text-gray-400">{leader.feedback_count ?? 0}</td>
							<td class="px-4 py-3 text-right text-gray-400">{leader.validation_count ?? 0}</td>
							<td class="px-4 py-3 text-right font-mono">
								{formatMetric(leader.avg_validation_score)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<div class="flex items-center justify-between">
		{#if data.page > 1}
			<a
				href="{resolve('/leaderboard')}?page={data.page - 1}"
				class="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
			>
				Previous
			</a>
		{:else}
			<div></div>
		{/if}

		<span class="text-sm text-gray-500">Page {data.page}</span>

		{#if data.hasMore}
			<a
				href="{resolve('/leaderboard')}?page={data.page + 1}"
				class="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
			>
				Next
			</a>
		{:else}
			<div></div>
		{/if}
	</div>
</div>
