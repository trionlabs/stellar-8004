<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { wallet } from '$lib/wallet.svelte.js';
	import { buildMetadataJsonForEdit, toDataUri } from '$lib/metadata.js';
	import type { AgentFormData, UriMode } from '$lib/types.js';
	import type { PageProps } from './$types';
	import MetadataEditor from '$lib/components/agent-edit/MetadataEditor.svelte';
	import WalletBinding from '$lib/components/agent-edit/WalletBinding.svelte';
	import UpdateProgress from '$lib/components/agent-edit/UpdateProgress.svelte';

	let { data }: PageProps = $props();

	const isOwner = $derived(
		wallet.address?.toUpperCase() === data.agent.owner.toUpperCase()
	);

	type EditTab = 'metadata' | 'wallet';
	let activeTab = $state<EditTab>('metadata');

	const initialFormData: AgentFormData = {
		name: data.agent.name,
		description: data.agent.description ?? '',
		imageUrl: data.agent.image ?? '',
		services: normalizeServices(data.agent.services),
		supportedTrust: data.agent.supportedTrust,
		x402Enabled: data.agent.x402Enabled
	};
	const initialFormJson = JSON.stringify(initialFormData);

	let formData = $state<AgentFormData>({ ...initialFormData });

	let uriMode = $state<UriMode>(
		data.agent.agentUri?.startsWith('data:') ? 'auto' :
		data.agent.agentUri?.startsWith('ipfs://') ? 'manual' :
		'auto'
	);

	let manualUri = $state(
		uriMode === 'manual' ? (data.agent.agentUri ?? '') : ''
	);

	let saveStatus = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let saveError = $state('');
	let saveTxHash = $state<string | null>(null);

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

	function normalizeServices(raw: unknown): Array<{ name: string; endpoint: string; version?: string }> {
		if (!Array.isArray(raw)) return [];
		return raw
			.filter((s): s is Record<string, unknown> => s != null && typeof s === 'object')
			.map((s) => ({
				name: typeof s.name === 'string' ? s.name : 'unknown',
				endpoint: typeof s.endpoint === 'string' ? s.endpoint : '',
				version: typeof s.version === 'string' ? s.version : undefined
			}))
			.filter((s) => s.endpoint.length > 0);
	}

	async function saveMetadata() {
		saveStatus = 'submitting';
		saveError = '';

		try {
			const uri = uriMode === 'auto'
				? toDataUri(buildMetadataJsonForEdit(formData, data.agent.rawUriData))
				: manualUri.trim();

			const { updateAgentUri } = await import('$lib/contracts.js');
			const result = await updateAgentUri(data.agent.id, uri);
			saveTxHash = result.hash;
			saveStatus = 'success';
			unsavedChanges = false;
			invalidateAll();
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to update metadata';
			saveStatus = 'error';
		}
	}

	const metadataSteps = $derived([
		{ label: 'Transaction signed', status: (saveStatus === 'idle' ? 'pending' : 'done') as 'done' | 'active' | 'pending' },
		{ label: 'Confirmed on-chain', status: (saveStatus === 'success' ? 'done' : saveStatus === 'submitting' ? 'active' : 'pending') as 'done' | 'active' | 'pending' },
		{ label: 'Indexer processing...', status: (saveStatus === 'success' ? 'active' : 'pending') as 'done' | 'active' | 'pending' },
		{ label: 'Resolving metadata', status: 'pending' as const },
		{ label: 'Complete', status: 'pending' as const }
	]);
</script>

<svelte:head>
	<title>Edit Agent #{data.agent.id} — Stellar8004</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div class="flex items-center gap-4">
		<a href={resolve(`/agents/${data.agent.id}`)} class="text-sm text-text-muted hover:text-text transition-colors">
			← Back to Agent #{data.agent.id}
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
				class="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 transition-colors">
				Connect Wallet
			</button>
		</div>
	{/if}

	{#if saveStatus === 'success'}
		<UpdateProgress steps={metadataSteps} txHash={saveTxHash} />
	{/if}

	<div class="flex gap-1 border-b border-border">
		{#each [
			{ id: 'metadata' as const, label: 'Metadata' },
			{ id: 'wallet' as const, label: 'Wallet' }
		] as tab (tab.id)}
			<button
				type="button"
				onclick={() => activeTab = tab.id}
				class="rounded-t-lg px-4 py-2 text-xs font-medium transition-colors
					{activeTab === tab.id
						? 'border-b-2 border-accent text-accent'
						: 'text-text-muted hover:text-text'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<div class="rounded-2xl border border-border bg-surface-raised/40 overflow-hidden">
		<div class="h-px bg-linear-to-r from-transparent via-accent/50 to-transparent"></div>
		<div class="p-8 sm:p-10">
			{#if activeTab === 'metadata'}
				<MetadataEditor
					{formData}
					bind:uriMode
					bind:manualUri
					rawUriData={data.agent.rawUriData}
				/>
			{:else if activeTab === 'wallet'}
				<WalletBinding
					currentWallet={data.agent.wallet}
					agentId={data.agent.id}
				/>
			{/if}
		</div>
		<div class="h-px bg-linear-to-r from-transparent via-accent/20 to-transparent"></div>
	</div>

	{#if activeTab === 'metadata'}
		<div class="flex items-center justify-between">
			<a href={resolve(`/agents/${data.agent.id}`)}
				class="flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm text-text-muted hover:bg-surface-raised transition-colors">
				← Cancel
			</a>
			<button
				type="button"
				onclick={saveMetadata}
				disabled={!wallet.connected || !isOwner || saveStatus === 'submitting'}
				class="rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent/90 transition-colors"
			>
				{#if saveStatus === 'submitting'}
					Saving...
				{:else if saveStatus === 'success'}
					Saved
				{:else}
					Save Changes
				{/if}
			</button>
		</div>
		{#if saveStatus === 'error'}
			<div class="flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12">
				<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
				</svg>
				<p class="text-xs text-negative">{saveError}</p>
			</div>
		{/if}
	{:else}
		<div class="flex justify-start">
			<a href={resolve(`/agents/${data.agent.id}`)}
				class="flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm text-text-muted hover:bg-surface-raised transition-colors">
				← Back to Agent
			</a>
		</div>
	{/if}
</div>
