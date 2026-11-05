<script lang="ts">
	import type { AgentFormData } from '$lib/types.js';
	import { validateUrl } from '@trionlabs/stellar8004';
	import AgentPreview from './AgentPreview.svelte';
	import { field } from './ui.js';

	let { formData }: { formData: AgentFormData } = $props();

	const imageError = $derived(validateUrl(formData.imageUrl));
	const isHttp = $derived(formData.imageUrl.startsWith('http://'));
</script>

<div class="space-y-10">
	<div aria-hidden="true"><AgentPreview {formData} /></div>

	<div class="space-y-6">
		<label class="block space-y-2">
			<span class="text-sm text-text-muted">Name</span>
			<input
				type="text"
				bind:value={formData.name}
				placeholder="DataAnalyst Pro"
				maxlength="256"
				required
				class={field}
			/>
		</label>

		<label class="block space-y-2">
			<span class="flex justify-between text-sm text-text-muted">
				<span>Description <span class="text-text-dim">optional</span></span>
				{#if formData.description.length > 1800}
					<span class="text-xs text-warning tabular-nums">{formData.description.length}/2048</span>
				{/if}
			</span>
			<textarea
				bind:value={formData.description}
				placeholder="What it does and for whom"
				maxlength="2048"
				rows="3"
				class="{field} resize-none"
			></textarea>
		</label>

		<label class="block space-y-2">
			<span class="text-sm text-text-muted"
				>Image URL <span class="text-text-dim">optional</span></span
			>
			<input
				type="text"
				inputmode="url"
				bind:value={formData.imageUrl}
				placeholder="https://… or ipfs://…"
				class="{field} {imageError ? 'ring-1 ring-negative/50' : ''}"
			/>
			{#if imageError}
				<span class="block text-xs text-negative">{imageError}</span>
			{:else if isHttp}
				<span class="block text-xs text-warning">Use https or ipfs so explorers can load it.</span>
			{/if}
		</label>
	</div>
</div>
