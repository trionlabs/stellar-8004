<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { wallet } from '$lib/wallet.svelte.js';

	let mounted = $state(false);
	let agentCount = $state<number | null>(null);
	let abortController: AbortController | null = null;

	onMount(() => {
		mounted = true;
	});

	async function fetchAgentCount(address: string) {
		abortController?.abort();
		abortController = new AbortController();
		try {
			const res = await fetch(`/api/agents/count?owner=${encodeURIComponent(address)}`, {
				signal: abortController.signal
			});
			if (!res.ok) throw new Error('fetch failed');
			const data = await res.json();
			if (address === wallet.address) {
				agentCount = data.count;
			}
		} catch {
			if (address === wallet.address) {
				agentCount = null;
			}
		}
	}

	$effect(() => {
		const currentAddress = wallet.address;
		if (wallet.connected && currentAddress) {
			fetchAgentCount(currentAddress);
		} else {
			agentCount = null;
		}
	});
</script>

{#if !mounted}
	<button class="rounded-lg px-4 py-2 text-sm text-text-dim" disabled>
		Loading...
	</button>
{:else if wallet.connected}
	<div class="flex items-center gap-3">
		{#if wallet.network}
			<span
				class="rounded px-1.5 py-0.5 text-xs font-medium {wallet.networkMismatch
					? 'bg-warning-soft text-warning'
					: 'bg-positive-soft text-positive'}"
			>
				{wallet.network}
			</span>
		{/if}
		<span class="font-mono text-sm text-text-muted">{wallet.truncatedAddress}</span>
		{#if agentCount != null && agentCount > 0}
			<span class="text-text-dim">-</span>
			<a
				href={resolve('/agents') + `?owner=${wallet.address}`}
				class="font-mono text-[11px] text-accent transition hover:text-text"
			>
				{agentCount} {agentCount === 1 ? 'agent' : 'agents'}
			</a>
		{/if}
		<button
			onclick={() => wallet.disconnect()}
			class="rounded-lg px-2.5 py-1 text-xs text-text-dim transition hover:text-text"
		>
			Disconnect
		</button>
	</div>
{:else}
	<button
		onclick={() => wallet.connect()}
		disabled={wallet.loading}
		class="rounded-lg bg-accent-soft px-4 py-2 text-sm text-accent transition hover:bg-accent-medium disabled:opacity-50"
	>
		{wallet.loading ? 'Connecting...' : 'Connect'}
	</button>
{/if}

{#if wallet.error}
	<p class="mt-1 text-xs text-negative">{wallet.error}</p>
{/if}
