<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { wallet } from '$lib/wallet.svelte.js';
	import { createSupabase } from '$lib/supabase.js';
	import StarIdenticon from './StarIdenticon.svelte';

	let mounted = $state(false);
	let agentCount = $state<number | null>(null);
	let open = $state(false);
	let copied = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);

	onMount(() => {
		mounted = true;
	});

	async function fetchAgentCount(address: string) {
		try {
			const { count } = await createSupabase()
				.from('agents')
				.select('id', { count: 'exact', head: true })
				.ilike('owner', address);
			if (address === wallet.address) {
				agentCount = count;
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

	function toggle(e: MouseEvent) {
		e.stopPropagation();
		open = !open;
	}

	function close() {
		open = false;
	}

	function closeFromOutside() {
		if (open) close();
	}

	async function copyAddress(e: MouseEvent) {
		e.stopPropagation();
		if (!wallet.address) return;
		await navigator.clipboard.writeText(wallet.address);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			close();
			triggerEl?.focus();
		}
	}
</script>

<svelte:window onclick={closeFromOutside} onkeydown={handleKeydown} />

{#if !mounted}
	<button class="rounded-lg px-4 py-2 text-sm text-text-dim" disabled>
		Loading...
	</button>
{:else if wallet.connected}
	<div class="relative z-50">
		<button
			bind:this={triggerEl}
			onclick={toggle}
			class="flex items-center gap-2 rounded-xl border border-border bg-surface-raised/50 px-2.5 py-1.5 transition-colors hover:bg-surface-raised hover:border-border-subtle"
			aria-expanded={open}
			aria-haspopup="true"
		>
			{#if wallet.address}
				<StarIdenticon seed={wallet.address} size={24} />
			{/if}
			<span class="font-mono text-xs text-text-muted">{wallet.truncatedAddress}</span>
			<svg
				class="h-3 w-3 text-text-dim transition-transform {open ? 'rotate-180' : ''}"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		{#if open}
			<div
				role="menu"
				tabindex="-1"
				onclick={(e: MouseEvent) => e.stopPropagation()}
				onkeydown={(e: KeyboardEvent) => { if (e.key === 'Escape') { close(); triggerEl?.focus(); } }}
				class="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg shadow-black/20"
			>
				<!-- Header: identicon + address + network -->
				<div class="border-b border-border p-4">
					<div class="flex items-center gap-3">
						{#if wallet.address}
							<StarIdenticon seed={wallet.address} size={36} />
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate font-mono text-xs text-text">
									{wallet.truncatedAddress}
								</span>
								<button
									onclick={copyAddress}
									class="shrink-0 rounded p-1 text-text-dim transition-colors hover:bg-surface-overlay hover:text-text"
									aria-label="Copy address"
								>
									{#if copied}
										<svg class="h-3.5 w-3.5 text-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{:else}
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
										</svg>
									{/if}
								</button>
							</div>
							{#if wallet.network}
								<span
									class="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium {wallet.networkMismatch
										? 'bg-warning-soft text-warning'
										: 'bg-positive-soft text-positive'}"
								>
									<span class="h-1 w-1 rounded-full {wallet.networkMismatch ? 'bg-warning' : 'bg-positive'}"></span>
									{wallet.network}
								</span>
							{/if}
						</div>
					</div>
				</div>

				<!-- Links -->
				<div class="border-b border-border py-1">
					<a
						href={resolve('/agents') + `?owner=${wallet.address}`}
						onclick={close}
						class="flex items-center justify-between px-4 py-2.5 text-sm text-text-muted transition-colors hover:bg-surface-overlay hover:text-text"
					>
						<span class="flex items-center gap-2.5">
							<svg class="h-4 w-4 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
							</svg>
							My Agents
						</span>
						{#if agentCount != null && agentCount > 0}
							<span class="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
								{agentCount}
							</span>
						{/if}
					</a>
				</div>

				<!-- Disconnect -->
				<div class="py-1">
					<button
						onclick={() => { wallet.disconnect(); close(); }}
						class="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-text-dim transition-colors hover:bg-surface-overlay hover:text-negative"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
						</svg>
						Disconnect
					</button>
				</div>
			</div>
		{/if}
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
