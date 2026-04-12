<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		text,
		position = 'top',
		children
	}: {
		text: string;
		position?: 'top' | 'bottom' | 'left' | 'right';
		children: Snippet;
	} = $props();

	const positionClasses: Record<string, string> = {
		top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
		bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
		left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
		right: 'left-full top-1/2 -translate-y-1/2 ml-1.5'
	};
</script>

<span class="group/tip relative inline-flex">
	{@render children()}
	<span
		role="tooltip"
		class="pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-text-muted shadow-lg group-hover/tip:block group-focus-within/tip:block {positionClasses[position]}"
	>
		{text}
	</span>
</span>
