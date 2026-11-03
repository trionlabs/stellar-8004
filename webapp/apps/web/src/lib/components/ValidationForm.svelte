<script lang="ts">
	import { Buffer } from 'buffer';
	import { getClients } from '$lib/sdk-client.js';
	import {
		generateRequestNonce,
		isValidStellarAddress,
		formatSorobanError
	} from '@trionlabs/stellar8004';
	import { wallet } from '$lib/wallet.svelte.js';

	let { agentId }: { agentId: number } = $props();

	let validatorAddress = $state('');
	let requestUri = $state('');
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');
	let txHash = $state('');

	const busy = $derived(status === 'submitting');
	const address = $derived(validatorAddress.trim());
	const hasValidAddress = $derived(isValidStellarAddress(address));

	async function submit() {
		const caller = wallet.address;
		if (!wallet.connected || !caller) {
			errorMsg = 'Connect your wallet to request validation.';
			status = 'error';
			return;
		}

		if (!hasValidAddress) return;

		status = 'submitting';
		errorMsg = '';

		try {
			const { validation } = getClients();
			const requestHash = await generateRequestNonce(agentId, address);
			const tx = await validation.validation_request({
				caller,
				validator_address: address,
				agent_id: agentId,
				request_uri: requestUri,
				request_hash: Buffer.from(requestHash)
			});
			const sent = await tx.signAndSend();
			txHash = sent.sendTransactionResponse?.hash ?? '';
			status = 'success';
		} catch (err) {
			errorMsg = formatSorobanError(err, 'validation');
			status = 'error';
		}
	}
</script>

<div class="rounded-xl border border-border bg-surface-raised/40 p-4">
	<h3 class="mb-3 text-sm font-medium text-text">Request Validation</h3>

	{#if status === 'success'}
		<div class="text-sm text-positive">
			Validation requested. TX:
			<code class="font-mono text-xs">{txHash.slice(0, 12)}...</code>
		</div>
	{:else if !wallet.connected}
		<p class="text-sm text-text-dim">Connect your wallet to request validation.</p>
	{:else}
		<div class="space-y-3">
			<input
				type="text"
				bind:value={validatorAddress}
				aria-label="Validator Stellar address"
				placeholder="Validator Stellar address (G... or C...)"
				class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent/50 focus:outline-none"
			/>

			{#if address && !hasValidAddress}
				<p class="text-xs text-negative">
					Not a valid Stellar address (G... or C...). Check for typos.
				</p>
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
				<p class="text-xs text-warning">
					Switch Freighter to the correct network before submitting.
				</p>
			{/if}

			<button
				onclick={submit}
				disabled={!hasValidAddress || busy || wallet.networkMismatch}
				class="w-full rounded-lg border border-accent/30 bg-accent-fill px-4 py-2 text-sm font-medium text-accent transition hover:border-accent/45 hover:bg-accent-fill-hover disabled:opacity-40"
			>
				{status === 'submitting' ? 'Submitting...' : 'Request Validation'}
			</button>

			{#if status === 'error'}
				<p class="text-xs text-negative">{errorMsg}</p>
			{/if}
		</div>
	{/if}
</div>
