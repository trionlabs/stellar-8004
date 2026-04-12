<script lang="ts">
	import type { Snippet } from 'svelte';

	type Position = 'top' | 'bottom' | 'left' | 'right';

	let {
		text,
		position = 'top',
		children
	}: {
		text: string;
		position?: Position;
		children: Snippet;
	} = $props();

	const positionClasses: Record<Position, string> = {
		top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
		bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
		left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
		right: 'left-full top-1/2 -translate-y-1/2 ml-1.5'
	};

	const tipId = `tip-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="group/tip relative inline-flex" aria-describedby={tipId}>
	{@render children()}
	<span
		id={tipId}
		role="tooltip"
		class="pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-text-muted shadow-lg group-hover/tip:block group-focus-within/tip:block {positionClasses[position]}"
	>
		{text}
	</span>
</div>
