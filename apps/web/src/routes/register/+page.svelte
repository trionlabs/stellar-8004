<script lang="ts">
	import { goto } from '$app/navigation';
	import { registerAgent } from '$lib/contracts.js';
	import { getStellarConfig } from '$lib/stellar.js';
	import { wallet } from '$lib/wallet.svelte.js';
	import CtaButton from '$lib/components/CtaButton.svelte';

	let agentUri = $state('');
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');

	const busy = $derived(status === 'submitting');

	async function submit() {
		status = 'submitting';
		errorMsg = '';

		try {
			const result = await registerAgent(agentUri || undefined);
			status = 'success';
			await goto(`/agents/${result.agentId}`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Registration failed';
			status = 'error';
		}
	}
</script>

<svelte:head>
	<title>Register Agent — 8004scan Stellar</title>
</svelte:head>

<div class="mx-auto max-w-lg space-y-8">
	<!-- Page header banner -->
	<div class="space-y-4">
		<div class="flex items-center gap-2.5">
			<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
			<span class="text-[11px] tracking-[0.25em] text-text-muted uppercase">Agent Registration</span>
		</div>
		<h1 class="text-2xl font-light tracking-tight text-text sm:text-3xl">Register your agent</h1>
		<p class="text-sm leading-relaxed text-text-muted">
			Deploy an on-chain identity on Stellar. Earn trust through client feedback and validator endorsements.
		</p>
	</div>

	<!-- Card -->
	<div class="register-card relative overflow-hidden rounded-2xl border border-border bg-surface-raised/40">
		<div class="h-px bg-linear-to-r from-transparent via-accent/50 to-transparent"></div>

		<div class="p-8 sm:p-10">
			{#if !wallet.connected}
				<div class="space-y-6">
					<!-- Step pill -->
					<span class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase">
						<span class="h-1 w-1 rounded-full bg-accent animate-pulse"></span>
						Step 1 &mdash; Connect
					</span>

					<div class="flex items-center gap-4">
						<div class="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/8 ring-1 ring-accent/10">
							<svg class="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" /></svg>
						</div>
						<div>
							<p class="text-sm font-medium text-text">Freighter Wallet</p>
							<p class="text-xs text-text-dim">Browser extension &middot; {getStellarConfig().network}</p>
						</div>
					</div>

					<CtaButton onclick={() => wallet.connect()} disabled={wallet.loading} size="md" full>
						{wallet.loading ? 'Connecting...' : 'Connect Wallet'}
					</CtaButton>
				</div>
			{:else}
				<div class="space-y-6">
					<!-- Step pill -->
					<span class="inline-flex items-center gap-1.5 rounded-full border border-positive/15 bg-positive/5 px-3 py-1 text-[10px] tracking-[0.18em] text-positive uppercase">
						<span class="h-1 w-1 rounded-full bg-positive animate-pulse"></span>
						Step 2 &mdash; Register
					</span>

					<!-- Network status -->
					{#if wallet.networkMismatch}
						<div class="flex items-center gap-2.5 rounded-xl bg-warning/6 px-4 py-3 ring-1 ring-warning/12">
							<span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
							<p class="text-xs text-warning">
								Switch to <span class="font-medium uppercase">{getStellarConfig().network}</span> in Freighter
							</p>
						</div>
					{:else}
						<div class="flex items-center justify-between rounded-xl bg-positive/5 px-4 py-3 ring-1 ring-positive/10">
							<div class="flex items-center gap-2.5">
								<span class="h-1.5 w-1.5 rounded-full bg-positive animate-pulse"></span>
								<p class="text-xs text-positive">{getStellarConfig().network}</p>
							</div>
							<p class="truncate pl-4 font-mono text-[11px] text-text-dim">{wallet.address?.slice(0, 8)}...{wallet.address?.slice(-6)}</p>
						</div>
					{/if}

					<div class="h-px bg-border/40"></div>

					<!-- URI input -->
					<div class="space-y-2">
						<div class="flex items-baseline justify-between">
							<label class="text-xs font-medium text-text-muted" for="agent-uri">Metadata URI</label>
							<span class="text-[10px] text-text-dim">optional</span>
						</div>
						<input
							id="agent-uri"
							type="text"
							bind:value={agentUri}
							placeholder="https://... or ipfs://..."
							maxlength="512"
							class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors"
						/>
						<p class="text-[10px] text-text-dim">
							JSON with name, description, image, services
						</p>
					</div>

					<CtaButton onclick={submit} disabled={busy || wallet.networkMismatch} size="md" full>
						{#if status === 'submitting'}
							<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" /><path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
							Registering...
						{:else}
							Register on Stellar
						{/if}
					</CtaButton>

					{#if status === 'error'}
						<div class="flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12">
							<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
							<p class="text-xs text-negative">{errorMsg}</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="h-px bg-linear-to-r from-transparent via-accent/20 to-transparent"></div>
	</div>

	<!-- Trust signals — same pattern as landing -->
	<div class="flex items-center justify-center gap-4 text-xs text-text-dim">
		<span class="flex items-center gap-1.5">
			<svg class="h-3.5 w-3.5 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
			ERC-8004
		</span>
		<span class="h-3 w-px bg-border"></span>
		<span class="flex items-center gap-1.5">
			<svg class="h-3.5 w-3.5 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
			Soroban
		</span>
		<span class="h-3 w-px bg-border"></span>
		<span class="flex items-center gap-1.5">
			<svg class="h-3.5 w-3.5 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
			No fees
		</span>
	</div>
</div>

<style>
	.register-card {
		box-shadow:
			0 0 0 1px oklch(0.74 0.07 250 / 0.04),
			0 8px 40px oklch(0.13 0.014 250 / 0.5);
	}
</style>
