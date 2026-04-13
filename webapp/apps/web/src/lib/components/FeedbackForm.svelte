<script lang="ts">
	import { Buffer } from 'buffer';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { getClients } from '$lib/sdk-client.js';
	import { validateTag, formatSorobanError } from '@trionlabs/stellar8004';
	import { wallet } from '$lib/wallet.svelte.js';
	import { explorerTxUrl } from '$lib/explorer.js';

	let { agentId }: { agentId: number } = $props();

	// Score steps: 6 discrete levels (0-100 in steps of 20)
	const SCORE_STEPS = [
		{ value: 0,   label: 'Terrible', color: 'var(--fb-negative)' },
		{ value: 20,  label: 'Poor',     color: 'var(--fb-warning)' },
		{ value: 40,  label: 'Okay',     color: 'var(--fb-caution)' },
		{ value: 60,  label: 'Good',     color: 'var(--fb-moderate)' },
		{ value: 80,  label: 'Great',    color: 'var(--fb-positive)' },
		{ value: 100, label: 'Perfect',  color: 'var(--fb-excellent)' }
	] as const;

	const TAG_OPTIONS = [
		{ value: 'starred',      label: 'General' },
		{ value: 'uptime',       label: 'Uptime' },
		{ value: 'reachable',    label: 'Reachable' },
		{ value: 'successRate',  label: 'Success Rate' },
		{ value: 'responseTime', label: 'Response Time' }
	] as const;

	let value = $state(60);
	let tag1 = $state('starred');
	let tag2 = $state('');
	let endpoint = $state('');
	let evidenceUri = $state('');
	let showAdvanced = $state(false);
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');
	let txHash = $state('');
	let dragging = $state(false);

	const busy = $derived(status === 'submitting');

	function handlePointerDown(stepValue: number, e: PointerEvent) {
		dragging = true;
		value = stepValue;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		const track = (e.currentTarget as HTMLElement).closest('.fb-score__track');
		if (!track) return;
		const rect = track.getBoundingClientRect();
		const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
		const ratio = x / rect.width;
		const idx = Math.min(Math.floor(ratio * SCORE_STEPS.length), SCORE_STEPS.length - 1);
		value = SCORE_STEPS[idx].value;
	}

	function handlePointerUp() {
		dragging = false;
	}

	async function sha256Hash(content: string): Promise<Uint8Array> {
		const encoded = new TextEncoder().encode(content);
		const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
		return new Uint8Array(hashBuffer);
	}

	async function submit() {
		const caller = wallet.address;
		if (!wallet.connected || !caller) {
			errorMsg = 'Connect your wallet to submit feedback.';
			status = 'error';
			return;
		}

		status = 'submitting';
		errorMsg = '';

		try {
			validateTag(tag1, 'Tag 1');
			if (tag2) validateTag(tag2, 'Tag 2');

			let feedbackUri = evidenceUri.trim();
			let feedbackHash: Uint8Array;

			if (feedbackUri) {
				if (!['https://', 'http://', 'ipfs://'].some((s) => feedbackUri.startsWith(s))) {
					throw new Error('Evidence URI must use https://, http://, or ipfs:// scheme');
				}
				feedbackHash = await sha256Hash(feedbackUri);
			} else {
				feedbackHash = new Uint8Array(32);
			}

			const { reputation } = getClients();
			const tx = await reputation.give_feedback({
				caller,
				agent_id: agentId,
				value: BigInt(value),
				value_decimals: 0,
				tag1,
				tag2,
				endpoint,
				feedback_uri: feedbackUri,
				feedback_hash: Buffer.from(feedbackHash),
			});
			const sent = await tx.signAndSend();
			txHash = sent.sendTransactionResponse?.hash ?? '';
			status = 'success';
		} catch (err) {
			errorMsg = formatSorobanError(err);
			status = 'error';
		}
	}

	function reset() {
		value = 60;
		tag1 = 'starred';
		tag2 = '';
		endpoint = '';
		evidenceUri = '';
		status = 'idle';
		errorMsg = '';
		txHash = '';
		showAdvanced = false;
	}
</script>

