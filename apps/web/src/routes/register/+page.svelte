<script lang="ts">
	import { goto } from '$app/navigation';
	import { registerAgent } from '$lib/contracts.js';
	import { stellarConfig } from '$lib/stellar.js';
	import { wallet } from '$lib/wallet.svelte.js';

	let agentUri = $state('');
	let status = $state<'idle' | 'signing' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');

	const busy = $derived(status === 'signing' || status === 'submitting');

	async function submit() {
		status = 'signing';
		errorMsg = '';

		try {
			status = 'submitting';
			const result = await registerAgent(agentUri || undefined);
			status = 'success';
			await goto(`/agents/${result.agentId}`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Registration failed';
			status = 'error';
		}
	}
</script>

<svelte:head>
	<title>Register Agent — 8004scan Stellar</title>
</svelte:head>

<div class="mx-auto max-w-xl space-y-6">
	<div class="space-y-2">
		<h1 class="text-2xl font-bold">Register Agent</h1>
		<p class="text-sm text-gray-400">
			Register on Stellar directly from Freighter. This app is configured for
			<span class="font-semibold text-white">{stellarConfig.network}</span>.
		</p>
	</div>

	{#if !wallet.connected}
		<div class="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
			<p class="mb-4 text-gray-400">Connect your wallet to register an agent.</p>
			<button
				onclick={() => wallet.connect()}
				disabled={wallet.loading}
				class="rounded-lg bg-indigo-600 px-6 py-2 text-white transition hover:bg-indigo-700 disabled:opacity-50"
			>
				{wallet.loading ? 'Connecting...' : 'Connect Wallet'}
			</button>
		</div>
	{:else}
		<div class="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
			<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
				Freighter must be on the same network as the app configuration:
				<span class="font-semibold uppercase">{stellarConfig.network}</span>.
			</div>

			<div>
				<label class="mb-1 block text-sm text-gray-400" for="agent-uri">Agent URI (optional)</label>
				<input
					id="agent-uri"
					type="text"
					bind:value={agentUri}
					placeholder="https://... or ipfs://..."
					maxlength="512"
					class="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-2 text-white placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none"
				/>
				<p class="mt-1 text-xs text-gray-600">
					JSON metadata URL with name, description, image and services.
				</p>
			</div>

			<button
				onclick={submit}
				disabled={busy}
				class="w-full rounded-lg bg-indigo-600 py-3 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
			>
				{status === 'signing'
					? 'Sign in wallet...'
					: status === 'submitting'
						? 'Registering...'
						: 'Register Agent'}
			</button>

			{#if status === 'error'}
				<p class="text-sm text-red-400">{errorMsg}</p>
			{/if}
		</div>
	{/if}
</div>
