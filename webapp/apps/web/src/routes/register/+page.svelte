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
	import StepBasicInfo from '$lib/components/register/StepBasicInfo.svelte';
	import StepServices from '$lib/components/register/StepServices.svelte';
	import StepAdvanced from '$lib/components/register/StepAdvanced.svelte';
	import StepReview from '$lib/components/register/StepReview.svelte';
	import RegisterIcon from '$lib/components/register/RegisterIcon.svelte';
	import { primary } from '$lib/components/register/ui.js';
	import { shortAddress } from '$lib/formatters.js';

	const STEPS = ['Identity', 'Capabilities', 'Register'];

	// Single sessionStorage key per origin. If a user opens the registration
	// form in two tabs, both tabs share this key and the second one to write
	// wins. This is a known UX limitation, not a data-loss bug - sessionStorage
	// is per-tab in modern browsers, so each tab actually has its own storage
	// scope, and the only failure mode is that draft state from one tab is
	// not visible in another. Accept and document.
	const STORAGE_KEY = 'registration-form';

	let currentStep = $state(0);

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
				return uriMode === 'auto' ? formData.name.trim().length > 0 : manualUri.trim().length > 0;
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

			<p class="flex flex-wrap gap-x-6 gap-y-2 pt-10 text-sm text-text-dim">
				<button type="button" onclick={() => (mode = 'form')} class="hover:text-text"
					>Fill the form instead</button
				>
				<a href={resolve('/developers')} class="hover:text-text">SDK docs</a>
			</p>
		</section>
	{:else}
		<div class="enter space-y-5 pt-6 sm:pt-20">
			<h1 class="text-[30px] leading-tight font-light tracking-[-0.015em] text-text sm:text-[40px]">
				Register an agent
			</h1>
			<ol class="flex gap-5 text-sm" aria-label="Progress">
				{#each STEPS as step, i (step)}
					<li
						aria-current={i === currentStep ? 'step' : undefined}
						class="flex items-center gap-1.5 transition-colors {i === currentStep
							? 'text-text'
							: i < currentStep
								? 'text-text-muted'
								: 'text-text-dim'}"
					>
						{#if i < currentStep}
							<svg
								class="h-3.5 w-3.5 text-positive"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
								><path
									d="M5 12.5l4.5 4.5L19 7.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/></svg
							>
						{:else}
							<span class="tabular-nums">{i + 1}</span>
						{/if}
						{step}
					</li>
				{/each}
			</ol>
		</div>

		<form
			class="space-y-12"
			onsubmit={(e) => {
				e.preventDefault();
				next();
			}}
		>
			{#if currentStep === 0}
				<StepBasicInfo {formData} />
			{:else if currentStep === 1}
				<div class="space-y-10">
					<StepServices services={formData.services} />
					<StepAdvanced
						supportedTrust={formData.supportedTrust}
						bind:x402Enabled={formData.x402Enabled}
						bind:mppEnabled={formData.mppEnabled}
					/>
				</div>
			{:else}
				<StepReview {formData} bind:uriMode bind:manualUri />
			{/if}

			<div class="space-y-4">
				{#if status === 'error'}
					<p class="flex items-start gap-2 text-sm text-negative" role="alert">
						<RegisterIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />{errorMsg}
					</p>
				{/if}
				{#if currentStep === STEPS.length - 1 && wallet.connected}
					<p class="flex items-center gap-2 text-sm text-text-dim">
						{#if wallet.networkMismatch}
							<span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
							<span class="text-warning">Switch Freighter to {stellarConfig.network}</span>
						{:else}
							<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
							<span class="font-mono text-xs">{shortAddress(wallet.address ?? '')}</span>
							<span>{stellarConfig.network}</span>
						{/if}
					</p>
				{/if}

				<div class="flex items-center justify-between">
					{#if currentStep > 0}
						<button
							type="button"
							onclick={back}
							class="inline-flex items-center gap-1.5 text-sm text-text-dim transition-colors hover:text-text"
						>
							<RegisterIcon name="back" />Back
						</button>
					{:else}
						<span></span>
					{/if}

					{#if currentStep < STEPS.length - 1}
						<button type="submit" disabled={!canProceed} class={primary}>
							Continue<RegisterIcon name="next" />
						</button>
					{:else if !wallet.connected}
						<button
							type="button"
							onclick={() => wallet.connect()}
							disabled={wallet.loading}
							class={primary}
						>
							<RegisterIcon name="wallet" />{wallet.loading ? 'Connecting…' : 'Connect wallet'}
						</button>
					{:else}
						<button
							type="button"
							onclick={submit}
							disabled={!canProceed || status === 'submitting' || wallet.networkMismatch}
							class={primary}
						>
							{#if status === 'submitting'}
								<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"
									><circle
										cx="12"
										cy="12"
										r="9"
										stroke="currentColor"
										stroke-width="1.5"
										opacity="0.25"
									/><path
										d="M12 3a9 9 0 0 1 9 9"
										stroke="currentColor"
										stroke-width="1.5"
										stroke-linecap="round"
									/></svg
								>
								Registering…
							{:else}
								Register<RegisterIcon name="next" />
							{/if}
						</button>
					{/if}
				</div>
			</div>
		</form>

		<p class="flex flex-wrap gap-x-6 gap-y-2 pt-6 text-sm text-text-dim">
			<button type="button" onclick={() => (mode = 'agent')} class="hover:text-text"
				>Give it to your agent instead</button
			>
			{#if uriMode === 'auto'}
				<button
					type="button"
					onclick={() => {
						uriMode = 'manual';
						currentStep = STEPS.length - 1;
					}}
					class="hover:text-text">I have a metadata URL</button
				>
			{/if}
		</p>
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
