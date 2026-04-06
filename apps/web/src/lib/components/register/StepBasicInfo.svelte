<script lang="ts">
	import type { AgentFormData } from '$lib/types.js';
	import { validateUrl } from '$lib/metadata.js';

	let { formData }: { formData: AgentFormData } = $props();

	const nameCount = $derived(formData.name.length);
	const descCount = $derived(formData.description.length);

	const imageError = $derived(validateUrl(formData.imageUrl));
	const isHttp = $derived(formData.imageUrl.startsWith('http://'));
</script>

<div class="space-y-6">
	<div class="space-y-2">
		<label class="text-xs font-medium text-text-muted" for="agent-name">
			Agent Name <span class="text-negative">*</span>
		</label>
		<input
			id="agent-name"
			type="text"
			bind:value={formData.name}
			placeholder="DataAnalyst Pro"
			maxlength="256"
			class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors"
		/>
		<div class="flex items-center justify-between">
			<p class="text-[10px] text-text-dim">Keep it clear, memorable, and descriptive</p>
			<span class="text-[10px] {nameCount > 240 ? 'text-warning' : 'text-text-dim'}">{nameCount}/256</span>
		</div>
	</div>

	<div class="space-y-2">
		<label class="text-xs font-medium text-text-muted" for="agent-desc">Description</label>
		<textarea
			id="agent-desc"
			bind:value={formData.description}
			placeholder="Explain what your agent does, how it works, what problems it solves..."
			maxlength="2048"
			rows="4"
			class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors resize-none"
		></textarea>
		<div class="flex items-center justify-between">
			<p class="text-[10px] text-text-dim">Optional — helps users understand your agent</p>
			<span class="text-[10px] {descCount > 1900 ? 'text-warning' : 'text-text-dim'}">{descCount}/2048</span>
		</div>
	</div>

	<div class="space-y-2">
		<label class="text-xs font-medium text-text-muted" for="agent-image">Agent Image</label>
		<input
			id="agent-image"
			type="text"
			bind:value={formData.imageUrl}
			placeholder="https://cdn.example.com/agent.png or ipfs://..."
			class="w-full rounded-xl border {imageError ? 'border-negative' : 'border-border'} bg-surface px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors"
		/>
		{#if imageError}
			<p class="text-[10px] text-negative">{imageError}</p>
		{:else if isHttp}
			<p class="text-[10px] text-warning">HTTP URLs may not be accessible from the indexer. Use HTTPS or IPFS for production.</p>
		{:else}
			<p class="text-[10px] text-text-dim">High-quality image (PNG, SVG, or WebP recommended). Supports HTTP, HTTPS, or IPFS URLs.</p>
		{/if}
	</div>
</div>
