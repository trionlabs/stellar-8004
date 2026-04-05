<script lang="ts">
	import { giveFeedback } from '$lib/contracts.js';
	import { buildFeedbackEvidence, sha256Hash } from '$lib/evidence.js';
	import { getStellarConfig } from '$lib/stellar.js';
	import { wallet } from '$lib/wallet.svelte.js';

	let { agentId }: { agentId: number } = $props();

	let value = $state(50);
	let tag1 = $state('starred');
	let tag2 = $state('');
	let endpoint = $state('');
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');
	let txHash = $state('');
	let ipfsWarning = $state('');

	const busy = $derived(status === 'submitting');

	async function submit() {
		if (!wallet.connected) {
			errorMsg = 'Connect your wallet to submit feedback.';
			status = 'error';
			return;
		}

		status = 'submitting';
		errorMsg = '';
		ipfsWarning = '';

		try {
			const evidence = buildFeedbackEvidence({
				agentId,
				clientAddress: wallet.address!,
				value,
				tag1,
				registryContract: getStellarConfig().contracts.reputation
			});

			const evidenceJson = JSON.stringify(evidence);
			const feedbackHash = await sha256Hash(evidenceJson);

			let feedbackUri = '';
			try {
				const res = await fetch('/api/ipfs-upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: `feedback-${agentId}-${Date.now()}`,
						data: evidenceJson
					})
				});
				if (res.ok) {
					const { uri } = await res.json();
					feedbackUri = uri;
				} else {
					ipfsWarning = 'Evidence could not be uploaded — feedback will not be verifiable.';
				}
			} catch {
				ipfsWarning = 'Evidence could not be uploaded — feedback will not be verifiable.';
			}

			const result = await giveFeedback({
				agentId,
				value,
				valueDecimals: 0,
				tag1,
				tag2,
				endpoint,
				feedbackUri,
				feedbackHash
			});

			txHash = result.hash;
			status = 'success';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Failed to submit feedback';
			status = 'error';
		}
	}
</script>

<div class="rounded-lg border border-border bg-surface p-5">
	<h3 class="mb-4 text-sm font-medium text-text">Give Feedback</h3>

	{#if status === 'success'}
		<div class="text-sm text-positive">
			Feedback submitted. TX:
			<code class="text-xs">{txHash.slice(0, 12)}...</code>
		</div>
		{#if ipfsWarning}
			<p class="mt-1 text-xs text-warning">{ipfsWarning}</p>
		{/if}
	{:else if !wallet.connected}
		<p class="text-sm text-text-muted">Connect your wallet to submit feedback</p>
	{:else}
		<div class="space-y-4">
			<div>
				<label class="text-xs text-text-muted" for="feedback-score">Score: {value}</label>
				<input id="feedback-score" type="range" min="0" max="100" bind:value class="w-full" />
			</div>

			<div class="flex flex-col gap-3 md:flex-row">
				<select
					bind:value={tag1}
					aria-label="Feedback category"
					class="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-muted"
				>
					<option value="starred">Starred</option>
					<option value="uptime">Uptime</option>
					<option value="successRate">Success Rate</option>
					<option value="responseTime">Response Time</option>
					<option value="reachable">Reachable</option>
				</select>

				<input
					type="text"
					bind:value={tag2}
					aria-label="Secondary tag"
					placeholder="Tag 2 (optional)"
					maxlength="64"
					class="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-muted placeholder:text-text-dim"
				/>
			</div>

			<input
				type="text"
				bind:value={endpoint}
				aria-label="Endpoint tested"
				placeholder="Endpoint tested (optional)"
				maxlength="128"
				class="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-muted placeholder:text-text-dim"
			/>

			{#if wallet.networkMismatch}
				<p class="text-xs text-warning">Switch Freighter to the correct network before submitting</p>
			{/if}

			<button
				onclick={submit}
				disabled={busy || wallet.networkMismatch}
				class="w-full rounded-lg bg-accent-soft py-2 text-sm text-accent transition hover:bg-accent-medium disabled:opacity-50"
			>
				{status === 'submitting' ? 'Submitting...' : 'Submit Feedback'}
			</button>

			{#if status === 'error'}
				<p class="text-xs text-negative">{errorMsg}</p>
			{/if}
		</div>
	{/if}
</div>
