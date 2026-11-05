<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { wallet } from '$lib/wallet.svelte.js';
	import { getClients, stellarConfig } from '$lib/sdk-client.js';
	import {
		buildMetadataJson,
		toDataUri,
		validateAgentUri,
		formatSorobanError
	} from '@trionlabs/stellar8004';
	import type { AgentFormData, UriMode } from '$lib/types.js';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import Stepper from '$lib/components/Stepper.svelte';
	import StepBasicInfo from '$lib/components/register/StepBasicInfo.svelte';
	import StepServices from '$lib/components/register/StepServices.svelte';
	import StepAdvanced from '$lib/components/register/StepAdvanced.svelte';
	import StepUri from '$lib/components/register/StepUri.svelte';
	import StepReview from '$lib/components/register/StepReview.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const STEPS = [
		{ label: 'Basic Info' },
		{ label: 'Services' },
		{ label: 'Advanced' },
		{ label: 'URI' },
		{ label: 'Review' }
	];

	// Single sessionStorage key per origin. If a user opens the registration
	// form in two tabs, both tabs share this key and the second one to write
	// wins. This is a known UX limitation, not a data-loss bug - sessionStorage
	// is per-tab in modern browsers, so each tab actually has its own storage
	// scope, and the only failure mode is that draft state from one tab is
	// not visible in another. Accept and document.
	const STORAGE_KEY = 'registration-form';

	let currentStep = $state(0);
	let showQuickMode = $state(false);

	let formData = $state<AgentFormData>({
		name: '',
		description: '',
		imageUrl: '',
		services: [],
		supportedTrust: [],
		x402Enabled: false,
		mppEnabled: false
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

	// A saved draft means the person was filling the form: reopen it there.
	let mode = $state<'agent' | 'form'>(formData.name ? 'form' : 'agent');
	const guideUrl = $derived(`${page.url.origin}/skill.md`);
	const agentPrompt = $derived(`Read ${guideUrl} and register yourself on Stellar8004.`);
	let copied = $state(false);
	let promptEl: HTMLElement | undefined = $state();

	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(agentPrompt);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch {
			// Clipboard blocked: select the line so a manual copy takes exactly it.
			if (promptEl) window.getSelection()?.selectAllChildren(promptEl);
		}
	}

	$effect(() => {
		if (typeof window !== 'undefined' && status !== 'success') {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
		}
	});

	const canProceed = $derived.by(() => {
		switch (currentStep) {
			case 0:
				return formData.name.trim().length > 0;
			case 1:
				return true;
			case 2:
				return true;
			case 3:
				return uriMode === 'auto' || manualUri.trim().length > 0;
			case 4:
				return wallet.connected && !wallet.networkMismatch;
			default:
				return false;
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
			const caller = wallet.address;
			if (!caller) {
				errorMsg = 'Wallet disconnected. Reconnect and try again.';
				status = 'error';
				return;
			}

			const uri = uriMode === 'auto' ? toDataUri(buildMetadataJson(formData)) : manualUri.trim();

			const agentUri = uri || undefined;
			if (agentUri) validateAgentUri(agentUri);
			const { identity } = getClients();
			const tx = agentUri
				? await identity.register_with_uri({ caller, agent_uri: agentUri })
				: await identity.register({ caller });
			const sent = await tx.signAndSend();
			const agentId = sent.result;
			const txHash = sent.sendTransactionResponse?.hash ?? '';
			status = 'success';
			sessionStorage.removeItem(STORAGE_KEY);
			await goto(resolve(`/agents/${agentId}?registered=true&tx=${txHash}`));
		} catch (err) {
			errorMsg = formatSorobanError(err, 'identity');
			status = 'error';
		}
	}

	async function submitQuick(agentUri: string) {
		status = 'submitting';
		errorMsg = '';

		try {
			const caller = wallet.address;
			if (!caller) {
				errorMsg = 'Wallet disconnected. Reconnect and try again.';
				status = 'error';
				return;
			}

			const trimmedUri = agentUri.trim() || undefined;
			if (trimmedUri) validateAgentUri(trimmedUri);
			const { identity } = getClients();
			const tx = trimmedUri
				? await identity.register_with_uri({ caller, agent_uri: trimmedUri })
				: await identity.register({ caller });
			const sent = await tx.signAndSend();
			const resultAgentId = sent.result;
			const txHash = sent.sendTransactionResponse?.hash ?? '';
			status = 'success';
			await goto(resolve(`/agents/${resultAgentId}?registered=true&tx=${txHash}`));
		} catch (err) {
			errorMsg = formatSorobanError(err, 'identity');
			status = 'error';
		}
	}
</script>

<svelte:head>
	<title>Register Agent - Stellar8004</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-8">
	{#if mode === 'agent'}
		<section class="enter space-y-9 pt-6 sm:pt-20">
			<h1 class="text-[30px] leading-tight font-light tracking-[-0.015em] text-text sm:text-[40px]">
				Give this to your agent
			</h1>

			<div class="space-y-3">
				<button
					type="button"
					onclick={copyPrompt}
					title="Copy"
					data-frame
					class="group flex w-full items-start gap-3 rounded-2xl bg-surface-raised px-4 py-4 text-left transition-colors hover:bg-surface-overlay focus-visible:ring-1 focus-visible:ring-accent/50 focus-visible:outline-none sm:gap-4 sm:px-6 sm:py-5"
				>
					<code
						bind:this={promptEl}
						class="min-w-0 flex-1 font-mono text-[12px] leading-relaxed [overflow-wrap:anywhere] text-text sm:text-sm"
						><span class="block">Read {guideUrl}</span><span class="block"
							>and register yourself on Stellar8004.</span
						></code
					>
					<span
						aria-hidden="true"
						class="mt-0.5 shrink-0 transition-colors {copied
							? 'text-positive'
							: 'text-text-dim group-hover:text-text'}"
					>
						{#if copied}
							<svg
								class="h-4 w-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								><path
									d="M5 12.5l4.5 4.5L19 7.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/></svg
							>
						{:else}
							<svg
								class="h-4 w-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								><rect x="8" y="8" width="12" height="12" rx="2.5" /><path
									d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"
								/></svg
							>
						{/if}
					</span>
				</button>
				<p class="text-sm text-text-muted" aria-live="polite">
					{#if copied}
						Copied. Paste it into your agent.
					{:else}
						Reads the
						<!-- /skill.md is served by hooks.server.ts, not a route, so resolve() cannot type it. -->
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={guideUrl}
							class="text-text-muted underline decoration-border underline-offset-4 hover:text-text"
							>guide</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						and registers itself · ~2&nbsp;XLM
					{/if}
				</p>
			</div>

			<p class="pt-10 text-sm text-text-dim">
				<button type="button" onclick={() => (mode = 'form')} class="hover:text-text"
					>Fill the form instead</button
				>
				<span class="px-2" aria-hidden="true">·</span>
				<a href={resolve('/developers')} class="hover:text-text">SDK docs</a>
			</p>
		</section>
	{:else}
		<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
			<h1 class="text-2xl font-light tracking-tight text-text sm:text-3xl">Register an agent</h1>
			<button
				type="button"
				onclick={() => (mode = 'agent')}
				class="text-sm text-text-dim hover:text-text"
			>
				Give it to your agent instead
			</button>
		</div>

		{#if !showQuickMode}
			<p class="text-xs text-text-muted">
				Already have a metadata URL?
				<button
					type="button"
					onclick={() => {
						showQuickMode = true;
						currentStep = 0;
					}}
					class="text-accent underline">Quick register</button
				>
			</p>
		{/if}

		{#if !wallet.connected && currentStep > 0 && !showQuickMode}
			<div class="rounded-xl bg-warning/6 px-4 py-2 text-xs text-warning">
				Wallet not connected - you'll need it to submit.
				<button type="button" onclick={() => wallet.connect()} class="underline">Connect now</button
				>
			</div>
		{/if}

		{#if showQuickMode}
			<div class="space-y-6">
				<div class="overflow-hidden rounded-2xl border border-border bg-surface-raised/40">
					<div class="h-px bg-linear-to-r from-transparent via-accent/50 to-transparent"></div>
					<div class="space-y-6 p-8 sm:p-10">
						{#if !wallet.connected}
							<CtaButton onclick={() => wallet.connect()} disabled={wallet.loading} size="md" full>
								{wallet.loading ? 'Connecting...' : 'Connect Wallet'}
							</CtaButton>
						{:else}
							{#if wallet.networkMismatch}
								<div
									class="flex items-center gap-2.5 rounded-xl bg-warning/6 px-4 py-3 ring-1 ring-warning/12"
								>
									<span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
									<p class="text-xs text-warning">
										Switch to <span class="font-medium uppercase">{stellarConfig.network}</span> in Freighter
									</p>
								</div>
							{:else}
								<div
									class="flex items-center justify-between rounded-xl bg-positive/5 px-4 py-3 ring-1 ring-positive/10"
								>
									<div class="flex items-center gap-2.5">
										<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-positive"></span>
										<p class="text-xs text-positive">{stellarConfig.network}</p>
									</div>
									<p class="truncate pl-4 font-mono text-[11px] text-text-dim">
										{wallet.address?.slice(0, 8)}...{wallet.address?.slice(-6)}
									</p>
								</div>
							{/if}

							<div class="space-y-2">
								<label class="text-xs font-medium text-text-muted" for="quick-uri"
									>Metadata URI</label
								>
								<input
									id="quick-uri"
									type="text"
									bind:value={manualUri}
									placeholder="https://... or ipfs://..."
									class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm transition-colors placeholder:text-text-dim focus:border-accent/50 focus:outline-none"
								/>
								<p class="text-[10px] text-text-dim">
									Your URI should point to a JSON file like this:
								</p>
								<CodeBlock
									class="mt-2"
									code={`{
  "name": "DataBot",
  "description": "Real-time market data feed",
  "image": "https://example.com/avatar.png",
  "services": [
    { "name": "market-feed",
      "endpoint": "https://api.example.com/feed" }
  ]
}`}
								/>
								<p class="mt-1.5 text-[10px] text-text-dim">
									Only <code class="rounded bg-surface-raised px-1 py-0.5 font-mono">name</code> is
									required. Optional:
									<code class="rounded bg-surface-raised px-1 py-0.5 font-mono">description</code>,
									<code class="rounded bg-surface-raised px-1 py-0.5 font-mono">image</code>,
									<code class="rounded bg-surface-raised px-1 py-0.5 font-mono">services</code>,
									<code class="rounded bg-surface-raised px-1 py-0.5 font-mono">x402</code>,
									<code class="rounded bg-surface-raised px-1 py-0.5 font-mono">mpp</code>
								</p>
							</div>

							<CtaButton
								onclick={() => submitQuick(manualUri)}
								disabled={status === 'submitting' || wallet.networkMismatch}
								size="md"
								full
							>
								{#if status === 'submitting'}
									<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"
										><circle
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											stroke-width="2"
											opacity="0.25"
										/><path
											d="M12 2a10 10 0 019.95 9"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
										/></svg
									>
									Registering...
								{:else}
									Register on Stellar
								{/if}
							</CtaButton>

							{#if status === 'error'}
								<div
									class="flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12"
								>
									<svg
										class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="1.5"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
										/></svg
									>
									<p class="text-xs text-negative">{errorMsg}</p>
								</div>
							{/if}
						{/if}
					</div>
					<div class="h-px bg-linear-to-r from-transparent via-accent/20 to-transparent"></div>
				</div>
				<a
					href={resolve('/')}
					class="inline-flex items-center gap-2 text-xs text-text-muted hover:text-text"
					>Cancel and go home</a
				>
			</div>
		{:else}
			<Stepper steps={STEPS} {currentStep} />

			<div class="overflow-hidden rounded-2xl border border-border bg-surface-raised/40">
				<div class="h-px bg-linear-to-r from-transparent via-accent/50 to-transparent"></div>

				<div class="p-8 sm:p-10">
					{#if currentStep === 0}
						<StepBasicInfo {formData} />
					{:else if currentStep === 1}
						<StepServices services={formData.services} />
					{:else if currentStep === 2}
						<StepAdvanced
							supportedTrust={formData.supportedTrust}
							bind:x402Enabled={formData.x402Enabled}
							bind:mppEnabled={formData.mppEnabled}
						/>
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
						<button
							type="button"
							onclick={back}
							class="flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm text-text-muted transition-colors hover:bg-surface-raised"
						>
							Back
						</button>
					{:else}
						<a
							href={resolve('/')}
							class="flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm text-text-muted transition-colors hover:bg-surface-raised"
						>
							Cancel
						</a>
					{/if}

					<button
						type="button"
						onclick={next}
						disabled={!canProceed}
						class="rounded-xl border border-accent/30 bg-accent-fill px-6 py-2.5 text-sm font-medium text-accent transition-colors hover:border-accent/45 hover:bg-accent-fill-hover disabled:opacity-40"
					>
						Next: {STEPS[currentStep + 1]?.label} ->
					</button>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.enter {
		animation: enter 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.enter {
			animation: none;
		}
	}
</style>
