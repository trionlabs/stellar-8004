<script lang="ts">
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { explorerTxUrl } from '$lib/explorer.js';

	let {
		status,
		body,
		settlementTxHash = null
	}: {
		status: number;
		body: string;
		settlementTxHash?: string | null;
	} = $props();

	const statusColor = $derived(
		status >= 200 && status < 300
			? 'text-positive'
			: status >= 400
				? 'text-negative'
				: 'text-warning'
	);

	const formattedBody = $derived.by(() => {
		try {
			return JSON.stringify(JSON.parse(body), null, 2);
		} catch {
			return body;
		}
	});

	const isJson = $derived.by(() => {
		try {
			JSON.parse(body);
			return true;
		} catch {
			return false;
		}
	});
</script>

<div class="space-y-2">
	<div class="flex items-center gap-2">
		<span class="text-[10px] uppercase tracking-wider text-text-dim">Response</span>
		<span class="font-mono text-xs {statusColor}">{status}</span>
	</div>

	{#if formattedBody}
		<div class="max-h-80 overflow-y-auto">
			<CodeBlock code={formattedBody} lang={isJson ? 'json' : 'text'} />
		</div>
	{:else}
		<div class="rounded-lg border border-border bg-surface p-3 text-xs text-text-dim italic">
			Empty response body
		</div>
	{/if}

	{#if settlementTxHash}
		<div class="flex items-center gap-2 text-[10px] text-text-dim">
			<span>Settlement:</span>
			<a
				href={explorerTxUrl(settlementTxHash)}
				target="_blank"
				rel="noopener noreferrer"
				class="font-mono text-accent hover:underline"
			>
				{settlementTxHash.slice(0, 8)}...{settlementTxHash.slice(-8)}
			</a>
		</div>
	{/if}
</div>
