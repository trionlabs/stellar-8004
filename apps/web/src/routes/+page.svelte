<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const statFormatter = new Intl.NumberFormat('en-US');
	const scoreFormatter = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	});
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
</script>

<svelte:head>
	<title>8004scan Stellar</title>
	<meta
		name="description"
		content="Explore ERC-8004 agents, reputation, validation activity, and recent trust signals on Stellar."
	/>
</svelte:head>

<div class="space-y-10">
	<section class="overflow-hidden rounded-[2rem] border border-gray-800 bg-gray-900/80">
		<div
			class="grid gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(22rem,1fr)] lg:px-10 lg:py-10"
		>
			<div class="space-y-6">
				<div
					class="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium tracking-[0.2em] text-indigo-200 uppercase"
				>
					<span class="h-2 w-2 rounded-full bg-indigo-300"></span>
					Live Trust Graph
				</div>

				<div class="space-y-4">
					<h1 class="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
						Track agent reputation and validation trails across Stellar.
					</h1>
					<p class="max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
						8004scan indexes agent registrations, reputation signals, and validator responses so you
						can inspect who is trusted, by whom, and why.
					</p>
				</div>

				<form action="/agents" method="get" class="max-w-2xl">
					<div
						class="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-950/80 p-3 sm:flex-row"
					>
						<input
							type="text"
							name="q"
							placeholder="Search agents by name, description, or owner address"
							class="min-w-0 flex-1 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
						/>
						<button
							type="submit"
							class="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-indigo-400"
						>
							Search Agents
						</button>
					</div>
				</form>
			</div>

			<div class="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
				<div class="rounded-2xl border border-gray-800 bg-gray-950/80 p-5">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Total Agents</p>
					<p class="mt-3 text-3xl font-semibold text-white">
						{statFormatter.format(data.stats.totalAgents)}
					</p>
				</div>
				<div class="rounded-2xl border border-gray-800 bg-gray-950/80 p-5">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Active Feedback</p>
					<p class="mt-3 text-3xl font-semibold text-white">
						{statFormatter.format(data.stats.totalFeedback)}
					</p>
				</div>
				<div class="rounded-2xl border border-gray-800 bg-gray-950/80 p-5">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Unique Clients</p>
					<p class="mt-3 text-3xl font-semibold text-white">
						{statFormatter.format(data.stats.totalClients)}
					</p>
				</div>
			</div>
		</div>
	</section>

	<section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
		<div class="rounded-[1.75rem] border border-gray-800 bg-gray-900/70 p-6">
			<div class="mb-5 flex items-center justify-between gap-4">
				<div>
					<h2 class="text-xl font-semibold text-white">Recent Agents</h2>
					<p class="mt-1 text-sm text-gray-500">Latest registrations indexed from the network.</p>
				</div>
				<a
					href={resolve('/agents')}
					class="text-sm font-medium text-indigo-300 transition hover:text-indigo-200"
				>
					View all
				</a>
			</div>

			{#if data.recentAgents.length > 0}
				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{#each data.recentAgents as agent (agent.id)}
						<a
							href={resolve('/agents/[id]', { id: String(agent.id) })}
							class="group rounded-2xl border border-gray-800 bg-gray-950/80 p-4 transition hover:border-indigo-500/40 hover:bg-gray-950"
						>
							<div class="flex items-start justify-between gap-4">
								<div>
									<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Agent #{agent.id}</p>
									<p
										class="mt-2 text-lg font-medium text-white transition group-hover:text-indigo-200"
									>
										{agent.name}
									</p>
								</div>
								<div class="rounded-full border border-gray-800 px-2 py-1 text-xs text-gray-500">
									{dateFormatter.format(new Date(agent.createdAt))}
								</div>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<div
					class="rounded-2xl border border-dashed border-gray-800 bg-gray-950/70 px-4 py-8 text-sm text-gray-500"
				>
					No agents have been indexed yet.
				</div>
			{/if}
		</div>

		<div class="rounded-[1.75rem] border border-gray-800 bg-gray-900/70 p-6">
			<div class="mb-5">
				<h2 class="text-xl font-semibold text-white">Recent Feedback</h2>
				<p class="mt-1 text-sm text-gray-500">
					Latest reputation signals recorded for indexed agents.
				</p>
			</div>

			{#if data.recentFeedback.length > 0}
				<div class="space-y-3">
					{#each data.recentFeedback as feedback (feedback.id)}
						<a
							href={resolve('/agents/[id]', { id: String(feedback.agentId) })}
							class="block rounded-2xl border border-gray-800 bg-gray-950/80 p-4 transition hover:border-indigo-500/30 hover:bg-gray-950"
						>
							<div class="flex items-start justify-between gap-4">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-white">{feedback.agentName}</p>
									<p class="mt-1 text-xs text-gray-500">
										{dateFormatter.format(new Date(feedback.createdAt))}
									</p>
								</div>
								<div class="text-right">
									<p class="text-lg font-semibold text-emerald-400">
										{scoreFormatter.format(feedback.score)}
									</p>
									<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Score</p>
								</div>
							</div>

							<div class="mt-4 flex items-center justify-between gap-4 text-xs text-gray-500">
								<span class="font-mono">
									{feedback.clientAddress.slice(0, 6)}...{feedback.clientAddress.slice(-4)}
								</span>
								{#if feedback.tag}
									<span
										class="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-indigo-200"
									>
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
				<div
					class="rounded-2xl border border-dashed border-gray-800 bg-gray-950/70 px-4 py-8 text-sm text-gray-500"
				>
					No feedback has been indexed yet.
				</div>
			{/if}
		</div>
	</section>
</div>
