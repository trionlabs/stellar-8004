<script lang="ts">
	import { resolve } from '$app/paths';
	import { statFormatter, scoreFormatter, dateFormatter } from '$lib/formatters.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>8004scan Stellar</title>
	<meta
		name="description"
		content="Explore ERC-8004 agents, reputation, validation activity, and recent trust signals on Stellar."
	/>
</svelte:head>

<div class="space-y-16">
	<section class="space-y-12">
		<div class="space-y-4">
			<div class="flex items-center gap-2">
				<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
				<span class="text-xs tracking-[0.2em] text-text-muted uppercase">Live Trust Graph</span>
			</div>

			<div class="space-y-3">
				<h1 class="max-w-2xl text-3xl font-light tracking-tight text-text sm:text-4xl">
					Agent reputation across Stellar
				</h1>
				<p class="max-w-xl text-sm leading-relaxed text-text-muted">
					Index registrations, reputation signals, and validator responses. See who is trusted, by whom, and why.
				</p>
			</div>
		</div>

		<form action="/agents" method="get">
			<div class="flex gap-2 sm:max-w-md">
				<input
					type="text"
					name="q"
					placeholder="Search agents"
					class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm placeholder:text-text-dim focus:border-accent focus:outline-none"
				/>
				<button
					type="submit"
					class="rounded-lg bg-accent-soft px-4 py-2.5 text-sm text-accent transition hover:bg-accent-medium"
				>
					Search
				</button>
			</div>
		</form>

		<div class="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
			<div class="bg-surface p-5">
				<p class="text-xs text-text-dim">Total Agents</p>
				<p class="mt-2 text-2xl font-light text-text">
					{statFormatter.format(data.stats.totalAgents)}
				</p>
			</div>
			<div class="bg-surface p-5">
				<p class="text-xs text-text-dim">Active Feedback</p>
				<p class="mt-2 text-2xl font-light text-text">
					{statFormatter.format(data.stats.totalFeedback)}
				</p>
			</div>
			<div class="bg-surface p-5">
				<p class="text-xs text-text-dim">Unique Clients</p>
				<p class="mt-2 text-2xl font-light text-text">
					{statFormatter.format(data.stats.totalClients)}
				</p>
			</div>
		</div>
	</section>

	<section class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-medium text-text">Recent Agents</h2>
				<a
					href={resolve('/agents')}
					class="text-xs text-text-muted transition hover:text-text"
				>
					View all
				</a>
			</div>

			{#if data.recentAgents.length > 0}
				<div class="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
					{#each data.recentAgents as agent (agent.id)}
						<a
							href={resolve('/agents/[id]', { id: String(agent.id) })}
							class="group bg-surface p-4 transition hover:bg-surface-raised"
						>
							<p class="text-xs text-text-dim">Agent #{agent.id}</p>
							<p class="mt-1.5 text-sm font-medium text-text transition group-hover:text-accent">
								{agent.name}
							</p>
							<p class="mt-1 text-xs text-text-dim">
								{dateFormatter.format(new Date(agent.createdAt))}
							</p>
						</a>
					{/each}
				</div>
			{:else}
				<div class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-dim">
					No agents indexed yet
				</div>
			{/if}
		</div>

		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-medium text-text">Recent Feedback</h2>
			</div>

			{#if data.recentFeedback.length > 0}
				<div class="space-y-px">
					{#each data.recentFeedback as feedback (feedback.id)}
						<a
							href={resolve('/agents/[id]', { id: String(feedback.agentId) })}
							class="block rounded-lg border border-border bg-surface p-4 transition hover:bg-surface-raised"
						>
							<div class="flex items-center justify-between">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-text">{feedback.agentName}</p>
									<p class="mt-0.5 text-xs text-text-dim">
										{dateFormatter.format(new Date(feedback.createdAt))}
									</p>
								</div>
								<div class="text-right">
									<p class="text-sm font-medium text-positive">
										{scoreFormatter.format(feedback.score)}
									</p>
								</div>
							</div>

							<div class="mt-3 flex items-center justify-between text-xs text-text-dim">
								<span class="font-mono">
									{feedback.clientAddress.slice(0, 6)}...{feedback.clientAddress.slice(-4)}
								</span>
								{#if feedback.tag}
									<span class="rounded-full bg-accent-soft px-2 py-0.5 text-accent">
										{feedback.tag}
									</span>
								{:else}
									<span>No tag</span>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<div class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-dim">
					No feedback indexed yet
				</div>
			{/if}
		</div>
	</section>
</div>
