<script lang="ts">
	import { requestValidation } from '$lib/contracts.js';
	import { wallet } from '$lib/wallet.svelte.js';

	let { agentId }: { agentId: number } = $props();

	let validatorAddress = $state('');
	let requestUri = $state('');
	let status = $state<'idle' | 'signing' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');
	let txHash = $state('');

	const busy = $derived(status === 'signing' || status === 'submitting');
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

		status = 'signing';
		errorMsg = '';

		try {
			status = 'submitting';
			const result = await requestValidation({
				agentId,
				validatorAddress,
				// Empty string intentionally represents an optional URI in v1.
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

<div class="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
	<h3 class="mb-3 text-sm font-semibold">Request Validation</h3>

	{#if status === 'success'}
		<div class="text-sm text-green-400">
			Validation requested. TX:
			<code class="text-xs">{txHash.slice(0, 12)}...</code>
		</div>
	{:else if !wallet.connected}
		<p class="text-sm text-gray-400">Connect your wallet to request validation.</p>
	{:else}
		<div class="space-y-3">
			<input
				type="text"
				bind:value={validatorAddress}
				placeholder="Validator Stellar address (G...)"
				maxlength="56"
				class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 placeholder:text-gray-600"
			/>

			{#if validatorAddress && !hasValidAddress}
				<p class="text-xs text-red-400">Validator address must start with `G` and be 56 chars.</p>
			{/if}

			<input
				type="text"
				bind:value={requestUri}
				placeholder="Request URI (optional)"
				maxlength="512"
				class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 placeholder:text-gray-600"
			/>

			<p class="text-xs text-gray-500">
				This form assumes the connected wallet owns the agent; the parent page must enforce that.
			</p>

			<button
				onclick={submit}
				disabled={!validatorAddress || !hasValidAddress || busy}
				class="w-full rounded-lg bg-indigo-600 py-2 text-sm text-white transition hover:bg-indigo-700 disabled:opacity-50"
			>
				{status === 'signing'
					? 'Sign in wallet...'
					: status === 'submitting'
						? 'Submitting...'
						: 'Request Validation'}
			</button>

			{#if status === 'error'}
				<p class="text-xs text-red-400">{errorMsg}</p>
			{/if}
		</div>
	{/if}
</div>
