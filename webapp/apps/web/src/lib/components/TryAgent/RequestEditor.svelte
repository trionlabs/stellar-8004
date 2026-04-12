<script lang="ts">
	let {
		method = $bindable('GET'),
		body = $bindable(''),
		onsubmit,
		price,
		busy = false,
		disabled = false
	}: {
		method: string;
		body: string;
		onsubmit: () => void;
		price: string | null;
		busy?: boolean;
		disabled?: boolean;
	} = $props();

	const methods = ['POST', 'GET', 'PUT', 'DELETE'] as const;
	const showBody = $derived(method !== 'GET' && method !== 'HEAD');
</script>

<div class="space-y-3">
	<div class="flex items-center gap-2">
		<label class="text-[10px] uppercase tracking-wider text-text-dim" for="req-method">Method</label>
		<select
			id="req-method"
			bind:value={method}
			disabled={busy}
			class="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:border-accent/50 focus:outline-none"
		>
			{#each methods as m}
				<option value={m}>{m}</option>
			{/each}
		</select>
	</div>

	{#if showBody}
		<div class="space-y-1.5">
			<label class="text-[10px] uppercase tracking-wider text-text-dim" for="req-body">Body</label>
			<textarea
				id="req-body"
				bind:value={body}
				disabled={busy}
				placeholder={'Enter request body as JSON'}
				rows="4"
				class="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-text placeholder:text-text-dim/40 focus:border-accent/50 focus:outline-none resize-y"
			></textarea>
		</div>
	{/if}

	<div class="flex items-center gap-3">
		<button
			type="button"
			onclick={onsubmit}
			disabled={busy || disabled}
			class="rounded-lg border border-accent/30 bg-accent-fill px-4 py-2 text-sm font-medium text-accent
				   disabled:opacity-40 hover:bg-accent-fill-hover hover:border-accent/45 transition-colors"
		>
			{#if busy}
				<span class="inline-flex items-center gap-2">
					<svg class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
						<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
						<path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
					Processing...
				</span>
			{:else if price}
				Send & Pay {price}
			{:else}
				Send Request
			{/if}
		</button>
	</div>
</div>
