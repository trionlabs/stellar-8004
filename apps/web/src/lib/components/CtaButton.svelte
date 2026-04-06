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
		'group relative inline-flex items-center justify-center font-medium tracking-wide transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-40';

	const variants: Record<string, string> = {
		primary:
			'cta-btn cta-btn--primary bg-linear-to-r from-accent/80 to-accent/60 text-surface-raised hover:from-accent/90 hover:to-accent/70 active:scale-[0.98]',
		secondary:
			'cta-btn cta-btn--secondary text-accent hover:bg-accent/5 active:scale-[0.98]',
		ghost:
			'text-text-muted hover:text-accent hover:bg-accent/4 active:scale-[0.98]'
	};

	const sizes: Record<string, string> = {
		sm: 'rounded-lg px-3.5 py-[5px] text-[11px] gap-1.5',
		md: 'rounded-lg px-5 py-2.5 text-[12px] gap-2',
		lg: 'rounded-lg px-7 py-3 text-[13px] gap-2.5'
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
	.cta-btn {
		position: relative;
		overflow: visible;
	}

	/* ── Primary: gradient bg + fine outer glow ── */
	.cta-btn--primary {
		border: 0.5px solid color-mix(in oklch, var(--color-accent) 30%, transparent);
		box-shadow: 0 1px 2px oklch(0 0 0 / 0.2);
	}
	.cta-btn--primary:hover {
		border-color: color-mix(in oklch, var(--color-accent) 50%, transparent);
		box-shadow:
			0 1px 2px oklch(0 0 0 / 0.2),
			0 0 12px color-mix(in oklch, var(--color-accent) 12%, transparent);
	}

	/* Inner shine — fine hairline at top edge, hidden in light mode via shadow variable */
	.cta-btn--primary::after {
		content: '';
		position: absolute;
		top: 0;
		left: 15%;
		right: 15%;
		height: 0.5px;
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in oklch, var(--color-text) 35%, transparent),
			transparent
		);
		pointer-events: none;
		opacity: var(--shine-opacity, 1);
	}

	/* ── Secondary: hairline border ── */
	.cta-btn--secondary {
		border: 0.5px solid color-mix(in oklch, var(--color-accent) 18%, transparent);
	}
	.cta-btn--secondary:hover {
		border-color: color-mix(in oklch, var(--color-accent) 35%, transparent);
		box-shadow: 0 0 10px color-mix(in oklch, var(--color-accent) 6%, transparent);
	}
</style>
