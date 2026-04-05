<script lang="ts">
	import { scoreFormatter } from '$lib/formatters.js';

	let {
		avgScore,
		feedbackCount,
		avgValidationScore,
		totalScore
	}: {
		avgScore: number;
		feedbackCount: number;
		avgValidationScore: number;
		totalScore: number;
	} = $props();

	let open = $state(false);

	const volumeFactor = $derived(
		Math.min(100, feedbackCount > 0 ? (Math.log(feedbackCount) / Math.log(100)) * 100 : 0)
	);

	const WEIGHT_FEEDBACK = 0.6;
	const WEIGHT_VOLUME = 0.2;
	const WEIGHT_VALIDATION = 0.2;
</script>

<div class="space-y-2">
	<button
		type="button"
		onclick={() => (open = !open)}
		class="flex items-center gap-1.5 text-xs text-text-muted transition hover:text-text"
	>
		<svg
			class="h-3 w-3 transition-transform {open ? 'rotate-90' : ''}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
		</svg>
		Score Breakdown
	</button>

	{#if open}
		<div class="rounded-lg border border-border bg-surface-raised p-4 text-xs">
			<div class="space-y-2.5">
				<div class="flex items-center justify-between">
					<span class="text-text-muted">Avg Feedback</span>
					<span class="font-mono text-text">
						{scoreFormatter.format(avgScore)} <span class="text-text-dim">x {WEIGHT_FEEDBACK}</span>
						= <span class="text-accent">{scoreFormatter.format(avgScore * WEIGHT_FEEDBACK)}</span>
					</span>
				</div>

				<div class="flex items-center justify-between">
					<span class="group relative text-text-muted">
						Volume Factor
						<span class="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 hidden w-56 rounded-md border border-border bg-surface p-2 text-[11px] leading-relaxed text-text-muted shadow-lg group-hover:block">
							Logarithmic scaling: reaches maximum (100) at 100 feedback entries. Formula: ln(count) / ln(100) x 100
						</span>
					</span>
					<span class="font-mono text-text">
						{scoreFormatter.format(volumeFactor)} <span class="text-text-dim">x {WEIGHT_VOLUME}</span>
						= <span class="text-accent">{scoreFormatter.format(volumeFactor * WEIGHT_VOLUME)}</span>
					</span>
				</div>

				<div class="flex items-center justify-between">
					<span class="text-text-muted">Avg Validation</span>
					<span class="font-mono text-text">
						{scoreFormatter.format(avgValidationScore)} <span class="text-text-dim">x {WEIGHT_VALIDATION}</span>
						= <span class="text-accent">{scoreFormatter.format(avgValidationScore * WEIGHT_VALIDATION)}</span>
					</span>
				</div>

				<div class="border-t border-border pt-2">
					<div class="flex items-center justify-between font-medium">
						<span class="text-text">Total Score</span>
						<span class="text-positive">{scoreFormatter.format(totalScore)}</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
