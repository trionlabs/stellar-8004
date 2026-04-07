<script lang="ts">
	type Step = { label: string; status: 'done' | 'active' | 'pending' };

	let {
		steps,
		txHash
	}: {
		steps: Step[];
		txHash?: string | null;
	} = $props();
</script>

<div class="rounded-xl border border-border bg-surface p-4 space-y-4">
	<h3 class="text-sm font-medium text-text">Updating Agent Metadata</h3>

	<div class="space-y-3">
		{#each steps as step (step.label)}
			<div class="flex items-center gap-3">
				{#if step.status === 'done'}
					<svg class="h-4 w-4 shrink-0 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
					<span class="text-sm text-positive">{step.label}</span>
				{:else if step.status === 'active'}
					<svg class="h-4 w-4 shrink-0 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
						<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
						<path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
					<span class="text-sm text-accent">{step.label}</span>
				{:else}
					<span class="h-4 w-4 shrink-0 rounded-full border-2 border-border"></span>
					<span class="text-sm text-text-dim">{step.label}</span>
				{/if}
			</div>
		{/each}
	</div>

	{#if txHash}
		<div class="rounded-lg border border-border bg-surface p-3">
			<p class="text-[10px] text-text-dim uppercase tracking-wider">Transaction</p>
			<a
				href="https://stellar.expert/explorer/testnet/tx/{txHash}"
				target="_blank"
				rel="noopener noreferrer"
				class="mt-1 block font-mono text-xs text-accent hover:underline break-all"
			>{txHash}</a>
		</div>
	{/if}
</div>
