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
		validateUrl,
		formatSorobanError
	} from '@trionlabs/stellar8004';
	import type { AgentFormData, UriMode } from '$lib/types.js';
	import AgentCardEditor from '$lib/components/register/AgentCardEditor.svelte';
	import StepServices from '$lib/components/register/StepServices.svelte';
	import StepAdvanced from '$lib/components/register/StepAdvanced.svelte';
	import MetadataOptions from '$lib/components/register/MetadataOptions.svelte';
	import RegisterIcon from '$lib/components/register/RegisterIcon.svelte';
	import { field, primary } from '$lib/components/register/ui.js';
	import { shortAddress } from '$lib/formatters.js';

	// Single sessionStorage key per origin. If a user opens the registration
	// form in two tabs, both tabs share this key and the second one to write
	// wins. This is a known UX limitation, not a data-loss bug - sessionStorage
	// is per-tab in modern browsers, so each tab actually has its own storage
	// scope, and the only failure mode is that draft state from one tab is
	// not visible in another. Accept and document.
	const STORAGE_KEY = 'registration-form';

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
	const skillUrl = $derived(`${page.url.origin}/skill.md`);
	const agentPrompt = $derived(`Read ${skillUrl} and register yourself on Stellar8004.`);
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

	// Optional parts of the profile stay folded away until asked for; a restored draft reopens them.
	const ADD_LABELS = { image: 'Image', services: 'Services', trust: 'Trust', payments: 'Payments' };
	type Part = keyof typeof ADD_LABELS;
	let open = $state<Record<Part, boolean>>({
		image: !!formData.imageUrl,
		services: formData.services.length > 0,
		trust: formData.supportedTrust.length > 0,
		payments: formData.x402Enabled || formData.mppEnabled
	});
	const closed = $derived((Object.keys(ADD_LABELS) as Part[]).filter((k) => !open[k]));
	const hasName = $derived(formData.name.trim().length > 0);
	const imageError = $derived(validateUrl(formData.imageUrl));
	const canRegister = $derived(uriMode === 'auto' ? hasName : manualUri.trim().length > 0);

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
				Give your agent the skill
			</h1>

			<div class="space-y-3">
				<button
					type="button"
					onclick={copyPrompt}
					title="Copy"
					data-frame
					class="group flex w-full items-center gap-2 rounded-2xl bg-surface-raised py-4 pr-3 pl-4 text-left transition-colors hover:bg-surface-overlay focus-visible:ring-1 focus-visible:ring-accent/50 focus-visible:outline-none sm:gap-4 sm:px-6 sm:py-5"
				>
					<code
						bind:this={promptEl}
						class="min-w-0 flex-1 font-mono text-[12px] leading-relaxed [overflow-wrap:anywhere] text-text sm:text-sm"
						><span class="block">Read {skillUrl}</span><span class="block"
							>and register yourself on Stellar8004.</span
						></code
					>
					<span
						aria-hidden="true"
						class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-overlay transition-colors sm:h-10 sm:w-10 {copied
							? 'text-positive'
							: 'text-text-muted group-hover:text-text'}"
					>
						<RegisterIcon name={copied ? 'check' : 'copy'} class="h-[18px] w-[18px]" />
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
							href={skillUrl}
							class="text-text-muted underline decoration-border underline-offset-4 hover:text-text"
							>skill</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						and registers itself · <span class="whitespace-nowrap">free, network fee only</span>
					{/if}
				</p>
			</div>

			<p class="flex flex-wrap gap-x-6 gap-y-2 pt-10 text-sm text-text-dim">
				<button
					type="button"
					onclick={() => (mode = 'form')}
					class="inline-flex items-center gap-1.5 hover:text-text"
					><RegisterIcon name="edit" />Fill the form instead</button
				>
				<a href={resolve('/developers')} class="inline-flex items-center gap-1.5 hover:text-text"
					><RegisterIcon name="code" />SDK docs</a
				>
			</p>
		</section>
	{:else}
		<section class="enter space-y-8 pt-6 sm:pt-20">
			<h1 class="text-[30px] leading-tight font-light tracking-[-0.015em] text-text sm:text-[40px]">
				Register an agent
			</h1>

			{#if uriMode === 'auto'}
				<div class="space-y-6">
					<AgentCardEditor {formData} onImage={() => (open.image = true)} />

					{#if open.image}
						<label class="block space-y-2">
							<span class="text-sm text-text-muted">Image URL</span>
							<input
								type="text"
								inputmode="url"
								bind:value={formData.imageUrl}
								placeholder="https://… or ipfs://…"
								class="{field} {imageError ? 'ring-1 ring-negative/50' : ''}"
							/>
							{#if imageError}<span class="block text-xs text-negative">{imageError}</span>{/if}
						</label>
					{/if}
					{#if open.services}<StepServices services={formData.services} />{/if}
					{#if open.trust || open.payments}
						<StepAdvanced
							only={open.trust && open.payments ? undefined : open.trust ? 'trust' : 'payments'}
							supportedTrust={formData.supportedTrust}
							bind:x402Enabled={formData.x402Enabled}
							bind:mppEnabled={formData.mppEnabled}
						/>
					{/if}

					{#if closed.length}
						<div class="enter flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-dim">
							{#each closed as key (key)}
								<button
									type="button"
									onclick={() => (open[key] = true)}
									class="inline-flex items-center gap-1.5 transition-colors hover:text-text"
								>
									<RegisterIcon name="plus" class="h-3.5 w-3.5" />{ADD_LABELS[key]}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="space-y-6 pt-4">
				{#if hasName || uriMode === 'manual'}
					<MetadataOptions {formData} bind:uriMode bind:manualUri />
				{/if}

				{#if status === 'error'}
					<p class="flex items-start gap-2 text-sm text-negative" role="alert">
						<RegisterIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />{errorMsg}
					</p>
				{/if}

				<div class="flex flex-wrap items-center justify-end gap-x-5 gap-y-3">
					{#if wallet.connected}
						<span class="flex items-center gap-2 text-sm text-text-dim">
							{#if wallet.networkMismatch}
								<span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
								<span class="text-warning">Switch Freighter to {stellarConfig.network}</span>
							{:else}
								<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
								<span class="font-mono text-xs">{shortAddress(wallet.address ?? '')}</span>
							{/if}
						</span>
						<button
							type="button"
							onclick={submit}
							disabled={!canRegister || status === 'submitting' || wallet.networkMismatch}
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
					{:else}
						<button
							type="button"
							onclick={() => wallet.connect()}
							disabled={wallet.loading}
							class={primary}
						>
							<RegisterIcon name="wallet" />{wallet.loading ? 'Connecting…' : 'Connect wallet'}
						</button>
					{/if}
				</div>
			</div>

			<p class="flex flex-wrap gap-x-6 gap-y-2 pt-6 text-sm text-text-dim">
				<button type="button" onclick={() => (mode = 'agent')} class="hover:text-text"
					>Give your agent the skill instead</button
				>
				{#if uriMode === 'auto' && !hasName}
					<button type="button" onclick={() => (uriMode = 'manual')} class="hover:text-text"
						>I have a metadata URL</button
					>
				{/if}
			</p>
		</section>
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
