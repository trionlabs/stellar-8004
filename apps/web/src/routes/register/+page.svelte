<script lang="ts">
	import { goto } from '$app/navigation';
	import { registerAgent } from '$lib/contracts.js';
	import { stellarConfig } from '$lib/stellar.js';
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

<div class="mx-auto max-w-md space-y-8">
	<div class="space-y-1">
		<h1 class="text-2xl font-light text-text">Register Agent</h1>
		<p class="text-sm text-text-muted">
			Register on Stellar via Freighter. Network: <span class="text-text">{stellarConfig.network}</span>
		</p>
	</div>

	{#if !wallet.connected}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="mb-4 text-sm text-text-muted">Connect your wallet to register an agent</p>
			<CtaButton onclick={() => wallet.connect()} disabled={wallet.loading} size="md">
				{wallet.loading ? 'Connecting...' : 'Connect Wallet'}
			</CtaButton>
		</div>
	{:else}
		<div class="space-y-4 rounded-lg border border-border bg-surface p-6">
			{#if wallet.networkMismatch}
				<div class="rounded-md border border-warning-soft bg-warning-soft p-3 text-xs text-warning">
					Freighter is on <span class="font-medium">{wallet.network}</span> — switch to
					<span class="font-medium uppercase">{stellarConfig.network}</span> in Freighter settings
				</div>
			{:else}
				<div class="rounded-md border border-positive-soft bg-positive-soft p-3 text-xs text-positive">
					Connected to <span class="font-medium uppercase">{stellarConfig.network}</span> network
				</div>
			{/if}

			<div>
				<label class="mb-1.5 block text-xs text-text-muted" for="agent-uri">Agent URI (optional)</label>
				<input
					id="agent-uri"
					type="text"
					bind:value={agentUri}
					placeholder="https://... or ipfs://..."
					maxlength="512"
					class="w-full rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm placeholder:text-text-dim focus:border-accent focus:outline-none"
				/>
				<p class="mt-1.5 text-xs text-text-dim">
					JSON metadata URL with name, description, image and services
				</p>
			</div>

			<CtaButton onclick={submit} disabled={busy || wallet.networkMismatch} size="md" full>
				{status === 'submitting' ? 'Registering...' : 'Register Agent'}
			</CtaButton>

			{#if status === 'error'}
				<p class="text-xs text-negative">{errorMsg}</p>
			{/if}
		</div>
	{/if}
</div>
