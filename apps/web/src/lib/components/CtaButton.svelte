<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		href = undefined,
		onclick = undefined,
		variant = 'primary',
		size = 'md',
		disabled = false,
		full = false,
		children
	}: {
		href?: string;
		onclick?: () => void;
		variant?: 'primary' | 'secondary' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		full?: boolean;
		children: Snippet;
	} = $props();

	const base =
		'relative inline-flex items-center justify-center font-medium tracking-wide transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-40';

	const variants: Record<string, string> = {
		primary:
			'bg-linear-to-r from-accent/90 to-accent/70 text-surface-raised shadow-[0_0_20px_rgba(196,181,165,0.15)] hover:shadow-[0_0_30px_rgba(196,181,165,0.25)] hover:from-accent hover:to-accent/80 active:scale-[0.97]',
		secondary:
			'border border-accent/30 text-accent hover:border-accent/60 hover:bg-accent/5 active:scale-[0.97]',
		ghost:
			'text-text-muted hover:text-accent hover:bg-accent/5 active:scale-[0.97]'
	};

	const sizes: Record<string, string> = {
		sm: 'rounded-lg px-4 py-2 text-xs gap-1.5',
		md: 'rounded-xl px-6 py-3 text-sm gap-2',
		lg: 'rounded-xl px-8 py-4 text-base gap-2.5'
	};

	const classes = $derived(`${base} ${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''}`);
</script>

{#if href}
	<a {href} class={classes}>
		{@render children()}
	</a>
{:else}
	<button {onclick} {disabled} class={classes}>
		{@render children()}
	</button>
{/if}
