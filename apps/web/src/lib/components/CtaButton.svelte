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
		'group relative inline-flex items-center justify-center font-medium tracking-wide transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-40';

	const variants: Record<string, string> = {
		primary:
			'cta-btn cta-btn--primary bg-linear-to-r from-accent/90 to-accent/70 text-surface-raised shadow-(--shadow-accent-sm) hover:shadow-(--shadow-accent-md) hover:from-accent hover:to-accent/80 active:scale-[0.98]',
		secondary:
			'cta-btn cta-btn--secondary border border-accent/20 text-accent hover:border-accent/50 hover:bg-accent/5 active:scale-[0.98]',
		ghost:
			'text-text-muted hover:text-accent hover:bg-accent/5 active:scale-[0.98]'
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

<style>
	/* Glow border — thin outer glow that intensifies on hover */
	.cta-btn {
		position: relative;
		overflow: visible;
	}

	.cta-btn::before {
		content: '';
		position: absolute;
		inset: -1px;
		border-radius: inherit;
		opacity: 0;
		transition: opacity 0.4s ease;
		pointer-events: none;
		z-index: -1;
	}

	.cta-btn--primary::before {
		box-shadow:
			0 0 8px oklch(0.74 0.07 250 / 0.25),
			0 0 20px oklch(0.74 0.07 250 / 0.10);
	}

	.cta-btn--secondary::before {
		box-shadow:
			0 0 6px oklch(0.74 0.07 250 / 0.20),
			0 0 16px oklch(0.74 0.07 250 / 0.08);
	}

	.cta-btn:hover::before {
		opacity: 1;
	}

	/* Subtle inner shine line on top edge */
	.cta-btn--primary::after {
		content: '';
		position: absolute;
		top: 0;
		left: 10%;
		right: 10%;
		height: 1px;
		background: linear-gradient(
			90deg,
			transparent,
			oklch(0.90 0.03 250 / 0.4),
			transparent
		);
		border-radius: inherit;
		pointer-events: none;
	}
</style>
