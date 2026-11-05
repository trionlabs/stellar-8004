<script lang="ts">
	import type { AgentFormData } from '$lib/types.js';
	import { validateUrl } from '@trionlabs/stellar8004';
	import RegisterIcon, { serviceIcon, type IconName } from './RegisterIcon.svelte';
	import { TRUST_OPTIONS } from './StepAdvanced.svelte';

	let { formData }: { formData: AgentFormData } = $props();

	// Only https images load here (CSP img-src); a failed load falls back to the placeholder.
	let brokenUrl = $state('');
	const image = $derived(
		!validateUrl(formData.imageUrl) &&
			formData.imageUrl.startsWith('https://') &&
			brokenUrl !== formData.imageUrl
			? formData.imageUrl
			: ''
	);

	const tags = $derived<{ icon: IconName; label: string }[]>([
		...formData.services.map((s) => ({ icon: serviceIcon(s.name), label: s.name })),
		...TRUST_OPTIONS.filter((t) => formData.supportedTrust.includes(t.value)).map((t) => ({
			icon: t.value,
			label: t.label
		})),
		...(formData.x402Enabled ? [{ icon: 'x402' as const, label: 'x402' }] : []),
		...(formData.mppEnabled ? [{ icon: 'mpp' as const, label: 'MPP' }] : [])
	]);
</script>

<div class="flex items-start gap-4">
	<div
		class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-overlay text-text-dim"
	>
		{#if image}
			<img
				src={image}
				alt=""
				class="h-full w-full object-cover"
				onerror={() => (brokenUrl = image)}
			/>
		{:else}
			<RegisterIcon name="image" class="h-5 w-5" />
		{/if}
	</div>
	<div class="min-w-0 flex-1 space-y-1 pt-0.5">
		<p class="truncate text-lg {formData.name ? 'text-text' : 'text-text-dim'}">
			{formData.name || 'Your agent'}
		</p>
		<p class="line-clamp-2 text-sm text-text-dim">
			{formData.description || 'What it does, in one line'}
		</p>
		{#if tags.length}
			<ul class="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-text-muted">
				{#each tags as tag, i (i)}
					<li class="flex items-center gap-1.5">
						<RegisterIcon name={tag.icon} class="h-3.5 w-3.5" />{tag.label}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
