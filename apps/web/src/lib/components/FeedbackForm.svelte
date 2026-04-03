<script lang="ts">
	import { giveFeedback } from '$lib/contracts.js';
	import { wallet } from '$lib/wallet.svelte.js';

	let { agentId }: { agentId: number } = $props();

	let value = $state(50);
	let tag1 = $state('starred');
	let tag2 = $state('');
	let endpoint = $state('');
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');
	let txHash = $state('');

	const busy = $derived(status === 'submitting');

	async function submit() {
		if (!wallet.connected) {
			errorMsg = 'Connect your wallet to submit feedback.';
			status = 'error';
			return;
		}

		status = 'submitting';
		errorMsg = '';

		try {
			const result = await giveFeedback({
				agentId,
				value,
				valueDecimals: 0,
				tag1,
				tag2,
				endpoint,
				feedbackUri: '',
				// Use a non-zero ephemeral hash until real content hashing is added.
				feedbackHash: crypto.getRandomValues(new Uint8Array(32))
			});

			txHash = result.hash;
			status = 'success';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Failed to submit feedback';
			status = 'error';
		}
	}
</script>

<div class="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
	<h3 class="mb-3 text-sm font-semibold">Give Feedback</h3>

	{#if status === 'success'}
		<div class="text-sm text-green-400">
			Feedback submitted. TX:
			<code class="text-xs">{txHash.slice(0, 12)}...</code>
		</div>
	{:else if !wallet.connected}
		<p class="text-sm text-gray-400">Connect your wallet to submit feedback.</p>
	{:else}
		<div class="space-y-3">
			<div>
				<label class="text-xs text-gray-400" for="feedback-score">Score: {value}</label>
				<input id="feedback-score" type="range" min="0" max="100" bind:value class="w-full" />
			</div>

			<div class="flex flex-col gap-3 md:flex-row">
				<select
					bind:value={tag1}
					aria-label="Feedback category"
					class="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300"
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
					class="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 placeholder:text-gray-600"
				/>
			</div>

			<input
				type="text"
				bind:value={endpoint}
				aria-label="Endpoint tested"
				placeholder="Endpoint tested (optional)"
				maxlength="128"
				class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 placeholder:text-gray-600"
			/>

			{#if wallet.networkMismatch}
				<p class="text-xs text-amber-400">Switch Freighter to the correct network before submitting.</p>
			{/if}

			<button
				onclick={submit}
				disabled={busy || wallet.networkMismatch}
				class="w-full rounded-lg bg-indigo-600 py-2 text-sm text-white transition hover:bg-indigo-700 disabled:opacity-50"
			>
				{status === 'submitting' ? 'Submitting...' : 'Submit Feedback'}
			</button>

			{#if status === 'error'}
				<p class="text-xs text-red-400">{errorMsg}</p>
			{/if}
		</div>
	{/if}
</div>
