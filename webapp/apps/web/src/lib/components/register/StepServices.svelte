<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { ServiceEntry } from '$lib/types.js';
	import { validateUrl } from '@trionlabs/stellar8004';
	import RegisterIcon, { serviceIcon } from './RegisterIcon.svelte';
	import { chip, field } from './ui.js';

	let { services }: { services: ServiceEntry[] } = $props();

	const TYPES = [
		{ id: 'MCP', placeholder: 'https://api.example.com/mcp' },
		{ id: 'A2A', placeholder: 'https://api.example.com/.well-known/agent-card.json' },
		{ id: 'Custom', placeholder: 'https://…' }
	] as const;
	type ServiceType = (typeof TYPES)[number]['id'];

	let activeTab = $state<ServiceType>('MCP');
	let currentName = $state('MCP');
	let currentEndpoint = $state('');
	let currentVersion = $state('');
	let currentDescription = $state('');
	let currentInputExample = $state('');

	const MAX_SERVICES = 20;

	const endpointError = $derived(validateUrl(currentEndpoint.trim()));
	const canSave = $derived(
		currentName.trim().length > 0 && currentEndpoint.trim().length > 0 && !endpointError
	);
	const isAtLimit = $derived(services.length >= MAX_SERVICES);

	function saveService() {
		if (!canSave || isAtLimit) return;
		services.push({
			name: currentName.trim(),
			endpoint: currentEndpoint.trim(),
			version: currentVersion.trim() || undefined,
			description: currentDescription.trim() || undefined,
			inputExample: currentInputExample.trim() || undefined
		});
		currentName = activeTab === 'Custom' ? '' : activeTab;
		currentEndpoint = '';
		currentVersion = '';
		currentDescription = '';
		currentInputExample = '';
	}

	// A valid endpoint typed but never added is kept when the person moves on.
	onDestroy(saveService);

	function switchTab(tab: ServiceType) {
		activeTab = tab;
		currentName = tab === 'Custom' ? '' : tab;
	}
</script>

<div
	class="space-y-3"
	role="group"
	aria-labelledby="services-label"
	onfocusout={(e) => {
		// Leaving the composer (e.g. for Register) keeps a valid endpoint that was not added yet.
		if (!e.currentTarget.contains(e.relatedTarget as Node | null)) saveService();
	}}
>
	<p id="services-label" class="text-sm text-text-muted">Services</p>

	{#if !isAtLimit}
		<div class="flex flex-wrap gap-2">
			{#each TYPES as type (type.id)}
				<button
					type="button"
					aria-pressed={activeTab === type.id}
					onclick={() => switchTab(type.id)}
					class={chip(activeTab === type.id)}
				>
					<RegisterIcon name={serviceIcon(type.id)} />
					{type.id}
				</button>
			{/each}
		</div>

		{#if activeTab === 'Custom'}
			<input
				type="text"
				bind:value={currentName}
				placeholder="Service name, e.g. REST"
				aria-label="Service name"
				class={field}
			/>
		{/if}
		<div class="flex gap-2">
			<input
				type="text"
				inputmode="url"
				bind:value={currentEndpoint}
				placeholder={TYPES.find((t) => t.id === activeTab)?.placeholder}
				aria-label="{activeTab} endpoint"
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						saveService();
					}
				}}
				class="{field} {endpointError ? 'ring-1 ring-negative/50' : ''}"
			/>
			<button
				type="button"
				onclick={saveService}
				disabled={!canSave}
				aria-label="Add service"
				title="Add"
				class="grid w-12 shrink-0 place-items-center rounded-xl bg-text text-surface transition-opacity hover:opacity-85 disabled:opacity-20"
			>
				<RegisterIcon name="plus" />
			</button>
		</div>
		{#if endpointError}
			<p class="text-xs text-negative">{endpointError}</p>
		{/if}

		<details class="group">
			<summary
				class="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm text-text-dim transition-colors hover:text-text [&::-webkit-details-marker]:hidden"
			>
				<RegisterIcon name="plus" class="h-3.5 w-3.5 transition-transform group-open:rotate-45" />
				Version, description, example input
			</summary>
			<div class="space-y-2 pt-3">
				<input
					type="text"
					bind:value={currentVersion}
					placeholder="Version, e.g. 1.0.0"
					aria-label="Version"
					class={field}
				/>
				<textarea
					bind:value={currentDescription}
					placeholder="What this service does"
					aria-label="Service description"
					rows="2"
					class="{field} resize-y"
				></textarea>
				<textarea
					bind:value={currentInputExample}
					placeholder={'Example input, e.g. { "url": "https://example.com" }'}
					aria-label="Example input"
					rows="2"
					class="{field} resize-y font-mono"
				></textarea>
			</div>
		</details>
	{/if}

	{#if services.length > 0}
		<ul class="space-y-2 pt-3">
			{#each services as service, i (service.endpoint)}
				<li class="flex items-center gap-3 rounded-xl bg-surface-raised py-2.5 pr-2.5 pl-4 text-sm">
					<RegisterIcon name={serviceIcon(service.name)} class="h-4 w-4 shrink-0 text-text-dim" />
					<span class="shrink-0 text-text">{service.name}</span>
					<span class="min-w-0 flex-1 truncate font-mono text-xs text-text-dim"
						>{service.endpoint}</span
					>
					{#if service.version}
						<span class="text-xs text-text-dim">v{service.version}</span>
					{/if}
					<button
						type="button"
						onclick={() => services.splice(i, 1)}
						aria-label="Remove {service.name}"
						title="Remove"
						class="rounded-lg p-1.5 text-text-dim transition-colors hover:text-negative"
					>
						<RegisterIcon name="close" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
