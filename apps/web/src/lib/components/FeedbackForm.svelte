<script lang="ts">
	import { giveFeedback } from '$lib/contracts.js';
	import { wallet } from '$lib/wallet.svelte.js';

	let { agentId }: { agentId: number } = $props();

	let value = $state(50);
	let tag1 = $state('starred');
	let tag2 = $state('');
	let endpoint = $state('');
	let evidenceUri = $state('');
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');
	let txHash = $state('');

	const busy = $derived(status === 'submitting');

	async function sha256Hash(content: string): Promise<Uint8Array> {
		const encoded = new TextEncoder().encode(content);
		const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
		return new Uint8Array(hashBuffer);
	}

	async function submit() {
		if (!wallet.connected) {
			errorMsg = 'Connect your wallet to submit feedback.';
			status = 'error';
			return;
		}

		status = 'submitting';
		errorMsg = '';

		try {
			// Evidence URI and hash come from the user, not from us.
			// If the user provides an evidence URI, we hash the URI itself
			// so the on-chain record links to it. The actual evidence content
			// and its integrity are the user's responsibility.
			let feedbackUri = evidenceUri.trim();
			let feedbackHash: Uint8Array;

			if (feedbackUri) {
				feedbackHash = await sha256Hash(feedbackUri);
			} else {
				feedbackHash = new Uint8Array(32); // bytes32(0) — no evidence
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

			<input
				type="text"
				bind:value={evidenceUri}
				aria-label="Evidence URI"
				placeholder="Evidence URI (optional) — ipfs:// or https://"
				maxlength="256"
				class="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-muted placeholder:text-text-dim"
			/>
			<p class="text-[11px] text-text-dim">
				Link to off-chain evidence (interaction logs, payment proof). Leave empty for score-only feedback.
			</p>

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
