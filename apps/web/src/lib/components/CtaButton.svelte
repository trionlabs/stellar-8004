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
		border: 0.5px solid oklch(0.74 0.07 250 / 0.3);
		box-shadow: 0 1px 2px oklch(0 0 0 / 0.2);
	}
	.cta-btn--primary:hover {
		border-color: oklch(0.74 0.07 250 / 0.5);
		box-shadow:
			0 1px 2px oklch(0 0 0 / 0.2),
			0 0 12px oklch(0.74 0.07 250 / 0.12);
	}

	/* Inner shine — fine hairline at top edge */
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
			oklch(0.92 0.02 250 / 0.35),
			transparent
		);
		pointer-events: none;
	}

	/* ── Secondary: hairline border ── */
	.cta-btn--secondary {
		border: 0.5px solid oklch(0.74 0.07 250 / 0.18);
	}
	.cta-btn--secondary:hover {
		border-color: oklch(0.74 0.07 250 / 0.35);
		box-shadow: 0 0 10px oklch(0.74 0.07 250 / 0.06);
	}
</style>
