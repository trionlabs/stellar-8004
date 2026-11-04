<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CtaButton from '$lib/components/CtaButton.svelte';

	// Unexpected errors carry SvelteKit's generic "Internal Error"; say something useful instead.
	const message = $derived(
		page.status >= 500
			? 'Something went wrong on our side. Try again in a moment.'
			: (page.error?.message ?? 'Not found')
	);
</script>

<svelte:head>
	<title>{page.status} - Stellar8004</title>
</svelte:head>

<div class="space-y-3 py-24 text-center">
	<p class="font-mono text-3xl font-light text-accent/60 tabular-nums">{page.status}</p>
	<p class="text-sm text-text-muted">{message}</p>
	<div class="pt-2">
		<CtaButton href={resolve('/')} variant="secondary" size="sm">Back to home</CtaButton>
	</div>
</div>
