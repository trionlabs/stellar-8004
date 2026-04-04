<script lang="ts">
	import { resolve } from '$app/paths';
	import { scoreFormatter, shortAddress } from '$lib/formatters.js';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const baseAgentsPath = resolve('/agents');
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
		<div class="space-y-1">
			<p class="text-xs tracking-[0.18em] text-text-muted uppercase">Directory</p>
			<h1 class="text-2xl font-light text-text">Indexed Agents</h1>
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
				placeholder="Search agents"
				class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm placeholder:text-text-dim focus:border-accent focus:outline-none"
			/>
			<select
				name="sort"
				class="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-muted focus:border-accent focus:outline-none"
			>
				<option value="created_at" selected={data.sort === 'created_at'}>Newest</option>
				<option value="score" selected={data.sort === 'score'}>Score</option>
				<option value="feedback" selected={data.sort === 'feedback'}>Feedback</option>
			</select>
			<button
				type="submit"
				class="rounded-lg bg-surface-raised px-4 py-2.5 text-sm text-text transition hover:bg-surface-overlay"
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
				class="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-muted transition hover:text-text"
			>
				{data.order === 'asc' ? 'Ascending' : 'Descending'}
			</button>
		</form>
	</div>

	<div class="overflow-hidden rounded-lg border border-border bg-surface">
		<div class="flex items-center justify-between border-b border-border px-6 py-4">
			<div>
				<p class="text-sm text-text">
					{data.query ? `Results for "${data.query}"` : 'All indexed agents'}
				</p>
			</div>
			<span class="text-xs text-text-dim">
				Page {data.page}
			</span>
		</div>

		{#if data.agents.length > 0}
			<div class="overflow-x-auto">
				<table class="min-w-full text-sm">
					<thead class="bg-surface-raised">
						<tr class="text-left text-xs tracking-[0.12em] text-text-dim uppercase">
							<th class="px-6 py-3 font-medium">Agent</th>
							<th class="px-6 py-3 font-medium">Owner</th>
							<th class="px-6 py-3 text-right font-medium">Score</th>
							<th class="px-6 py-3 text-right font-medium">Feedback</th>
							<th class="px-6 py-3 text-right font-medium">Validators</th>
						</tr>
					</thead>
					<tbody>
						{#each data.agents as agent (agent.id)}
							<tr class="border-t border-border transition hover:bg-surface-raised">
								<td class="px-6 py-4">
									<div class="flex items-center gap-3">
										<div
											class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-raised text-xs font-medium text-accent"
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
												class="block truncate text-sm text-text transition hover:text-accent"
											>
												{agent.name}
											</a>
											<p class="mt-0.5 text-xs text-text-dim">Agent #{agent.id}</p>
										</div>
									</div>
								</td>
								<td class="px-6 py-4 font-mono text-xs text-text-muted"
									>{shortAddress(agent.owner)}</td
								>
								<td class="px-6 py-4 text-right font-medium">
									{#if agent.totalScore != null}
										<span class="text-positive">{scoreFormatter.format(agent.totalScore)}</span>
									{:else}
										<span class="text-text-dim">Pending</span>
									{/if}
								</td>
								<td class="px-6 py-4 text-right text-text-muted">{agent.feedbackCount}</td>
								<td class="px-6 py-4 text-right text-text-muted">{agent.validationCount}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="px-6 py-12 text-center">
				<p class="text-sm text-text">No agents matched this query</p>
				<p class="mt-1 text-xs text-text-dim">
					Try a broader search term or switch back to the default listing
				</p>
			</div>
		{/if}
	</div>

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
					class="inline-flex items-center rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text transition hover:bg-surface-raised"
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
					class="inline-flex items-center rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text transition hover:bg-surface-raised"
				>
					Next
				</button>
			</form>
		{:else}
			<div></div>
		{/if}
	</div>
</div>
