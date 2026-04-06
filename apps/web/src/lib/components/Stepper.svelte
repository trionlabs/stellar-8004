<script lang="ts">
	interface StepDef {
		label: string;
	}

	let { steps, currentStep = $bindable(0) }: { steps: StepDef[]; currentStep?: number } = $props();
</script>

<div class="flex items-start gap-1 sm:gap-2">
	{#each steps as step, i (i)}
		<div class="flex flex-1 flex-col items-center">
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors
					{i < currentStep ? 'bg-accent-medium text-accent' : ''}
					{i === currentStep ? 'border-2 border-accent text-accent' : ''}
					{i > currentStep ? 'border border-border text-text-dim' : ''}"
			>
				{#if i < currentStep}
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				{:else}
					{i + 1}
				{/if}
			</div>
			<span class="mt-1.5 text-center text-[11px] {i === currentStep ? 'text-accent' : i < currentStep ? 'text-text-muted' : 'text-text-dim'}">
				{step.label}
			</span>
		</div>
		{#if i < steps.length - 1}
			<div class="flex flex-1 items-center pt-4">
				<div class="h-0.5 w-full transition-colors {i < currentStep ? 'bg-accent' : 'bg-border'}"></div>
			</div>
		{/if}
	{/each}
</div>
