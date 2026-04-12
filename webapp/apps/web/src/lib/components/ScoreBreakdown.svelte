<script lang="ts">
	import { scoreFormatter } from '$lib/formatters.js';

	let {
		feedbackCount,
		totalScore
	}: {
		feedbackCount: number;
		totalScore: number;
	} = $props();
</script>

<div class="space-y-2">
	<span class="flex items-center gap-1.5 text-xs text-text-muted">
		<span class="text-text-dim">Score = avg of {feedbackCount} feedback{feedbackCount !== 1 ? 's' : ''}</span>
		<span class="font-mono text-text">{scoreFormatter.format(totalScore)}</span>
	</span>
</div>
