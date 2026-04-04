<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { wallet } from '$lib/wallet.svelte.js';
	import WalletButton from '$lib/components/WalletButton.svelte';
	import EllipticStars from '$lib/components/EllipticStars.svelte';

	let { children } = $props();
	let menuOpen = $state(false);

	onMount(() => {
		wallet.restore();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-screen flex-col bg-surface text-text">
	<EllipticStars />
	<header class="relative z-10 border-b border-border/60">
		<nav class="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
			<a href={resolve('/')} class="text-lg font-medium tracking-tight text-text">
				8004scan <span class="text-text-dim">/</span> <span class="text-accent">Stellar</span>
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
		<div class="relative z-10 border-b border-warning-soft bg-warning-soft px-4 py-3 text-center text-sm text-warning">
			Freighter is on <span class="font-medium">{wallet.network}</span> — this app requires
			<span class="font-medium uppercase">{wallet.network === 'TESTNET' ? 'Mainnet' : 'Testnet'}</span>.
			Switch network in Freighter settings.
		</div>
	{/if}

	<main class="relative z-10 mx-auto w-full max-w-5xl flex-1 px-6 py-14">
		{@render children()}
	</main>

	<footer class="relative z-10 mt-auto border-t border-border/40">
		<div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-6 text-[11px] text-text-dim">
			<span>8004scan <span class="text-text-dim/40">/</span> <span class="text-accent/60">Stellar</span> <span class="text-text-dim/40">&middot;</span> TrionLabs</span>
			<div class="flex items-center gap-4">
				<a href={resolve('/agents')} class="transition hover:text-text-muted">Agents</a>
				<a href={resolve('/leaderboard')} class="transition hover:text-text-muted">Leaderboard</a>
				<a href="https://github.com/trionlabs/stellar-8004" target="_blank" rel="noopener noreferrer" class="transition hover:text-text-muted" aria-label="GitHub">
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
				</a>
			</div>
		</div>
	</footer>
</div>
