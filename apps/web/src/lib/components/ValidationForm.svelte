<script lang="ts">
	import { client } from '$lib/sdk-client.js';
	import { wallet } from '$lib/wallet.svelte.js';

	let { agentId }: { agentId: number } = $props();

	let validatorAddress = $state('');
	let requestUri = $state('');
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');
	let txHash = $state('');

	const busy = $derived(status === 'submitting');
	const hasValidAddress = $derived(
		validatorAddress.length === 0 ||
			(validatorAddress.startsWith('G') && validatorAddress.length === 56)
	);

	async function submit() {
		if (!wallet.connected) {
			errorMsg = 'Connect your wallet to request validation.';
			status = 'error';
			return;
		}

		if (!validatorAddress.startsWith('G') || validatorAddress.length !== 56) {
			errorMsg = 'Enter a valid Stellar validator address.';
			status = 'error';
			return;
		}

		status = 'submitting';
		errorMsg = '';

		try {
			const result = await client.requestValidation({
				agentId,
				validatorAddress,
				requestUri
			});

			txHash = result.hash;
			status = 'success';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Failed to request validation';
			status = 'error';
		}
	}
</script>

<div class="rounded-xl border border-border bg-surface-raised/40 p-4">
	<h3 class="mb-3 text-sm font-medium text-text">Request Validation</h3>

	{#if status === 'success'}
		<div class="text-sm text-positive">
			Validation requested. TX:
			<code class="text-xs font-mono">{txHash.slice(0, 12)}...</code>
		</div>
	{:else if !wallet.connected}
		<p class="text-sm text-text-dim">Connect your wallet to request validation.</p>
	{:else}
		<div class="space-y-3">
			<input
				type="text"
				bind:value={validatorAddress}
				aria-label="Validator Stellar address"
				placeholder="Validator Stellar address (G...)"
				maxlength="56"
				class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent/50 focus:outline-none"
			/>

			{#if validatorAddress && !hasValidAddress}
				<p class="text-xs text-negative">Validator address must start with G and be 56 chars.</p>
			{/if}

			<input
				type="text"
				bind:value={requestUri}
				aria-label="Request URI"
				placeholder="Request URI (optional)"
				maxlength="512"
				class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent/50 focus:outline-none"
			/>

			<p class="text-[11px] text-text-dim">
				This form assumes the connected wallet owns the agent; the parent page must enforce that.
			</p>

			{#if wallet.networkMismatch}
				<p class="text-xs text-warning">Switch Freighter to the correct network before submitting.</p>
			{/if}

			<button
				onclick={submit}
				disabled={!validatorAddress || !hasValidAddress || busy || wallet.networkMismatch}
				class="w-full rounded-lg border border-accent/30 bg-accent-fill px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent-fill-hover hover:border-accent/45 disabled:opacity-40"
			>
				{status === 'submitting' ? 'Submitting...' : 'Request Validation'}
			</button>

			{#if status === 'error'}
				<p class="text-xs text-negative">{errorMsg}</p>
			{/if}
		</div>
	{/if}
</div>
