<script lang="ts">
	import type { ServiceEntry } from '$lib/types.js';
	import { validateUrl } from '@trionlabs/8004s-sdk';

	let { services }: { services: ServiceEntry[] } = $props();

	let activeTab = $state<'MCP' | 'A2A' | 'Custom'>('MCP');
	let currentName = $state('');
	let currentEndpoint = $state('');
	let currentVersion = $state('');

	const MAX_SERVICES = 20;

	const endpointError = $derived(validateUrl(currentEndpoint.trim()));
	const canSave = $derived(currentName.trim().length > 0 && currentEndpoint.trim().length > 0 && !endpointError);
	const isAtLimit = $derived(services.length >= MAX_SERVICES);

	function saveService() {
		if (!canSave || isAtLimit) return;
		services.push({
			name: currentName.trim(),
			endpoint: currentEndpoint.trim(),
			version: currentVersion.trim() || undefined
		});
		currentName = activeTab === 'Custom' ? '' : activeTab;
		currentEndpoint = '';
		currentVersion = '';
	}

	function removeService(index: number) {
		services.splice(index, 1);
	}

	function switchTab(tab: 'MCP' | 'A2A' | 'Custom') {
		activeTab = tab;
		if (tab !== 'Custom') {
			currentName = tab;
		} else {
			currentName = '';
		}
	}

	const tabLabel = $derived(activeTab === 'MCP' ? 'MCP' : activeTab === 'A2A' ? 'A2A' : 'Custom');
</script>

<div class="space-y-6">
	<div class="flex items-center gap-2.5 rounded-xl bg-accent/4 px-4 py-3 ring-1 ring-accent/10">
		<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
		<p class="text-xs text-text-muted">Services are optional. Skip this step or add them now.</p>
	</div>

	<div class="flex gap-2">
		{#each ['MCP', 'A2A', 'Custom'] as tab (tab)}
			<button
				type="button"
				onclick={() => switchTab(tab as 'MCP' | 'A2A' | 'Custom')}
				class="rounded-xl border px-4 py-2 text-xs font-medium transition-colors
					{activeTab === tab ? 'border-accent bg-accent/8 text-accent' : 'border-border text-text-muted hover:bg-surface-raised'}"
			>
				{tab}
			</button>
		{/each}
	</div>

	{#if activeTab === 'MCP'}
		<p class="text-[11px] text-text-dim">Model Context Protocol service for AI tools, prompts, and resources</p>
	{:else if activeTab === 'A2A'}
		<p class="text-[11px] text-text-dim">Agent-to-Agent communication service for inter-agent collaboration</p>
	{:else}
		<p class="text-[11px] text-text-dim">Custom service type for other protocols or services</p>
	{/if}

	{#if !isAtLimit}
		<div class="space-y-3">
			{#if activeTab === 'Custom'}
				<input
					type="text"
					bind:value={currentName}
					placeholder="Service name (e.g. Web, REST, gRPC)"
					class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors"
				/>
			{/if}
			<input
				type="text"
				bind:value={currentEndpoint}
				placeholder={activeTab === 'MCP' ? 'https://api.example.com/mcp' : activeTab === 'A2A' ? 'https://api.example.com/.well-known/agent-card.json' : 'https://...'}
				class="w-full rounded-xl border {endpointError ? 'border-negative' : 'border-border'} bg-surface px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors"
			/>
			{#if endpointError}
				<p class="text-[10px] text-negative">{endpointError}</p>
			{/if}
			<input
				type="text"
				bind:value={currentVersion}
				placeholder="Version (e.g. 1.0.0)"
				class="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm placeholder:text-text-dim focus:border-accent/50 focus:outline-none transition-colors"
			/>
			<button
				type="button"
				onclick={saveService}
				disabled={!canSave}
				class="flex items-center gap-2 rounded-xl bg-accent/8 px-4 py-2.5 text-sm font-medium text-accent disabled:opacity-40 hover:bg-accent/15 transition-colors"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				Save & Add Another {tabLabel} Service
			</button>
		</div>
	{/if}

	{#if services.length > 0}
		<div class="space-y-2">
			<h3 class="text-xs font-medium text-text-muted">Added Services ({services.length})</h3>
			{#each services as service, i (service.endpoint)}
				<div class="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
					<span class="rounded-md bg-accent/8 px-2 py-0.5 text-[10px] font-medium text-accent">{service.name}</span>
					<span class="flex-1 truncate font-mono text-[11px] text-text-muted">{service.endpoint}</span>
					{#if service.version}
						<span class="text-[10px] text-text-dim">v{service.version}</span>
					{/if}
					<button
						type="button"
						onclick={() => removeService(i)}
						aria-label="Remove service"
						class="rounded-md p-1 text-text-dim hover:text-negative hover:bg-negative/5 transition-colors"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<div class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-dim">
			No services added yet
		</div>
	{/if}
</div>
