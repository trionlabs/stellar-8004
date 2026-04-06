<script lang="ts">
	import type { AgentFormData, ServiceEntry, UriMode } from '$lib/types.js';
	import { buildMetadataJsonForEdit, getMetadataSize } from '$lib/metadata.js';
	import StepBasicInfo from '$lib/components/register/StepBasicInfo.svelte';
	import StepServices from '$lib/components/register/StepServices.svelte';
	import StepAdvanced from '$lib/components/register/StepAdvanced.svelte';
	import StepUri from '$lib/components/register/StepUri.svelte';

	let {
		formData,
		uriMode = $bindable(),
		manualUri = $bindable(),
		rawUriData
	}: {
		formData: AgentFormData;
		uriMode?: UriMode;
		manualUri?: string;
		rawUriData: Record<string, unknown>;
	} = $props();

	let activeSection = $state<'basic' | 'services' | 'advanced' | 'uri'>('basic');

	const sections = [
		{ id: 'basic' as const, label: 'Basic Info' },
		{ id: 'services' as const, label: 'Services' },
		{ id: 'advanced' as const, label: 'Advanced' },
		{ id: 'uri' as const, label: 'URI Mode' }
	];

	const uriError = $derived.by(() => {
		if (!formData.name.trim()) return '';
		try {
			const json = buildMetadataJsonForEdit(formData, rawUriData);
			const size = getMetadataSize(json);
			// data:application/json;base64, prefix (29 chars) + base64 overhead (~1.37x)
			const estimatedUriSize = 29 + Math.ceil(size * 4 / 3);
			if (estimatedUriSize > 8192) return `Metadata URI too large (~${estimatedUriSize} bytes). Max 8KB.`;
			return '';
		} catch (e) {
			return e instanceof Error ? e.message : 'Failed to build metadata';
		}
	});
</script>

<div class="space-y-6">
	<div class="flex gap-2 border-b border-border">
		{#each sections as section (section.id)}
			<button
				type="button"
				onclick={() => activeSection = section.id}
				class="rounded-t-lg px-4 py-2 text-xs font-medium transition-colors
					{activeSection === section.id
						? 'border-b-2 border-accent text-accent'
						: 'text-text-muted hover:text-text'}"
			>
				{section.label}
			</button>
		{/each}
	</div>

	{#if activeSection === 'basic'}
		<StepBasicInfo {formData} />
	{:else if activeSection === 'services'}
		<StepServices services={formData.services} />
	{:else if activeSection === 'advanced'}
		<StepAdvanced
			supportedTrust={formData.supportedTrust}
			bind:x402Enabled={formData.x402Enabled}
		/>
	{:else if activeSection === 'uri'}
		<StepUri {formData} bind:uriMode bind:manualUri />
		{#if uriError}
			<div class="mt-3 flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12">
				<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
				</svg>
				<p class="text-xs text-negative">{uriError}</p>
			</div>
		{/if}
	{/if}
</div>
