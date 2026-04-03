<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const scoreFormatter = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	});

	function shortAddress(value: string): string {
		return `${value.slice(0, 6)}...${value.slice(-4)}`;
	}

	const baseAgentsPath = resolve('/agents');
</script>

<svelte:head>
	<title>Agents | 8004scan Stellar</title>
	<meta
		name="description"
		content="Browse indexed ERC-8004 agents on Stellar with search, score-based ranking, and reputation counts."
	/>
</svelte:head>

<div class="space-y-6">
	<section class="rounded-[2rem] border border-gray-800 bg-gray-900/70 p-6">
		<div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
			<div class="space-y-2">
				<p class="text-xs tracking-[0.18em] text-indigo-300 uppercase">Directory</p>
				<h1 class="text-3xl font-semibold text-white">Indexed Agents</h1>
				<p class="max-w-2xl text-sm leading-6 text-gray-400">
					Search by agent profile text or browse the latest and highest-scoring entries already
					indexed by the explorer.
				</p>
			</div>

			<a
				href={resolve('/register')}
				class="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-400"
			>
				Register Agent
			</a>
		</div>

		<div class="mt-6 flex flex-col gap-3 lg:flex-row">
			<form action={baseAgentsPath} method="get" class="flex flex-1 flex-col gap-3 md:flex-row">
				<input type="hidden" name="order" value={data.order} />
				<input
					type="text"
					name="q"
					value={data.query}
					placeholder="Search agents by profile text or owner address"
					class="min-w-0 flex-1 rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
				/>
				<select
					name="sort"
					class="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-300 focus:border-indigo-500 focus:outline-none"
				>
					<option value="created_at" selected={data.sort === 'created_at'}>Newest</option>
					<option value="score" selected={data.sort === 'score'}>Score</option>
					<option value="feedback" selected={data.sort === 'feedback'}>Feedback</option>
				</select>
				<button
					type="submit"
					class="rounded-xl bg-white px-4 py-3 text-sm font-medium text-gray-950 transition hover:bg-gray-200"
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
					class="inline-flex items-center justify-center rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm font-medium text-gray-200 transition hover:border-indigo-500/40 hover:text-white"
				>
					{data.order === 'asc' ? 'Ascending' : 'Descending'}
				</button>
			</form>
		</div>
	</section>

	<section class="overflow-hidden rounded-[2rem] border border-gray-800 bg-gray-900/70">
		<div class="flex items-center justify-between border-b border-gray-800 px-6 py-4">
			<div>
				<h2 class="text-lg font-medium text-white">
					{data.query ? `Results for "${data.query}"` : 'All indexed agents'}
				</h2>
				<p class="mt-1 text-sm text-gray-500">
					Sorted by
					{data.sort === 'created_at'
						? 'newest activity'
						: data.sort === 'score'
							? 'score'
							: 'feedback volume'}.
				</p>
			</div>
			<span
				class="rounded-full border border-gray-800 px-3 py-1 text-xs tracking-[0.16em] text-gray-500 uppercase"
			>
				Page {data.page}
			</span>
		</div>

		{#if data.agents.length > 0}
			<div class="overflow-x-auto">
				<table class="min-w-full text-sm">
					<thead class="bg-gray-950/70">
						<tr class="text-left text-xs tracking-[0.16em] text-gray-500 uppercase">
							<th class="px-6 py-4 font-medium">Agent</th>
							<th class="px-6 py-4 font-medium">Owner</th>
							<th class="px-6 py-4 text-right font-medium">Score</th>
							<th class="px-6 py-4 text-right font-medium">Feedback</th>
							<th class="px-6 py-4 text-right font-medium">Validators</th>
						</tr>
					</thead>
					<tbody>
						{#each data.agents as agent (agent.id)}
							<tr class="border-t border-gray-800 transition hover:bg-gray-950/40">
								<td class="px-6 py-4">
									<div class="flex items-center gap-4">
										<div
											class="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-gray-800 bg-gray-950 text-sm font-semibold text-indigo-200"
										>
											{#if agent.image}
												<img src={agent.image} alt="" class="h-full w-full object-cover" />
											{:else}
												{agent.name.charAt(0)}
											{/if}
										</div>
										<div class="min-w-0">
											<a
												href={resolve('/agents/[id]', { id: String(agent.id) })}
												class="block truncate text-base font-medium text-white transition hover:text-indigo-200"
											>
												{agent.name}
											</a>
											<p class="mt-1 text-xs text-gray-500">Agent #{agent.id}</p>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 font-mono text-xs text-gray-400"
									>{shortAddress(agent.owner)}</td
								>
								<td class="px-6 py-4 text-right font-medium">
									{#if agent.totalScore != null}
										<span class="text-emerald-400">{scoreFormatter.format(agent.totalScore)}</span>
									{:else}
										<span class="text-gray-600">Pending</span>
									{/if}
								</td>
								<td class="px-6 py-4 text-right text-gray-300">{agent.feedbackCount}</td>
								<td class="px-6 py-4 text-right text-gray-300">{agent.validationCount}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="px-6 py-12 text-center">
				<p class="text-base font-medium text-white">No agents matched this query.</p>
				<p class="mt-2 text-sm text-gray-500">
					Try a broader search term or switch back to the default listing.
				</p>
			</div>
		{/if}
	</section>

	<div class="flex items-center justify-between gap-4">
		{#if data.page > 1}
			<form action={baseAgentsPath} method="get">
				<input type="hidden" name="page" value={data.page - 1} />
				<input type="hidden" name="sort" value={data.sort} />
				{#if data.query}
					<input type="hidden" name="q" value={data.query} />
				{/if}
				{#if data.order !== 'desc'}
					<input type="hidden" name="order" value={data.order} />
				{/if}
				<button
					type="submit"
					class="inline-flex items-center rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:border-indigo-500/40"
				>
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
				{#if data.query}
					<input type="hidden" name="q" value={data.query} />
				{/if}
				{#if data.order !== 'desc'}
					<input type="hidden" name="order" value={data.order} />
				{/if}
				<button
					type="submit"
					class="inline-flex items-center rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:border-indigo-500/40"
				>
					Next
				</button>
			</form>
		{:else}
			<div></div>
		{/if}
	</div>
</div>
