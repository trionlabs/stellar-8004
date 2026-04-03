<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { wallet } from '$lib/wallet.svelte.js';
	import WalletButton from '$lib/components/WalletButton.svelte';

	let { children } = $props();
	let menuOpen = $state(false);

	onMount(() => {
		wallet.restore();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-screen bg-surface text-text">
	<header class="border-b border-border">
		<nav class="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
			<a href={resolve('/')} class="text-lg font-medium tracking-tight text-text">
				8004scan <span class="text-text-muted">/</span> <span class="text-accent">Stellar</span>
			</a>

			<button
				class="rounded-lg p-2 text-text-muted hover:text-text md:hidden"
				onclick={() => (menuOpen = !menuOpen)}
				aria-label="Toggle navigation menu"
				aria-expanded={menuOpen}
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					{#if menuOpen}
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					{:else}
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
					{/if}
				</svg>
			</button>

			<div class="hidden md:flex md:items-center md:gap-8">
				<a href={resolve('/agents')} class="text-sm text-text-muted transition hover:text-text">Agents</a>
				<a href={resolve('/leaderboard')} class="text-sm text-text-muted transition hover:text-text">Leaderboard</a>
				<a href={resolve('/register')} class="text-sm text-text-muted transition hover:text-text">Register</a>
				<WalletButton />
			</div>

			<div
				class={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-4 pt-4 text-sm md:hidden`}
			>
				<a href={resolve('/agents')} class="text-text-muted transition hover:text-text">Agents</a>
				<a href={resolve('/leaderboard')} class="text-text-muted transition hover:text-text">Leaderboard</a>
				<a href={resolve('/register')} class="text-text-muted transition hover:text-text">Register</a>
				<WalletButton />
			</div>
		</nav>
	</header>

	{#if wallet.networkMismatch}
		<div class="border-b border-warning-soft bg-warning-soft px-4 py-3 text-center text-sm text-warning">
			Freighter is on <span class="font-medium">{wallet.network}</span> — this app requires
			<span class="font-medium uppercase">{wallet.network === 'TESTNET' ? 'Mainnet' : 'Testnet'}</span>.
			Switch network in Freighter settings.
		</div>
	{/if}

	<main class="mx-auto max-w-5xl px-6 py-12">
		{@render children()}
	</main>

	<footer class="border-t border-border">
		<div class="mx-auto max-w-5xl px-6 py-8 text-center text-xs text-text-dim">
			8004scan Stellar — Agent Trust Protocol Explorer
		</div>
	</footer>
</div>
