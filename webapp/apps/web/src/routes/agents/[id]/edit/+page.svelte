<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		buildMetadataJsonForEdit,
		getMetadataSize,
		toDataUri
	} from '@trionlabs/stellar8004';
	import { getClients } from '$lib/sdk-client.js';
	import { explorerTxUrl } from '$lib/explorer.js';
	import { validateAgentUri, formatSorobanError } from '@trionlabs/stellar8004';
	import { wallet } from '$lib/wallet.svelte.js';
	import type { AgentFormData, UriMode } from '$lib/types.js';
	import type { PageProps } from './$types';
	import MetadataEditor from '$lib/components/agent-edit/MetadataEditor.svelte';
	import WalletBinding from '$lib/components/agent-edit/WalletBinding.svelte';

	let { data }: PageProps = $props();

	const isOwner = $derived(
		wallet.address?.toUpperCase() === data.agent.owner.toUpperCase()
	);

	// Editable form state is intentionally a snapshot of `data.agent` at
	// mount time - subsequent updates to `data` (e.g. from invalidateAll
	// after a successful save) must NOT clobber the user's in-progress
	// edits. The svelte-ignore directives below acknowledge that we are
	// deliberately reading reactive props outside a $derived for this
	// initialization.
	// svelte-ignore state_referenced_locally
	const initialFormData: AgentFormData = {
		name: data.agent.name,
		description: data.agent.description ?? '',
		imageUrl: data.agent.image ?? '',
		services: normalizeServices(data.agent.services),
		supportedTrust: data.agent.supportedTrust,
		x402Enabled: data.agent.x402Enabled,
		mppEnabled: data.agent.mppEnabled ?? false
	};
	const initialFormJson = JSON.stringify(initialFormData);

	let formData = $state<AgentFormData>({ ...initialFormData });

	// svelte-ignore state_referenced_locally
	let uriMode = $state<UriMode>(
		data.agent.agentUri?.startsWith('data:') ? 'auto' :
		data.agent.agentUri?.startsWith('ipfs://') ? 'manual' :
		'auto'
	);

	// svelte-ignore state_referenced_locally
	let manualUri = $state(
		uriMode === 'manual' ? (data.agent.agentUri ?? '') : ''
	);

	let saveStatus = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let saveError = $state('');
	let saveTxHash = $state<string | null>(null);
	let walletSectionOpen = $state(false);

	let unsavedChanges = $state(false);

	$effect(() => {
		unsavedChanges = JSON.stringify(formData) !== initialFormJson;
	});

	$effect(() => {
		if (typeof window !== 'undefined') {
			const handler = (e: BeforeUnloadEvent) => {
				if (unsavedChanges) e.preventDefault();
			};
			window.addEventListener('beforeunload', handler);
			return () => window.removeEventListener('beforeunload', handler);
		}
	});

	function normalizeServices(raw: unknown): Array<{ name: string; endpoint: string; version?: string; description?: string; inputExample?: string }> {
		if (!Array.isArray(raw)) return [];
		return raw
			.filter((s): s is Record<string, unknown> => s != null && typeof s === 'object')
			.map((s) => ({
				name: typeof s.name === 'string' ? s.name : 'unknown',
				endpoint: typeof s.endpoint === 'string' ? s.endpoint : '',
				version: typeof s.version === 'string' ? s.version : undefined,
				description: typeof s.description === 'string' ? s.description : undefined,
				inputExample: typeof s.inputExample === 'string' ? s.inputExample : undefined
			}))
			.filter((s) => s.endpoint.length > 0);
	}

	const validationError = $derived.by(() => {
		if (!formData.name.trim()) return 'Agent name is required';
		if (formData.name.trim().length > 256) return 'Agent name must be 256 characters or fewer';
		if (uriMode === 'auto') {
			try {
				const json = buildMetadataJsonForEdit(formData, data.agent.rawUriData);
				const size = getMetadataSize(json);
				const estimatedUriSize = 29 + Math.ceil(size * 4 / 3);
				if (estimatedUriSize > 8192) return `Metadata too large (~${estimatedUriSize} bytes, max 8KB). Reduce description or services.`;
			} catch { /* graceful */ }
		}
		if (uriMode === 'manual' && manualUri.trim().length === 0) return 'Manual URI is required when URI mode is manual';
		return '';
	});

	async function saveMetadata() {
		if (validationError) return;
		saveStatus = 'submitting';
		saveError = '';

		try {
			const caller = wallet.address;
			if (!caller) {
				saveError = 'Wallet disconnected. Reconnect and try again.';
				saveStatus = 'error';
				return;
			}

			const uri = uriMode === 'auto'
				? toDataUri(buildMetadataJsonForEdit(formData, data.agent.rawUriData))
				: manualUri.trim();

			validateAgentUri(uri);
			const { identity } = getClients();
			const tx = await identity.set_agent_uri({
				caller,
				agent_id: data.agent.id,
				new_uri: uri,
			});
			const sent = await tx.signAndSend();
			saveTxHash = sent.sendTransactionResponse?.hash ?? null;
			saveStatus = 'success';
			unsavedChanges = false;
			invalidateAll();

			setTimeout(() => {
				goto(resolve(`/agents/${data.agent.id}`), { invalidateAll: true });
			}, 1500);
		} catch (err) {
			saveError = formatSorobanError(err);
			saveStatus = 'error';
		}
	}
