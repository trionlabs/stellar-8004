<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import WalletButton from '$lib/components/WalletButton.svelte';

	let { children } = $props();
	let menuOpen = $state(false);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-gray-950 text-gray-100">
	<header class="border-b border-gray-800">
		<nav class="mx-auto flex max-w-7xl flex-wrap items-center justify-between px-4 py-4">
			<div class="flex items-center gap-4">
				<a href={resolve('/')} class="text-xl font-bold text-white"
					>8004scan <span class="text-indigo-400">Stellar</span></a
				>
				<button
					class="ml-2 rounded p-1 text-gray-400 hover:text-white md:hidden"
					onclick={() => (menuOpen = !menuOpen)}
					aria-label="Toggle navigation menu"
					aria-expanded={menuOpen}
				>
					<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						{#if menuOpen}
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						{:else}
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
						{/if}
					</svg>
				</button>
			</div>

			<div class="hidden md:block">
				<WalletButton />
			</div>

			<div
				class={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-3 pt-3 text-sm md:flex md:w-auto md:flex-row md:items-center md:gap-6 md:pt-0`}
			>
				<a href={resolve('/agents')} class="text-gray-400 transition hover:text-white">Agents</a>
				<a href={resolve('/leaderboard')} class="text-gray-400 transition hover:text-white"
					>Leaderboard</a
				>
				<a href={resolve('/register')} class="text-gray-400 transition hover:text-white"
					>Register</a
				>
				<div class="md:hidden">
					<WalletButton />
				</div>
			</div>
		</nav>
	</header>

	<main class="mx-auto max-w-7xl px-4 py-8">
		{@render children()}
	</main>

	<footer class="mt-16 border-t border-gray-800">
		<div class="mx-auto max-w-7xl px-4 py-6 text-center text-sm text-gray-500">
			8004scan Stellar — Agent Trust Protocol Explorer
		</div>
	</footer>
</div>