<div class="fb-form">
	{#if status === 'success'}
		<div class="fb-success">
			<div class="fb-success__icon">
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			</div>
			<div>
				<p class="text-sm font-medium text-positive">Feedback submitted on-chain</p>
				{#if txHash}
					<a
						href={explorerTxUrl(txHash)}
						target="_blank"
						rel="noopener noreferrer"
						class="mt-1 block font-mono text-[11px] text-accent hover:underline"
					>{txHash.slice(0, 16)}...</a>
				{/if}
			</div>
			<button type="button" onclick={reset} class="ml-auto text-xs text-text-dim hover:text-text transition">
				Submit another
			</button>
		</div>
	{:else if !wallet.connected}
		<div class="flex items-center gap-3 px-4 py-3">
			<svg class="h-4 w-4 shrink-0 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
			</svg>
			<p class="text-sm text-text-muted">Connect wallet to give feedback</p>
		</div>
	{:else}
		<div class="fb-form__body">
			<!-- Score selector -->
			<div class="fb-score">
				<div class="fb-score__header">
					<span class="text-xs text-text-dim">Score</span>
					{#each SCORE_STEPS.filter(s => s.value === value) as activeStep}
						<span class="fb-score__badge" style="--step-color: {activeStep.color}">
							<span class="fb-score__badge-dot"></span>
							{activeStep.label}
							<span class="fb-score__badge-num">{activeStep.value}</span>
						</span>
					{/each}
				</div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="fb-score__track"
					class:fb-score__track--dragging={dragging}
					onpointerup={handlePointerUp}
					onpointercancel={handlePointerUp}
				>
					{#each SCORE_STEPS as step, i}
						<button
							type="button"
							onpointerdown={(e) => handlePointerDown(step.value, e)}
							onpointermove={handlePointerMove}
							class="fb-score__seg"
							class:fb-score__seg--active={value === step.value}
							class:fb-score__seg--filled={step.value <= value}
							style="--step-color: {step.color}; --seg-idx: {i}"
							aria-label="{step.label} ({step.value})"
						>
							<span class="fb-score__seg-fill"></span>
							<span class="fb-score__seg-label">{step.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Category -->
			<div class="fb-tags">
				<span class="text-xs text-text-dim">Category</span>
				<div class="fb-tags__list">
					{#each TAG_OPTIONS as tag}
						<button
							type="button"
							onclick={() => (tag1 = tag.value)}
							class="fb-tag"
							class:fb-tag--active={tag1 === tag.value}
						>
							{tag.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Advanced fields (collapsible) -->
			<button
				type="button"
				onclick={() => (showAdvanced = !showAdvanced)}
				class="fb-advanced-toggle"
			>
				<svg
					class="h-3 w-3 transition-transform duration-200"
					class:rotate-90={showAdvanced}
					fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
				Advanced
			</button>

			{#if showAdvanced}
				<div class="fb-advanced" transition:slide={{ duration: 200, easing: cubicOut }}>
					<input
						type="text"
						bind:value={tag2}
						placeholder="Secondary tag (optional)"
						maxlength="64"
						class="fb-input"
					/>
					<input
						type="text"
						bind:value={endpoint}
						placeholder="Endpoint tested (optional)"
						maxlength="128"
						class="fb-input"
					/>
					<div>
						<input
							type="text"
							bind:value={evidenceUri}
							placeholder="Evidence URI — ipfs:// or https://"
							maxlength="256"
							class="fb-input"
						/>
						<p class="mt-1 text-[10px] text-text-dim/50">
							Link to off-chain evidence (logs, payment proof). Hashed on-chain for integrity.
						</p>
					</div>
				</div>
			{/if}

			{#if wallet.networkMismatch}
				<p class="text-xs text-warning">Switch Freighter to the correct network</p>
			{/if}

			{#if status === 'error'}
				<p class="text-xs text-negative">{errorMsg}</p>
			{/if}

			<button
				onclick={submit}
				disabled={busy || wallet.networkMismatch}
				class="fb-submit"
			>
				{#if busy}
					<svg class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
						<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
						<path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
					Submitting...
				{:else}
					Submit Feedback
				{/if}
			</button>
		</div>
	{/if}
</div>

<style>
	.fb-form {
		--fb-negative: oklch(0.65 0.2 25);
		--fb-warning: oklch(0.7 0.16 55);
		--fb-caution: oklch(0.72 0.12 85);
		--fb-moderate: oklch(0.68 0.1 160);
		--fb-positive: oklch(0.65 0.14 145);
		--fb-excellent: oklch(0.62 0.18 155);

		border-radius: 0.75rem;
		border: 1px solid var(--color-border);
		background: var(--color-glass);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		overflow: hidden;
	}

	.fb-form__body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
	}

	.fb-success {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
	}

	.fb-success__icon {
		display: flex;
		height: 2rem;
		width: 2rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		background: oklch(0.65 0.15 145 / 0.1);
		color: var(--color-positive);
		flex-shrink: 0;
	}

	/* Score selector — segmented track */
	.fb-score {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.fb-score__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.fb-score__badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 600;
		color: var(--step-color);
	}

	.fb-score__badge-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--step-color);
		box-shadow: 0 0 8px var(--step-color);
	}

	.fb-score__badge-num {
		font-size: 11px;
		font-weight: 500;
		opacity: 0.6;
		font-variant-numeric: tabular-nums;
	}

	.fb-score__track {
		display: flex;
		gap: 3px;
		height: 44px;
		touch-action: none;
		user-select: none;
	}

	.fb-score__track--dragging {
		cursor: grabbing;
	}

	.fb-score__seg {
		flex: 1;
		position: relative;
		border: none;
		border-radius: 6px;
		background: var(--color-surface-raised);
		cursor: pointer;
		overflow: hidden;
		transition: transform 0.12s, box-shadow 0.2s;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 5px;
	}

	.fb-score__seg:hover {
		transform: scaleY(1.08);
		transform-origin: bottom;
	}

	.fb-score__seg:active {
		transform: scaleY(0.96);
	}

	.fb-score__seg-fill {
		position: absolute;
		inset: 0;
		border-radius: 6px;
		background: var(--step-color);
		opacity: 0;
		transition: opacity 0.2s;
	}

	.fb-score__seg--filled .fb-score__seg-fill {
		opacity: 0.15;
	}

	.fb-score__seg--active .fb-score__seg-fill {
		opacity: 0.35;
	}

	.fb-score__seg--active {
		box-shadow: 0 0 14px -3px var(--step-color), inset 0 0 0 1.5px color-mix(in srgb, var(--step-color) 50%, transparent);
	}

	.fb-score__seg:hover .fb-score__seg-fill {
		opacity: 0.22;
	}

	.fb-score__seg-label {
		position: relative;
		z-index: 1;
		font-size: 9px;
		font-weight: 500;
		color: var(--color-text-dim);
		opacity: 0;
		transition: opacity 0.15s;
		white-space: nowrap;
	}

	.fb-score__seg--active .fb-score__seg-label,
	.fb-score__seg:hover .fb-score__seg-label {
		opacity: 1;
		color: var(--step-color);
	}

	/* Tag pills */
	.fb-tags {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.fb-tags__list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.fb-tag {
		padding: 4px 12px;
		border-radius: 6px;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.fb-tag:hover {
		border-color: color-mix(in oklch, var(--color-accent) 30%, transparent);
		color: var(--color-text);
	}

	.fb-tag--active {
		border-color: color-mix(in oklch, var(--color-accent) 40%, transparent);
		background: color-mix(in oklch, var(--color-accent) 8%, transparent);
		color: var(--color-accent);
	}

	/* Advanced toggle */
	.fb-advanced-toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0;
		border: none;
		background: none;
		font-size: 11px;
		color: var(--color-text-dim);
		cursor: pointer;
		transition: color 0.15s;
		align-self: flex-start;
	}

	.fb-advanced-toggle:hover {
		color: var(--color-text-muted);
	}

	.fb-advanced {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.fb-input {
		width: 100%;
		padding: 8px 12px;
		border-radius: 8px;
		border: 1px solid var(--color-border);
		background: var(--color-surface-raised);
		font-size: 12px;
		color: var(--color-text-muted);
		transition: border-color 0.15s;
	}

	.fb-input::placeholder {
		color: var(--color-text-dim);
	}

	.fb-input:focus {
		border-color: color-mix(in oklch, var(--color-accent) 50%, transparent);
		outline: none;
	}

	/* Submit */
	.fb-submit {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		padding: 10px;
		border-radius: 8px;
		border: none;
		background: color-mix(in oklch, var(--color-accent) 10%, transparent);
		color: var(--color-accent);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}

	.fb-submit:hover:not(:disabled) {
		background: color-mix(in oklch, var(--color-accent) 16%, transparent);
	}

	.fb-submit:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
