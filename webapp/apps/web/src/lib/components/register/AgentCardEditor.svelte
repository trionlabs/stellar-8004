<script lang="ts">
	import type { AgentFormData } from '$lib/types.js';
	import { validateUrl } from '@trionlabs/stellar8004';
	import RegisterIcon, { serviceIcon, type IconName } from './RegisterIcon.svelte';
	import { TRUST_OPTIONS } from './StepAdvanced.svelte';

	// The agent card is the form: name and description are typed straight into it.
	let { formData, onImage }: { formData: AgentFormData; onImage: () => void } = $props();

	let nameEl: HTMLInputElement | undefined = $state();
	$effect(() => {
		if (!formData.name) nameEl?.focus();
	});

	// Only https images load here (CSP img-src); a failed load falls back to the placeholder.
	let brokenUrl = $state('');
	const image = $derived(
		!validateUrl(formData.imageUrl) &&
			formData.imageUrl.startsWith('https://') &&
			brokenUrl !== formData.imageUrl
			? formData.imageUrl
			: ''
	);

	const tags = $derived<{ icon: IconName; label: string }[]>([
		...formData.services.map((s) => ({ icon: serviceIcon(s.name), label: s.name })),
		...TRUST_OPTIONS.filter((t) => formData.supportedTrust.includes(t.value)).map((t) => ({
			icon: t.value,
			label: t.label
		})),
		...(formData.x402Enabled ? [{ icon: 'x402' as const, label: 'x402' }] : []),
		...(formData.mppEnabled ? [{ icon: 'mpp' as const, label: 'MPP' }] : [])
	]);

	// How complete the public profile is: the name is required, the rest makes the agent easier to find and trust.
	const complete = $derived(
		(formData.name.trim() ? 30 : 0) +
			(formData.description.trim() ? 20 : 0) +
			(image ? 15 : 0) +
			(formData.services.length ? 20 : 0) +
			(formData.supportedTrust.length ? 10 : 0) +
			(formData.x402Enabled || formData.mppEnabled ? 5 : 0)
	);
	const RING = 2 * Math.PI * 15;
</script>

<div data-frame class="flex items-start gap-4 rounded-2xl bg-surface-raised p-5 sm:gap-5 sm:p-6">
	<button
		type="button"
		onclick={onImage}
		aria-label="Set image"
		title="Image"
		class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-overlay text-text-dim transition-colors hover:text-text focus-visible:ring-1 focus-visible:ring-accent/50 focus-visible:outline-none"
	>
		{#if image}
			<img
				src={image}
				alt=""
				class="h-full w-full object-cover"
				onerror={() => (brokenUrl = image)}
			/>
		{:else}
			<RegisterIcon name="image" class="h-5 w-5" />
		{/if}
	</button>
	<div class="min-w-0 flex-1 pt-1">
		<input
			bind:this={nameEl}
			bind:value={formData.name}
			type="text"
			placeholder="Name your agent"
			aria-label="Agent name"
			maxlength="256"
			required
			class="w-full bg-transparent text-xl text-text placeholder:text-text-dim focus:outline-none"
		/>
		<textarea
			bind:value={formData.description}
			placeholder="What it does"
			aria-label="Description"
			maxlength="2048"
			rows="2"
			class="mt-1 [field-sizing:content] w-full resize-none bg-transparent text-sm leading-relaxed text-text-muted placeholder:text-text-dim focus:outline-none"
		></textarea>
		{#if tags.length}
			<ul class="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-text-muted">
				{#each tags as tag, i (i)}
					<li class="flex items-center gap-1.5">
						<RegisterIcon name={tag.icon} class="h-3.5 w-3.5" />{tag.label}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
	{#if complete}
		<div
			class="relative grid h-10 w-10 shrink-0 place-items-center {complete === 100
				? 'text-positive'
				: 'text-accent'}"
			role="img"
			aria-label="Profile {complete}% complete"
			title="Profile completeness"
		>
			<svg class="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
				<circle
					cx="18"
					cy="18"
					r="15"
					fill="none"
					stroke-width="2.5"
					class="stroke-surface-overlay"
				/>
				<circle
					cx="18"
					cy="18"
					r="15"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-dasharray={RING}
					stroke-dashoffset={RING * (1 - complete / 100)}
					class="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
				/>
			</svg>
			<span class="text-[10px] font-medium text-text tabular-nums"
				>{complete}<span class="text-text-dim">%</span></span
			>
		</div>
	{/if}
</div>
