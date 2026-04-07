<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as StellarSdk from '@stellar/stellar-sdk';
	import { getClients } from '$lib/sdk-client.js';
	import { wallet } from '$lib/wallet.svelte.js';

	let {
		currentWallet,
		agentId
	}: {
		currentWallet: string | null;
		agentId: number;
	} = $props();

	let walletInput = $state('');
	let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
	let errorMsg = $state('');
	let showUnbindConfirm = $state(false);

	const isOwnerWallet = $derived(
		wallet.address && currentWallet &&
		wallet.address.toUpperCase() === currentWallet.toUpperCase()
	);

	const addressError = $derived(
		walletInput.trim() && !StellarSdk.StrKey.isValidEd25519PublicKey(walletInput.trim())
			? 'Invalid Stellar address (must start with G...)' : ''
	);

	const isDifferentAddress = $derived(
		walletInput.trim() && wallet.address && walletInput.trim() !== wallet.address
	);

	async function bindWallet() {
		if (!walletInput.trim() || addressError) return;
		status = 'submitting';
		errorMsg = '';

		try {
			const { identity } = getClients();
			const tx = await identity.set_agent_wallet({
				caller: wallet.address!,
				agent_id: agentId,
				new_wallet: walletInput.trim(),
			});
			await tx.signAndSend();
			status = 'success';
			invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Failed to bind wallet';
			status = 'error';
		}
	}

	async function unbindWallet() {
		status = 'submitting';
		errorMsg = '';
		showUnbindConfirm = false;

		try {
			const { identity } = getClients();
			const tx = await identity.unset_agent_wallet({
				caller: wallet.address!,
				agent_id: agentId,
			});
			await tx.signAndSend();
			status = 'success';
			invalidateAll();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Failed to unbind wallet';
			status = 'error';
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center gap-2.5 rounded-xl bg-accent/4 px-4 py-3 ring-1 ring-accent/10">
		<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
		<p class="text-xs text-text-muted">
			{#if currentWallet}
				Agent wallet is bound to a separate address.
			{:else}
				No agent wallet bound yet. Binding allows a separate wallet to act on behalf of this agent.
			{/if}
		</p>
	</div>

	{#if currentWallet}
		<div class="rounded-xl border border-border bg-surface p-4 space-y-3">
			<p class="text-xs font-medium text-text-muted">Current Agent Wallet</p>
			<div class="flex items-center gap-2">
				<span class="flex-1 font-mono text-sm text-text">{currentWallet}</span>
				{#if isOwnerWallet}
					<span class="rounded-full bg-positive/5 px-2 py-0.5 text-[10px] text-positive">Owner</span>
				{/if}
			</div>

			{#if showUnbindConfirm}
				<div class="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-2">
					<p class="text-xs text-warning">This will remove the wallet binding. The wallet will no longer be able to act on behalf of this agent.</p>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={unbindWallet}
							disabled={status === 'submitting'}
							class="rounded-lg bg-negative/10 px-3 py-1.5 text-xs font-medium text-negative disabled:opacity-40 hover:bg-negative/15 transition-colors"
						>
							{status === 'submitting' ? 'Removing...' : 'Confirm Remove'}
						</button>
						<button
							type="button"
							onclick={() => showUnbindConfirm = false}
							class="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-surface-raised transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => showUnbindConfirm = true}
					disabled={status === 'submitting'}
					class="rounded-lg border border-negative/20 bg-negative/5 px-4 py-2 text-xs font-medium text-negative disabled:opacity-40 hover:bg-negative/10 transition-colors"
				>
					Remove Wallet Binding
				</button>
			{/if}
		</div>
	{:else}
		<div class="space-y-3">
			<input
				type="text"
				bind:value={walletInput}
				placeholder="Stellar address (G...)"
				disabled={status === 'submitting'}
				class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-mono placeholder:text-text-dim focus:border-accent/50 focus:outline-none disabled:opacity-50"
			/>
			{#if addressError}
				<p class="text-[10px] text-negative">{addressError}</p>
			{/if}

			{#if isDifferentAddress}
				<div class="flex items-start gap-2.5 rounded-xl bg-accent/4 px-4 py-3 ring-1 ring-accent/10">
					<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
					</svg>
					<p class="text-xs text-text-muted">
						Binding a different address requires two signatures - one as the agent owner, one as the wallet holder. Both addresses must be available in your Freighter wallet.
					</p>
				</div>
			{/if}

			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => { walletInput = wallet.address ?? ''; }}
					class="rounded-lg border border-border px-4 py-2 text-xs text-text-muted hover:bg-surface-raised transition-colors"
				>
					Use Connected Wallet
				</button>
				<button
					type="button"
					onclick={bindWallet}
					disabled={status === 'submitting' || !walletInput.trim() || !!addressError}
					class="rounded-lg border border-accent/30 bg-accent-fill px-4 py-2 text-xs font-medium text-accent disabled:opacity-40 hover:bg-accent-fill-hover hover:border-accent/45 transition-colors"
				>
					{#if status === 'submitting'}
						Binding...
					{:else}
						Bind Wallet
					{/if}
				</button>
			</div>
		</div>
	{/if}

	{#if status === 'success'}
		<div class="flex items-center gap-2.5 rounded-xl bg-positive/5 px-4 py-3 ring-1 ring-positive/10">
			<span class="h-1.5 w-1.5 rounded-full bg-positive"></span>
			<p class="text-xs text-positive">Transaction submitted - waiting for indexer...</p>
		</div>
	{/if}

	{#if status === 'error'}
		<div class="flex items-start gap-2.5 rounded-xl bg-negative/6 px-4 py-3 ring-1 ring-negative/12">
			<svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
			</svg>
			<p class="text-xs text-negative">{errorMsg}</p>
		</div>
	{/if}
</div>
