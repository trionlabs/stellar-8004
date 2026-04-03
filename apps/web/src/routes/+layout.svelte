<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import WalletButton from '$lib/components/WalletButton.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-gray-950 text-gray-100">
	<header class="border-b border-gray-800">
		<nav class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
			<div class="flex items-center gap-8">
				<a href={resolve('/')} class="text-xl font-bold text-white"
					>8004scan <span class="text-indigo-400">Stellar</span></a
				>
				<div class="hidden items-center gap-6 text-sm md:flex">
					<a href={resolve('/agents')} class="text-gray-400 transition hover:text-white">Agents</a>
					<a href={resolve('/leaderboard')} class="text-gray-400 transition hover:text-white"
						>Leaderboard</a
					>
					<a href={resolve('/register')} class="text-gray-400 transition hover:text-white"
						>Register</a
					>
				</div>
			</div>
			<WalletButton />
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