</script>

<svelte:head>
	<title>Edit Agent #{data.agent.id} - Stellar8004</title>
</svelte:head>

{#if saveStatus === 'success'}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm">
		<div class="rounded-2xl border border-positive/20 bg-surface-raised p-8 text-center space-y-3 max-w-sm">
			<svg class="mx-auto h-10 w-10 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
			</svg>
			<p class="text-sm font-medium text-text">Metadata updated</p>
			<p class="text-[11px] text-text-dim">Redirecting to agent page...</p>
			{#if saveTxHash}
				<div class="rounded-lg border border-border bg-surface p-3 space-y-1">
					<p class="text-[10px] text-text-dim uppercase tracking-wider">Transaction</p>
					<div class="flex items-center gap-2">
						<a href={explorerTxUrl(saveTxHash)}
							target="_blank" rel="noopener noreferrer"
							class="flex-1 font-mono text-[10px] text-accent hover:underline break-all text-left">
							{saveTxHash}
						</a>
						<button type="button"
							onclick={() => navigator.clipboard.writeText(saveTxHash ?? '')}
							class="shrink-0 rounded p-1 text-text-dim hover:text-accent transition-colors"
							aria-label="Copy transaction hash">
							<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
							</svg>
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<div class="mx-auto max-w-3xl space-y-6">
	<div class="flex items-center gap-4">
		<a href={resolve(`/agents/${data.agent.id}`)} class="text-sm text-text-muted hover:text-text transition-colors">
			Back to Agent #{data.agent.id}
		</a>
	</div>

	<div class="space-y-2">
		<h1 class="text-2xl font-light tracking-tight text-text">Edit Agent #{data.agent.id}</h1>
		<p class="text-sm text-text-muted">Update metadata and wallet binding</p>
	</div>

	{#if wallet.connected && !isOwner}
		<div class="flex items-start gap-3 rounded-xl border border-warning/15 bg-warning/5 px-4 py-3">
			<svg class="mt-0.5 h-4 w-4 shrink-0 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<div>
				<p class="text-sm font-medium text-warning">Read-only mode</p>
				<p class="text-xs text-text-muted">You are not the owner of this agent. Changes require the owner's wallet signature.</p>
			</div>
		</div>
	{/if}

	{#if !wallet.connected}
		<div class="flex items-center gap-3 rounded-xl border border-border bg-surface-raised/40 px-4 py-3">
			<p class="text-sm text-text-muted">Connect your wallet to make changes.</p>
			<button onclick={() => wallet.connect()}
				class="shrink-0 rounded-lg border border-accent/30 bg-accent-fill px-4 py-2 text-sm text-accent hover:bg-accent-fill-hover hover:border-accent/45 transition-colors">
				Connect Wallet
			</button>
		</div>
	{/if}

	<!-- Metadata accordion sections -->
	<MetadataEditor {formData} bind:uriMode bind:manualUri rawUriData={data.agent.rawUriData} />

	<!-- Wallet Binding - separate contract call -->
	<div class="rounded-xl border border-positive/15 overflow-hidden">
		<button type="button" onclick={() => walletSectionOpen = !walletSectionOpen}
			class="flex w-full items-center justify-between px-5 py-3.5
			       bg-positive/3 hover:bg-positive/5 transition-colors">
			<div class="flex items-center gap-2.5">
				<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
				<span class="text-xs font-medium tracking-wide uppercase text-text-muted">Wallet Binding</span>
				<span class="text-[10px] text-text-dim/50">Separate transaction</span>
			</div>
			<svg class="h-3.5 w-3.5 text-text-dim transition-transform duration-200 {walletSectionOpen ? 'rotate-180' : ''}"
				fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
		{#if walletSectionOpen}
			<div class="h-px bg-linear-to-r from-transparent via-positive/20 to-transparent"></div>
			<div class="px-5 py-5">
				<WalletBinding currentWallet={data.agent.wallet} agentId={data.agent.id} />
			</div>
		{/if}
	</div>

	<!-- Sticky save footer -->
	<div class="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-border
	            bg-surface/80 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]
	            flex items-center justify-between gap-3">
		<a href={resolve(`/agents/${data.agent.id}`)}
			class="rounded-xl border border-border px-5 py-2.5 text-sm text-text-muted hover:bg-surface-raised transition-colors">
			Cancel
		</a>
		<div class="flex items-center gap-3">
			{#if unsavedChanges}
				<span class="text-[10px] text-warning animate-pulse">Unsaved changes</span>
			{/if}
			<button type="button" onclick={saveMetadata}
				disabled={!wallet.connected || !isOwner || saveStatus === 'submitting' || !!validationError}
				class="rounded-xl border border-accent/30 bg-accent-fill px-6 py-2.5 text-sm font-medium text-accent
				       disabled:opacity-40 hover:bg-accent-fill-hover hover:border-accent/45 transition-colors">
				{saveStatus === 'submitting' ? 'Saving...' : 'Save Metadata'}
			</button>
		</div>
	</div>

	{#if saveStatus === 'error'}
		<div class="flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12">
			<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<p class="text-xs text-negative">{saveError}</p>
		</div>
	{/if}

	{#if validationError && unsavedChanges}
		<div class="flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12">
			<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<p class="text-xs text-negative">{validationError}</p>
		</div>
	{/if}
</div>
