<script lang="ts">
	import { resolve } from '$app/paths';
	import { statFormatter, scoreFormatter, dateFormatter } from '$lib/formatters.js';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const trustSignals = [
		{ label: '8004 for Stellar', d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
		{ label: 'Soroban', d: 'M13 10V3L4 14h7v7l9-11h-7z' },
		{ label: 'Agent Identity', d: 'M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z' },
	];
</script>

<svelte:head>
	<title>Stellar8004</title>
	<meta
		name="description"
		content="Explorer for 8004 Agent Trust Protocol on Stellar. Browse agents, reputation scores, feedback, and validator endorsements."
	/>
</svelte:head>

<div class="space-y-20">
	<section class="space-y-10">
		<div class="space-y-5">
			<div class="flex items-center gap-2.5">
				<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
				<span class="text-[11px] tracking-[0.25em] text-text-muted uppercase">Agent Trust Explorer</span>
			</div>

			<div class="space-y-4">
				<h1 class="max-w-2xl text-3xl font-light tracking-tight text-text sm:text-[2.75rem] sm:leading-[1.15]">
					Explore AI agents on Stellar
				</h1>
				<p class="max-w-lg text-[15px] leading-relaxed text-text-muted font-light">
					Browse registered agents, check reputation scores, and track validator endorsements &mdash; all indexed from 8004 for Stellar contracts.
				</p>
			</div>
		</div>

		<form action={resolve('/agents')} method="get">
			<div class="flex gap-2.5 sm:max-w-md">
				<input
					type="text"
					name="q"
					placeholder="Search agents..."
					class="min-w-0 flex-1 rounded-xl border border-border bg-surface-raised/50 px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors"
				/>
				<button
					type="submit"
					class="rounded-xl bg-accent-fill border border-accent/30 px-5 py-3 text-sm font-medium text-accent transition-all hover:bg-accent-fill-hover hover:border-accent/45"
				>
					Search
				</button>
			</div>
		</form>

		<div class="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
			{#each [
				{ label: 'Total Agents', value: data.stats.totalAgents },
				{ label: 'Active Feedback', value: data.stats.totalFeedback },
				{ label: 'Unique Clients', value: data.stats.totalClients },
				{ label: 'Validated Agents', value: data.stats.validatedAgents },
			] as stat (stat.label)}
				<div class="group/stat relative bg-surface p-6 transition-colors hover:bg-surface-raised">
					<div class="absolute left-0 top-1/2 h-6 w-px -translate-y-1/2 bg-accent/0 transition-all duration-300 group-hover/stat:h-8 group-hover/stat:bg-accent/40"></div>
					<p class="text-[11px] tracking-wide text-text-dim uppercase transition-colors group-hover/stat:text-text-muted">{stat.label}</p>
					<p class="mt-2.5 text-[1.75rem] font-light tabular-nums tracking-tight text-text">
						{statFormatter.format(stat.value)}
					</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- CTA Banner -->
	<section class="cta-banner group/cta relative overflow-hidden rounded-2xl border border-border bg-linear-to-br from-surface-raised via-surface-overlay to-surface-raised p-8 sm:p-12 lg:p-16">
		<!-- Noise texture -->
		<div class="pointer-events-none absolute inset-0 cta-noise"></div>

		<!-- Light leaks -->
		<div class="cta-leak cta-leak--warm"></div>
		<div class="cta-leak cta-leak--cool"></div>
		<div class="cta-leak cta-leak--edge"></div>

		<div class="relative z-10 grid gap-10 sm:grid-cols-[1fr_auto] sm:items-center">
			<div class="space-y-5">
				<div class="flex items-center gap-3">
					<span class="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/6 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase">
						<span class="h-1 w-1 rounded-full bg-accent animate-pulse"></span>
						Agent Trust Protocol
					</span>
				</div>

				<h2 class="max-w-md text-2xl font-light tracking-tight text-text sm:text-[2rem]">
					Register your agent on
					<span class="text-accent">Stellar</span>
				</h2>

				<p class="max-w-sm text-[15px] leading-relaxed text-text-muted font-light">
					Connect your Freighter wallet, register your AI agent on-chain, and start collecting reputation through client feedback.
				</p>

				<!-- Trust signals -->
				<div class="flex items-center gap-4 pt-2 text-xs text-text-muted">
					{#each trustSignals as signal, i (signal.label)}
						{#if i > 0}<span class="h-3 w-px bg-border"></span>{/if}
						<span class="flex items-center gap-1.5">
							<svg class="h-3.5 w-3.5 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d={signal.d} />
							</svg>
							{signal.label}
						</span>
					{/each}
				</div>
			</div>

			<div class="flex flex-col items-start gap-3 sm:items-end">
				<CtaButton href={resolve('/register')} size="lg">
					Register Agent
					<svg class="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
					</svg>
				</CtaButton>
				<span class="text-[11px] text-text-dim">On-chain identity in seconds</span>
			</div>
		</div>
	</section>

	<section class="grid gap-10 xl:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-medium tracking-wide text-text">Recent Agents</h2>
				<a
					href={resolve('/agents')}
					class="text-xs text-text-muted transition hover:text-accent"
				>
					View all
				</a>
			</div>

			{#if data.recentAgents.length > 0}
				<div class="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
					{#each data.recentAgents as agent (agent.id)}
						<a
							href={resolve('/agents/[id]', { id: String(agent.id) })}
							class="group bg-surface p-5 transition-colors hover:bg-surface-raised"
						>
							<p class="text-[11px] text-text-dim font-mono">#{agent.id}</p>
							<p class="mt-2 text-sm font-medium text-text transition-colors group-hover:text-accent">
								{agent.name}
							</p>
							<p class="mt-1.5 text-[11px] text-text-dim">
								{dateFormatter.format(new Date(agent.createdAt))}
							</p>
						</a>
					{/each}
				</div>
			{:else}
				<div class="rounded-xl border border-dashed border-border p-10 text-center text-sm text-text-dim">
					No agents indexed yet
				</div>
			{/if}
		</div>

		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-medium tracking-wide text-text">Recent Feedback</h2>
			</div>

			{#if data.recentFeedback.length > 0}
				<div class="space-y-2">
					{#each data.recentFeedback as feedback (feedback.id)}
						<a
							href={resolve('/agents/[id]', { id: String(feedback.agentId) })}
							class="block rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-raised hover:border-border-subtle"
						>
							<div class="flex items-center justify-between">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-text">{feedback.agentName}</p>
									<p class="mt-0.5 text-[11px] text-text-dim">
										{dateFormatter.format(new Date(feedback.createdAt))}
									</p>
								</div>
								<div class="text-right">
									<p class="text-sm font-medium tabular-nums text-positive">
										{scoreFormatter.format(feedback.score)}
									</p>
								</div>
							</div>

							<div class="mt-3 flex items-center justify-between text-[11px] text-text-dim">
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
				<div class="rounded-xl border border-dashed border-border p-10 text-center text-sm text-text-dim">
					No feedback indexed yet
				</div>
			{/if}
		</div>
	</section>
</div>
