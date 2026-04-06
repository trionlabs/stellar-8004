<script lang="ts">
	import type { AgentFormData, UriMode } from '$lib/types.js';
	import {
		buildMetadataJson,
		downloadMetadataJson,
		getMetadataSize,
		toDataUri
	} from '@trionlabs/8004s-sdk';

	let { formData, uriMode = $bindable(), manualUri = $bindable() }: { formData: AgentFormData; uriMode?: UriMode; manualUri?: string } = $props();

	const autoUri = $derived.by(() => {
		if (!formData.name.trim()) return '';
		try {
			return toDataUri(buildMetadataJson(formData));
		} catch {
			return '';
		}
	});
	const uriError = $derived.by(() => {
		if (!formData.name.trim()) return '';
		try {
			toDataUri(buildMetadataJson(formData));
			return '';
		} catch (e) {
			return e instanceof Error ? e.message : 'URI too large';
		}
	});
	const uriSize = $derived(formData.name.trim() ? getMetadataSize(buildMetadataJson(formData)) : 0);
	const uriPreview = $derived(autoUri ? autoUri.slice(0, 80) + '...' : '');

	function switchMode(mode: UriMode) {
		uriMode = mode;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
		<div>
			<p class="text-sm font-medium text-text">Download Metadata</p>
			<p class="text-[11px] text-text-dim">Download your agent metadata as a JSON file for backup or self-hosting</p>
		</div>
		<button
			type="button"
			onclick={() => downloadMetadataJson(buildMetadataJson(formData))}
			disabled={!formData.name.trim()}
			class="shrink-0 rounded-xl border border-accent/20 bg-accent/5 px-4 py-2 text-xs font-medium text-accent disabled:opacity-40 hover:bg-accent/10 transition-colors"
		>
			Download JSON
		</button>
	</div>

	<div class="flex gap-2">
		<button
			type="button"
			onclick={() => switchMode('auto')}
			class="rounded-xl border px-4 py-2 text-xs font-medium transition-colors
				{uriMode === 'auto' ? 'border-accent bg-accent/8 text-accent' : 'border-border text-text-muted hover:bg-surface-raised'}"
		>
			Auto (Data URI)
		</button>
		<button
			type="button"
			onclick={() => switchMode('manual')}
			class="rounded-xl border px-4 py-2 text-xs font-medium transition-colors
				{uriMode === 'manual' ? 'border-accent bg-accent/8 text-accent' : 'border-border text-text-muted hover:bg-surface-raised'}"
		>
			Manual URL
		</button>
	</div>

	{#if uriMode === 'auto'}
		<div class="space-y-4">
			<div class="flex items-center gap-2.5 rounded-xl bg-positive/5 px-4 py-3 ring-1 ring-positive/10">
				<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
				<p class="text-xs text-text-muted">
					We'll automatically convert your metadata to a base64-encoded data URI and store it directly on-chain.
				</p>
			</div>

			{#if uriError}
				<div class="flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12">
					<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
					<p class="text-xs text-negative">{uriError}</p>
				</div>
			{:else if formData.name.trim()}
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-text-muted">Metadata Size</span>
						<span class="text-[11px] font-mono text-text-dim">{uriSize} B</span>
					</div>
					<div class="rounded-lg border border-border bg-surface p-3">
						<p class="truncate font-mono text-[11px] text-text-dim">{uriPreview}</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<span class="rounded-full bg-positive/5 px-2.5 py-0.5 text-[10px] text-positive">Recommended</span>
						<span class="rounded-full bg-accent/5 px-2.5 py-0.5 text-[10px] text-accent">On-chain storage</span>
						<span class="rounded-full bg-accent/5 px-2.5 py-0.5 text-[10px] text-accent">No external dependencies</span>
					</div>
				</div>
			{:else}
				<p class="text-xs text-text-dim">Enter an agent name to generate the data URI preview.</p>
			{/if}
		</div>
	{:else}
		<div class="space-y-3">
			<div class="flex items-center gap-2.5 rounded-xl bg-warning/6 px-4 py-3 ring-1 ring-warning/10">
				<span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
				<p class="text-xs text-text-muted">
					Make sure the URL is publicly accessible. The indexer will attempt to resolve it within 5 minutes.
				</p>
			</div>
			<input
				type="text"
				bind:value={manualUri}
				placeholder="https://... or ipfs://..."
				class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors"
			/>
		</div>
	{/if}
</div>
