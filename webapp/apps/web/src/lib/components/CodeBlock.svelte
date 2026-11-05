<script lang="ts">
	import { codeToHtml } from 'shiki/bundle/web';

	let {
		code,
		lang = 'json',
		class: className = ''
	}: { code: string; lang?: string; class?: string } = $props();

	let html = $state('');

	// Both themes in one pass: the dark colours inline, the light ones as --shiki-light, picked by
	// [data-theme] in CSS. Highlighting no longer waits on the JS theme store, so light mode never
	// flashes dark-theme code.
	$effect(() => {
		codeToHtml(code, {
			lang,
			themes: { light: 'github-light-default', dark: 'github-dark-default' },
			defaultColor: 'dark',
			// GitHub's light comment grey is 4.28:1 on our #f8f8f8 surface; this one is 4.74:1 (AA).
			colorReplacements: { 'github-light-default': { '#6e7781': '#67707a' } }
		}).then((result) => {
			html = result;
		});
	});
</script>

<div
	class="overflow-x-auto rounded-lg bg-surface p-3 font-mono text-[11px] leading-relaxed ring-1 ring-border/50 {className}"
>
	<!-- Shiki generates this markup and escapes the source code as text. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</div>

<style>
	:global(.shiki) {
		background: transparent !important;
	}

	:global([data-theme='light'] .shiki),
	:global([data-theme='light'] .shiki span) {
		color: var(--shiki-light) !important;
	}
</style>
