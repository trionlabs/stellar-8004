<script lang="ts">
	import { sanitizeImageUrl } from '$lib/formatters.js';
	import type { AgentFormData, UriMode } from '$lib/types.js';
	import { wallet } from '$lib/wallet.svelte.js';
	import { stellarConfig } from '$lib/sdk-client.js';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import StarIdenticon from '$lib/components/StarIdenticon.svelte';

	let { formData, uriMode, manualUri, status, errorMsg, onSubmit }: {
		formData: AgentFormData;
		uriMode: UriMode;
		manualUri: string;
		status: 'idle' | 'submitting' | 'success' | 'error';
		errorMsg: string;
		onSubmit: () => void;
	} = $props();

	const hasName = $derived(formData.name.trim().length > 0);
	const descPreview = $derived(formData.description.length > 120 ? formData.description.slice(0, 120) + '...' : formData.description);
	const finalUri = $derived(uriMode === 'auto' ? '(auto-generated data URI)' : manualUri);
</script>

<div class="space-y-6">
	{#if !wallet.connected}
		<div class="space-y-4">
			<div class="flex items-center gap-2.5 rounded-xl bg-warning/6 px-4 py-3 ring-1 ring-warning/12">
				<span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
				<p class="text-sm text-warning">Connect your wallet to register</p>
			</div>
			<CtaButton onclick={() => wallet.connect()} disabled={wallet.loading} size="md" full>
				{wallet.loading ? 'Connecting...' : 'Connect Wallet'}
			</CtaButton>
		</div>
	{/if}

	{#if hasName}
		<div class="space-y-4">
			<div class="rounded-xl border border-border bg-surface p-4 space-y-3">
				<h3 class="text-[10px] tracking-[0.15em] text-text-muted uppercase">Basic Information</h3>
				<div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-raised">
					{#if formData.imageUrl}
						<img src={sanitizeImageUrl(formData.imageUrl)} alt="" class="h-full w-full object-cover" />
					{:else if wallet.address}
						<StarIdenticon seed={wallet.address ?? 'preview'} size={48} />
					{/if}
				</div>
				<div>
					<p class="text-sm font-medium text-text">{formData.name}</p>
					{#if descPreview}<p class="text-xs text-text-muted mt-1">{descPreview}</p>{/if}
				</div>
			</div>

			<div class="rounded-xl border border-border bg-surface p-4 space-y-2">
				<h3 class="text-[10px] tracking-[0.15em] text-text-muted uppercase">Services ({formData.services.length})</h3>
				{#if formData.services.length > 0}
					{#each formData.services as svc (svc.endpoint)}
						<div class="flex items-center gap-2 text-xs">
							<span class="rounded bg-accent/8 px-1.5 py-0.5 text-[10px] text-accent">{svc.name}</span>
							<span class="truncate font-mono text-text-dim">{svc.endpoint}</span>
							{#if svc.version}<span class="text-text-dim">v{svc.version}</span>{/if}
						</div>
					{/each}
				{:else}
					<p class="text-xs text-text-dim">No services configured</p>
				{/if}
			</div>

			<div class="rounded-xl border border-border bg-surface p-4 space-y-2">
				<h3 class="text-[10px] tracking-[0.15em] text-text-muted uppercase">Advanced Options</h3>
				{#if formData.supportedTrust.length > 0}
					<div class="flex flex-wrap gap-1.5">
						{#each formData.supportedTrust as trust (trust)}
							<span class="rounded-full bg-positive/5 px-2 py-0.5 text-[10px] text-positive">{trust}</span>
						{/each}
					</div>
				{:else}
					<p class="text-xs text-text-dim">No trust mechanisms selected</p>
				{/if}
				<p class="text-xs text-text-dim">x402 Payment: {formData.x402Enabled ? 'Enabled' : 'Disabled'}</p>
				<p class="text-xs text-text-dim">MPP Charge: {formData.mppEnabled ? 'Enabled' : 'Disabled'}</p>
			</div>

			<div class="rounded-xl border border-border bg-surface p-4 space-y-2">
				<h3 class="text-[10px] tracking-[0.15em] text-text-muted uppercase">Metadata URI</h3>
				{#if uriMode === 'auto'}
					<span class="rounded-full bg-positive/5 px-2 py-0.5 text-[10px] text-positive">Auto-generated</span>
				{:else}
					<p class="truncate font-mono text-[11px] text-text-dim">{finalUri}</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if wallet.connected && wallet.networkMismatch}
		<div class="flex items-center gap-2.5 rounded-xl bg-warning/6 px-4 py-3 ring-1 ring-warning/12">
			<span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
			<p class="text-xs text-warning">
				Switch to <span class="font-medium uppercase">{stellarConfig.network}</span> in Freighter
			</p>
		</div>
	{/if}

	{#if wallet.connected}
		<div class="flex items-center gap-2.5 rounded-xl bg-positive/5 px-4 py-3 ring-1 ring-positive/10">
			<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
			<p class="text-xs text-text-muted">
				Click "Register Agent" to submit to the 8004 for Stellar registry. This will require a blockchain transaction.
			</p>
		</div>
	{/if}

	{#if status === 'error'}
		<div class="flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12">
			<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<p class="text-xs text-negative">{errorMsg}</p>
		</div>
	{/if}

	{#if wallet.connected}
		<CtaButton onclick={onSubmit} disabled={!hasName || status === 'submitting' || wallet.networkMismatch} size="md" full>
			{#if status === 'submitting'}
				<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
					<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
					<path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
				Registering...
			{:else}
				Register Agent
			{/if}
		</CtaButton>
	{/if}
</div>
