<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { registerAgent } from '$lib/contracts.js';
	import { getStellarConfig } from '$lib/stellar.js';
	import { wallet } from '$lib/wallet.svelte.js';
	import { buildMetadataJson, toDataUri } from '$lib/metadata.js';
	import type { AgentFormData, UriMode } from '$lib/types.js';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import Stepper from '$lib/components/Stepper.svelte';
	import StepBasicInfo from '$lib/components/register/StepBasicInfo.svelte';
	import StepServices from '$lib/components/register/StepServices.svelte';
	import StepAdvanced from '$lib/components/register/StepAdvanced.svelte';
	import StepUri from '$lib/components/register/StepUri.svelte';
	import StepReview from '$lib/components/register/StepReview.svelte';

	const STEPS = [
		{ label: 'Basic Info' },
		{ label: 'Services' },
		{ label: 'Advanced' },
		{ label: 'URI' },
		{ label: 'Review' }
	];

	const STORAGE_KEY = 'registration-form';

	let currentStep = $state(0);
	let showQuickMode = $state(false);

	let formData = $state<AgentFormData>({
		name: '',
		description: '',
		imageUrl: '',
		services: [],
		supportedTrust: [],
		x402Enabled: false
	});

	let uriMode = $state<UriMode>('auto');
	let manualUri = $state('');
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');

	const saved = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
	if (saved) {
		try {
			const parsed = JSON.parse(saved);
			Object.assign(formData, parsed);
		} catch {
			sessionStorage.removeItem(STORAGE_KEY);
		}
	}

	$effect(() => {
		if (typeof window !== 'undefined' && status !== 'success') {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
		}
	});

	const canProceed = $derived.by(() => {
		switch (currentStep) {
			case 0: return formData.name.trim().length > 0;
			case 1: return true;
			case 2: return true;
			case 3: return uriMode === 'auto' || manualUri.trim().length > 0;
			case 4: return wallet.connected && !wallet.networkMismatch;
			default: return false;
		}
	});

	function next() {
		if (currentStep < STEPS.length - 1 && canProceed) currentStep++;
	}

	function back() {
		if (currentStep > 0) currentStep--;
	}

	async function submit() {
		status = 'submitting';
		errorMsg = '';

		try {
			const uri = uriMode === 'auto'
				? toDataUri(buildMetadataJson(formData))
				: manualUri.trim();

			const agentUri = uri || undefined;
			const result = await registerAgent(agentUri);
			status = 'success';
			sessionStorage.removeItem(STORAGE_KEY);
			await goto(`/agents/${result.agentId}?registered=true&tx=${result.hash}`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Registration failed';
			status = 'error';
		}
	}

	async function submitQuick(agentUri: string) {
		status = 'submitting';
		errorMsg = '';

		try {
			const result = await registerAgent(agentUri.trim() || undefined);
			status = 'success';
			await goto(`/agents/${result.agentId}?registered=true&tx=${result.hash}`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Registration failed';
			status = 'error';
		}
	}
</script>

<svelte:head>
	<title>Register Agent — Stellar8004</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-8">
	<div class="space-y-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2.5">
				<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
				<span class="text-[11px] tracking-[0.25em] text-text-muted uppercase">Agent Registration</span>
			</div>
			{#if !showQuickMode}
				<div class="text-xs text-text-muted">
					Already have a metadata URL?
					<button type="button" onclick={() => { showQuickMode = true; currentStep = 0; }} class="text-accent underline">Quick register</button>
				</div>
			{/if}
		</div>
		<h1 class="text-2xl font-light tracking-tight text-text sm:text-3xl">Register your agent</h1>
		<p class="text-sm text-text-muted">
			Register your autonomous agent on the 8004 for Stellar registry
		</p>
	</div>

	{#if !wallet.connected && currentStep > 0 && !showQuickMode}
		<div class="rounded-xl bg-warning/6 px-4 py-2 text-xs text-warning">
			Wallet not connected — you'll need it to submit.
			<button type="button" onclick={() => wallet.connect()} class="underline">Connect now</button>
		</div>
	{/if}

	{#if showQuickMode}
		<div class="space-y-6">
			<div class="rounded-2xl border border-border bg-surface-raised/40 overflow-hidden">
				<div class="h-px bg-linear-to-r from-transparent via-accent/50 to-transparent"></div>
				<div class="p-8 sm:p-10 space-y-6">
					{#if !wallet.connected}
						<CtaButton onclick={() => wallet.connect()} disabled={wallet.loading} size="md" full>
							{wallet.loading ? 'Connecting...' : 'Connect Wallet'}
						</CtaButton>
					{:else}
						{#if wallet.networkMismatch}
							<div class="flex items-center gap-2.5 rounded-xl bg-warning/6 px-4 py-3 ring-1 ring-warning/12">
								<span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
								<p class="text-xs text-warning">
									Switch to <span class="font-medium uppercase">{getStellarConfig().network}</span> in Freighter
								</p>
							</div>
						{:else}
							<div class="flex items-center justify-between rounded-xl bg-positive/5 px-4 py-3 ring-1 ring-positive/10">
								<div class="flex items-center gap-2.5">
									<span class="h-1.5 w-1.5 rounded-full bg-positive animate-pulse"></span>
									<p class="text-xs text-positive">{getStellarConfig().network}</p>
								</div>
								<p class="truncate pl-4 font-mono text-[11px] text-text-dim">{wallet.address?.slice(0, 8)}...{wallet.address?.slice(-6)}</p>
							</div>
						{/if}

						<div class="space-y-2">
							<label class="text-xs font-medium text-text-muted" for="quick-uri">Metadata URI</label>
							<input
								id="quick-uri"
								type="text"
								bind:value={manualUri}
								placeholder="https://... or ipfs://..."
								class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors"
							/>
							<p class="text-[10px] text-text-dim">JSON with name, description, image, services</p>
						</div>

						<CtaButton onclick={() => submitQuick(manualUri)} disabled={status === 'submitting' || wallet.networkMismatch} size="md" full>
							{#if status === 'submitting'}
								<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" /><path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
								Registering...
							{:else}
								Register on Stellar
							{/if}
						</CtaButton>

						{#if status === 'error'}
							<div class="flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12">
								<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
								<p class="text-xs text-negative">{errorMsg}</p>
							</div>
						{/if}
					{/if}
				</div>
				<div class="h-px bg-linear-to-r from-transparent via-accent/20 to-transparent"></div>
			</div>
			<a href={resolve('/')} class="inline-flex items-center gap-2 text-xs text-text-muted hover:text-text">← Cancel and go home</a>
		</div>
	{:else}
		<Stepper steps={STEPS} {currentStep} />

		<div class="rounded-2xl border border-border bg-surface-raised/40 overflow-hidden">
			<div class="h-px bg-linear-to-r from-transparent via-accent/50 to-transparent"></div>

			<div class="p-8 sm:p-10">
				{#if currentStep === 0}
					<StepBasicInfo {formData} />
				{:else if currentStep === 1}
					<StepServices services={formData.services} />
				{:else if currentStep === 2}
					<StepAdvanced supportedTrust={formData.supportedTrust} bind:x402Enabled={formData.x402Enabled} />
				{:else if currentStep === 3}
					<StepUri {formData} bind:uriMode bind:manualUri />
				{:else if currentStep === 4}
					<StepReview {formData} {uriMode} {manualUri} {status} {errorMsg} onSubmit={submit} />
				{/if}
			</div>

			<div class="h-px bg-linear-to-r from-transparent via-accent/20 to-transparent"></div>
		</div>

		{#if currentStep < 4}
			<div class="flex items-center justify-between">
				{#if currentStep > 0}
					<button type="button" onclick={back}
						class="flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm text-text-muted hover:bg-surface-raised transition-colors">
						← Back
					</button>
				{:else}
					<a href={resolve('/')} class="flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm text-text-muted hover:bg-surface-raised transition-colors">
						Cancel
					</a>
				{/if}

				<button type="button" onclick={next} disabled={!canProceed}
					class="rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent/90 transition-colors">
					Next: {STEPS[currentStep + 1]?.label} →
				</button>
			</div>
		{/if}
	{/if}

	<div class="flex items-center justify-center gap-4 text-xs text-text-dim">
		<span class="flex items-center gap-1.5">
			<svg class="h-3.5 w-3.5 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
			8004 for Stellar
		</span>
		<span class="h-3 w-px bg-border"></span>
		<span class="flex items-center gap-1.5">
			<svg class="h-3.5 w-3.5 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
			Soroban
		</span>
		<span class="h-3 w-px bg-border"></span>
		<span class="flex items-center gap-1.5">
			<svg class="h-3.5 w-3.5 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
			No fees
		</span>
	</div>
</div>
