<script lang="ts">
	import type { AgentFormData, UriMode } from '$lib/types.js';
	import {
		buildMetadataJson,
		downloadMetadataJson,
		getMetadataSize,
		toDataUri
	} from '@trionlabs/stellar8004';
	import RegisterIcon from './RegisterIcon.svelte';
	import { field } from './ui.js';

	let {
		formData,
		uriMode = $bindable(),
		manualUri = $bindable()
	}: { formData: AgentFormData; uriMode: UriMode; manualUri: string } = $props();

	const hasName = $derived(formData.name.trim().length > 0);
	const metadata = $derived.by(() => {
		if (!hasName) return { size: 0, error: '' };
		const json = buildMetadataJson(formData);
		try {
			toDataUri(json);
			return { size: getMetadataSize(json), error: '' };
		} catch (e) {
			return { size: 0, error: e instanceof Error ? e.message : 'Metadata is too large' };
		}
	});

	const link = 'inline-flex items-center gap-1.5 transition-colors hover:text-text';
</script>

{#if uriMode === 'auto'}
	<div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-dim">
		{#if metadata.error}
			<span class="text-negative">{metadata.error}</span>
		{:else if hasName}
			<span>Stored on-chain · {metadata.size} B</span>
		{/if}
		<button
			type="button"
			onclick={() => downloadMetadataJson(buildMetadataJson(formData))}
			disabled={!hasName}
			class="{link} disabled:opacity-40"
		>
			<RegisterIcon name="download" />JSON
		</button>
		<button type="button" onclick={() => (uriMode = 'manual')} class={link}>
			<RegisterIcon name="link" />Use my own URL
		</button>
	</div>
{:else}
	<div class="space-y-4">
		<label class="block space-y-2">
			<span class="text-sm text-text-muted">Metadata URL</span>
			<input
				type="text"
				inputmode="url"
				bind:value={manualUri}
				placeholder="https://… or ipfs://…"
				class={field}
			/>
		</label>
		<p class="text-sm text-text-dim">
			<button type="button" onclick={() => (uriMode = 'auto')} class={link}>
				<RegisterIcon name="back" />Build it from the form
			</button>
		</p>
	</div>
{/if}
