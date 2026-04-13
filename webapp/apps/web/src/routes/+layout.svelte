<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import favicon from '$lib/assets/logo-saturn.svg';
	import { wallet } from '$lib/wallet.svelte.js';
	import { theme } from '$lib/theme.svelte.js';
	import ProfileBadge from '$lib/components/ProfileBadge.svelte';
	import EllipticStars from '$lib/components/EllipticStars.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { children } = $props();

	const appNetworkLabel =
		env.PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'Mainnet' : 'Testnet';

	onMount(() => {
		wallet.restore();
		theme.init();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<EllipticStars />
<div class="flex min-h-screen flex-col text-text">
	<header class="navbar">
		<div class="mx-auto w-full max-w-5xl px-0 md:px-6">
			<nav class="navbar-inner">
			<a href={resolve('/')} class="flex items-center gap-2 text-[15px] tracking-tight text-text">
				<img src={favicon} alt="" class="h-5 w-5" />
				<span>Stellar<span class="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">8004</span></span>
			</a>

			<!-- Desktop nav -->
			<div class="hidden md:flex md:items-center md:gap-1">
				<a href={resolve('/agents')} class="nav-link">Agents</a>
				<a href={resolve('/leaderboard')} class="nav-link">Ranks</a>
				<a href={resolve('/developers')} class="nav-link"><span class="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Skills</span></a>
				<span class="mx-1.5 h-4 w-px bg-border/40"></span>
				<a href={resolve('/register')} class="nav-link nav-link--cta">
					<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
					Register
				</a>
				<span class="mx-1.5 h-4 w-px bg-border/40"></span>
				<ThemeToggle />
				<ProfileBadge />
			</div>

			<!-- Mobile top-right utilities -->
			<div class="flex items-center gap-2 md:hidden">
				<ThemeToggle />
				<ProfileBadge />
			</div>
		</nav>
		</div>
	</header>

	{#if wallet.networkMismatch}
		<div class="relative z-10 border-b border-warning-soft bg-warning-soft px-4 py-3 text-center text-sm text-warning">
			Freighter is on <span class="font-medium">{wallet.network}</span> - this app requires
			<span class="font-medium uppercase">{appNetworkLabel}</span>.
			Switch network in Freighter settings.
		</div>
	{/if}

	<main class="relative z-10 mx-auto w-full max-w-5xl flex-1 px-6 py-14 pb-24 md:pb-14">
		{@render children()}
	</main>

	<!-- Mobile bottom nav -->
	<nav class="btm-nav" aria-label="Mobile navigation">
		<a href={resolve('/agents')} class="btm-nav-item">
			<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.208V5.792A2 2 0 015.228 3.872h13.544A2 2 0 0121 5.792v4.456" /></svg>
			<span>Agents</span>
		</a>
		<a href={resolve('/leaderboard')} class="btm-nav-item">
			<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
			<span>Ranks</span>
		</a>
		<a href={resolve('/register')} class="btm-nav-item btm-nav-item--accent">
			<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
			<span>Register</span>
		</a>
		<a href={resolve('/developers')} class="btm-nav-item">
			<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
			<span class="bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Skills</span>
		</a>
	</nav>

	<footer class="relative z-10 mt-auto border-t border-border/40">
		<div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-6 text-[11px] text-text-dim">
			<div class="flex items-center gap-3">
				<span>Stellar<span class="text-accent/60">8004</span></span>
				<span class="text-text-dim/40">&middot;</span>
				<a href="https://trionlabs.dev" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 transition hover:text-text-muted">
					<svg class="h-3.5 w-3.5" viewBox="0 0 491 491" fill="currentColor"><path d="M490.94 0V490.94H0V0H490.94ZM70.6396 70.7695V140.77H140.64V210.47H70.7598V350.17H140.64V420.17H210.64V350.17H140.76V210.77H210.53V280.47H280.53V210.77H350.29V350.17H280.41V420.17H350.41V350.17H420.29V210.47H350.41V140.77H420.29V70.7695H280.41V140.77H210.64V70.7695H70.6396Z"/></svg>
					TrionLabs
				</a>
			</div>
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
