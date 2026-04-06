<script lang="ts">
	import { codeToHtml } from 'shiki/bundle/web';
	import { theme } from '$lib/theme.svelte.js';

	let { code, lang = 'json', class: className = '' }: { code: string; lang?: string; class?: string } = $props();

	let html = $state('');

	$effect(() => {
		const shikiTheme = theme.resolved === 'light' ? 'github-light-default' : 'github-dark-default';
		codeToHtml(code, {
			lang,
			theme: shikiTheme,
		}).then((result) => {
			html = result;
		});
	});
</script>

<div class="overflow-x-auto rounded-lg bg-surface p-3 font-mono text-[11px] leading-relaxed ring-1 ring-border/50 {className}">
	{@html html}
</div>

<style>
	:global(.shiki) {
		background: transparent !important;
	}
</style>
