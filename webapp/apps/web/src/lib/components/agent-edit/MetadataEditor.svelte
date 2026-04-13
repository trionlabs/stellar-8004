<script lang="ts">
	import type { AgentFormData, ServiceEntry, UriMode } from '$lib/types.js';
	import {
		buildMetadataJsonForEdit,
		getMetadataSize
	} from '@trionlabs/stellar8004';
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

	let openSections = $state(new Set(['basic']));

	function toggleSection(id: string) {
		if (openSections.has(id)) openSections.delete(id);
		else openSections.add(id);
	}

	const uriError = $derived.by(() => {
		if (!formData.name.trim()) return '';
		try {
			const json = buildMetadataJsonForEdit(formData, rawUriData);
			const size = getMetadataSize(json);
			const estimatedUriSize = 29 + Math.ceil(size * 4 / 3);
			if (estimatedUriSize > 8192) return `Metadata URI too large (~${estimatedUriSize} bytes). Max 8KB.`;
			return '';
		} catch (e) {
			return e instanceof Error ? e.message : 'Failed to build metadata';
		}
	});
</script>

<div class="space-y-3">
	<!-- Section: Basic Info -->
	<div class="rounded-xl border border-border overflow-hidden">
		<button type="button" onclick={() => toggleSection('basic')}
			class="flex w-full items-center justify-between px-5 py-3.5
			       bg-surface-raised/40 hover:bg-surface-raised/60 transition-colors">
			<div class="flex items-center gap-2.5">
				<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
				<span class="text-xs font-medium tracking-wide uppercase text-text-muted">Basic Info</span>
				{#if !formData.name.trim()}
					<span class="rounded-full bg-negative/8 px-1.5 py-px text-[9px] text-negative ring-1 ring-negative/12">Required</span>
				{/if}
			</div>
			<svg class="h-3.5 w-3.5 text-text-dim transition-transform duration-200 {openSections.has('basic') ? 'rotate-180' : ''}"
				fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
		{#if openSections.has('basic')}
			<div class="h-px bg-linear-to-r from-transparent via-accent/20 to-transparent"></div>
			<div class="px-5 py-5">
				<StepBasicInfo {formData} />
			</div>
		{/if}
	</div>

	<!-- Section: Services -->
	<div class="rounded-xl border border-border overflow-hidden">
		<button type="button" onclick={() => toggleSection('services')}
			class="flex w-full items-center justify-between px-5 py-3.5
			       bg-surface-raised/40 hover:bg-surface-raised/60 transition-colors">
			<div class="flex items-center gap-2.5">
				<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
				<span class="text-xs font-medium tracking-wide uppercase text-text-muted">Services</span>
				{#if formData.services.length > 0}
					<span class="rounded-full bg-accent/8 px-1.5 py-px text-[9px] text-accent">{formData.services.length}</span>
				{/if}
			</div>
			<svg class="h-3.5 w-3.5 text-text-dim transition-transform duration-200 {openSections.has('services') ? 'rotate-180' : ''}"
				fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
		{#if openSections.has('services')}
			<div class="h-px bg-linear-to-r from-transparent via-accent/20 to-transparent"></div>
			<div class="px-5 py-5">
				<StepServices services={formData.services} />
			</div>
		{/if}
	</div>

	<!-- Section: Trust & Payments -->
	<div class="rounded-xl border border-border overflow-hidden">
		<button type="button" onclick={() => toggleSection('advanced')}
			class="flex w-full items-center justify-between px-5 py-3.5
			       bg-surface-raised/40 hover:bg-surface-raised/60 transition-colors">
			<div class="flex items-center gap-2.5">
				<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
				<span class="text-xs font-medium tracking-wide uppercase text-text-muted">Trust & Payments</span>
			</div>
			<svg class="h-3.5 w-3.5 text-text-dim transition-transform duration-200 {openSections.has('advanced') ? 'rotate-180' : ''}"
				fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
		{#if openSections.has('advanced')}
			<div class="h-px bg-linear-to-r from-transparent via-accent/20 to-transparent"></div>
			<div class="px-5 py-5">
				<StepAdvanced supportedTrust={formData.supportedTrust} bind:x402Enabled={formData.x402Enabled} />
			</div>
		{/if}
	</div>

	<!-- Section: URI Settings - default CLOSED -->
	<div class="rounded-xl border border-border/60 overflow-hidden">
		<button type="button" onclick={() => toggleSection('uri')}
			class="flex w-full items-center justify-between px-5 py-3.5
			       bg-surface/60 hover:bg-surface-raised/40 transition-colors">
			<div class="flex items-center gap-2.5">
				<span class="h-1.5 w-1.5 rounded-full bg-text-dim/30"></span>
				<span class="text-xs font-medium tracking-wide uppercase text-text-dim">URI Settings</span>
				<span class="text-[10px] text-text-dim/50">URI storage mode</span>
			</div>
			<svg class="h-3.5 w-3.5 text-text-dim/50 transition-transform duration-200 {openSections.has('uri') ? 'rotate-180' : ''}"
				fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
		{#if openSections.has('uri')}
			<div class="h-px bg-linear-to-r from-transparent via-border/40 to-transparent"></div>
			<div class="px-5 py-5">
				<StepUri {formData} bind:uriMode bind:manualUri />
				{#if uriError}
					<div class="mt-3 flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12">
						<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
						</svg>
						<p class="text-xs text-negative">{uriError}</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
