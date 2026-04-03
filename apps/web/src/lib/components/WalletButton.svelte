<script lang="ts">
	import { wallet } from '$lib/wallet.svelte.js';
	import { onMount } from 'svelte';

	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});
</script>

{#if !mounted}
	<button class="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-400" disabled>
		Loading...
	</button>
{:else if wallet.connected}
	<div class="flex items-center gap-2">
		{#if wallet.network}
			<span
				class="rounded px-1.5 py-0.5 text-xs font-medium {wallet.networkMismatch
					? 'bg-amber-500/20 text-amber-300'
					: 'bg-green-500/20 text-green-300'}"
			>
				{wallet.network}
			</span>
		{/if}
		<span class="font-mono text-sm text-gray-300">{wallet.truncatedAddress}</span>
		<button
			onclick={() => wallet.disconnect()}
			class="rounded-lg bg-red-600/20 px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-600/30"
		>
			Disconnect
		</button>
	</div>
{:else}
	<button
		onclick={() => wallet.connect()}
		disabled={wallet.loading}
		class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-700 disabled:opacity-50"
	>
		{wallet.loading ? 'Connecting...' : 'Connect Wallet'}
	</button>
{/if}

{#if wallet.error}
	<p class="mt-1 text-xs text-red-400">{wallet.error}</p>
{/if}
