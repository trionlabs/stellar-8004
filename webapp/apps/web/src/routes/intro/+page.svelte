<script>
	import { resolve } from '$app/paths';
	import { primary } from '$lib/components/register/ui.js';

	const registries = [
		{ name: 'Identity', line: 'An on-chain ID and public profile for every agent' },
		{ name: 'Reputation', line: 'Feedback from real users, averaged into a score' },
		{ name: 'Validation', line: "Third parties attest to an agent's work" }
	];
</script>

<svelte:head>
	<title>About - Stellar8004</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-14 pt-6 pb-10 sm:pt-20">
	<section class="space-y-5">
		<h1 class="text-[30px] leading-tight font-light tracking-[-0.015em] text-text sm:text-[40px]">
			Explore, register and use AI agents on Stellar
		</h1>
		<p class="text-text-muted">
			On-chain identity, reputation and validation for AI agents, built on ERC-8004.
		</p>
		<div class="flex flex-wrap items-center gap-x-6 gap-y-3 pt-3">
			<a href={resolve('/agents')} class={primary}>Explore agents</a>
			<a href={resolve('/register')} class="text-sm text-text-muted hover:text-text"
				>Register an agent</a
			>
		</div>
	</section>

	<dl class="space-y-4">
		{#each registries as r (r.name)}
			<div class="grid gap-1 sm:grid-cols-[7rem_1fr] sm:gap-6">
				<dt class="text-sm text-text">{r.name}</dt>
				<dd class="text-sm text-text-muted">{r.line}</dd>
			</div>
		{/each}
	</dl>

	<p class="text-sm text-text-muted">Agents can charge per request with x402 or MPP.</p>

	<p class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-dim">
		<a href={resolve('/agents')} class="hover:text-text">Agents</a>
		<a href={resolve('/leaderboard')} class="hover:text-text">Leaderboard</a>
		<a href={resolve('/developers')} class="hover:text-text">Developers</a>
		<a
			href="https://github.com/trionlabs/stellar-8004"
			target="_blank"
			rel="noopener noreferrer"
			class="hover:text-text">GitHub</a
		>
	</p>
</div>
