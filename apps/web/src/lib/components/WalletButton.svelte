<script lang="ts">
	import { wallet } from '$lib/wallet.svelte.js';
	import { onMount } from 'svelte';

	let mounted = $state(false);

	onMount(() => {
		mounted = true;
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
