<script lang="ts">
	import './layout.css';
	import { onMount, tick } from 'svelte';
	import { theme } from '$lib/theme.svelte.js';

	let { children } = $props();

	/* ── Theme toggle ─────────────────────────────── */
	const modes = ['light', 'system', 'dark'] as const;
	function cycleTheme() {
		const idx = modes.indexOf(theme.choice);
		theme.set(modes[(idx + 1) % modes.length]);
	}

	/* ── Section definitions ──────────────────────── */
	const sections = [
		{ id: 'hero', label: 'Intro', key: '1' },
		{ id: 'audiences', label: 'For You', key: '2' },
		{ id: 'problem', label: 'Problem', key: '3' },
		{ id: 'solution', label: 'Solution', key: '4' },
		{ id: 'built', label: 'What We Built', key: '5' },
		{ id: 'identity', label: 'Identity', key: '6' },
		{ id: 'reputation', label: 'Reputation', key: '7' },
		{ id: 'validation', label: 'Validation', key: '8' },
		{ id: 'architecture', label: 'Architecture', key: '9' },
		{ id: 'payments', label: 'x402 + MPP', key: '0' },
		{ id: 'scraper', label: 'Scraper Agent', key: '' },
		{ id: 'feedback', label: 'Feedback Loop', key: '' },
		{ id: 'devtools', label: 'Developer Tools', key: '' },
		{ id: 'closing', label: 'stellar8004.com', key: '' },
	];

	let activeIdx = $state(0);
	let progressPct = $state(0);
	let isNavigating = $state(false);

	$effect(() => {
		// keep activeIdx in sync — derived from activeSection
	});

	function navigateTo(idx: number) {
		const clamped = Math.max(0, Math.min(idx, sections.length - 1));
		isNavigating = true;
		const el = document.getElementById(sections[clamped].id);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			// Reset navigating flag after scroll settles
			setTimeout(() => { isNavigating = false; }, 600);
		} else {
			isNavigating = false;
		}
	}

	function goNext() { navigateTo(activeIdx + 1); }
	function goPrev() { navigateTo(activeIdx - 1); }

	/* ── Keyboard navigation ─────────────────────── */
	function handleKeydown(e: KeyboardEvent) {
		// Don't hijack if user is in an input
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

		switch (e.key) {
			case 'ArrowDown':
			case 'ArrowRight':
			case 'j':
				e.preventDefault();
				goNext();
				break;
			case 'ArrowUp':
			case 'ArrowLeft':
			case 'k':
				e.preventDefault();
				goPrev();
				break;
			case 'Home':
				e.preventDefault();
				navigateTo(0);
				break;
			case 'End':
				e.preventDefault();
				navigateTo(sections.length - 1);
				break;
			case 't':
				cycleTheme();
				break;
			default:
				// Number keys 1-9, 0 for section 10
				const numIdx = sections.findIndex(s => s.key === e.key);
				if (numIdx !== -1) {
					e.preventDefault();
					navigateTo(numIdx);
				}
		}
	}

	/* ── Scroll tracking ─────────────────────────── */
	function handleScroll() {
		const max = document.documentElement.scrollHeight - window.innerHeight;
		progressPct = max > 0 ? Math.min((window.scrollY / max) * 100, 100) : 0;
	}

	/* ── Observers ────────────────────────────────── */
	onMount(async () => {
		theme.init();
		await tick();

		const sectionObserver = new IntersectionObserver(
			(entries) => {
				if (isNavigating) return; // Don't update during keyboard nav
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const idx = sections.findIndex(s => s.id === entry.target.id);
						if (idx !== -1) activeIdx = idx;
					}
				}
			},
			{ rootMargin: '-20% 0px -60% 0px' }
		);

		const revealObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						entry.target.classList.add('revealed');
						revealObserver.unobserve(entry.target);
					}
				}
			},
			{ rootMargin: '0px 0px -60px 0px', threshold: 0.05 }
		);

		for (const s of sections) {
			const el = document.getElementById(s.id);
			if (el) sectionObserver.observe(el);
		}
		document.querySelectorAll('.reveal-on-scroll').forEach(el => revealObserver.observe(el));

		return () => {
			sectionObserver.disconnect();
			revealObserver.disconnect();
		};
	});
</script>

<svelte:window onscroll={handleScroll} onkeydown={handleKeydown} />

<svelte:head>
	<title>Stellar8004 — Agent Trust Protocol on Stellar</title>
	<meta name="description" content="Find, use, and trust AI agents on Stellar. On-chain identity, reputation, validation, and x402 + MPP micropayments." />
</svelte:head>

<!-- Scroll progress -->
<div class="fixed top-0 left-0 right-0 z-40 h-px bg-border">
	<div class="h-full bg-accent transition-[width] duration-100 ease-out" style="width: {progressPct}%"></div>
</div>

<!-- Sidebar nav (xl only) -->
<nav class="fixed left-5 top-1/2 -translate-y-1/2 z-50 hidden xl:flex flex-col gap-0.5" aria-label="Section navigation">
	{#each sections as s, i}
		<button
			onclick={() => navigateTo(i)}
			class="group flex items-center gap-2.5 text-left py-0.5"
			aria-current={activeIdx === i ? 'true' : undefined}
		>
			<div class="h-1 rounded-full transition-all duration-300 {activeIdx === i ? 'w-5 bg-accent' : 'w-1.5 bg-border group-hover:bg-text-dim'}"></div>
			<span class="text-[10px] font-mono whitespace-nowrap transition-all duration-300 {activeIdx === i ? 'text-accent opacity-100 translate-x-0' : 'text-text-dim opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'}">
				{s.label}{#if s.key}<span class="text-text-dim/40 ml-1">{s.key}</span>{/if}
			</span>
		</button>
	{/each}
</nav>

<!-- Theme toggle + section counter — top right -->
<div class="fixed top-4 right-4 z-50 flex items-center gap-2">
	<span class="text-[10px] font-mono text-text-dim tabular-nums">{activeIdx + 1}/{sections.length}</span>
	<button
		onclick={cycleTheme}
		class="flex h-8 w-8 items-center justify-center rounded-lg
		       border border-border bg-surface/80 backdrop-blur-sm
		       text-text-dim transition hover:text-text hover:bg-surface-raised/80
		       focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
		title="Theme: {theme.choice} (press T)"
		aria-label="Toggle theme (currently {theme.choice})"
	>
		{#if theme.choice === 'light'}
			<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
		{:else if theme.choice === 'system'}
			<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" /></svg>
		{:else}
			<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
		{/if}
	</button>
</div>

<!-- Keyboard hint — bottom center (fades after 5s) -->
<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none kbd-hint">
	<div class="flex items-center gap-3 rounded-lg border border-border bg-surface/90 backdrop-blur-sm px-4 py-2 text-[10px] font-mono text-text-dim">
		<span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> navigate</span>
		<span class="text-border">·</span>
		<span><kbd class="kbd">1</kbd>-<kbd class="kbd">9</kbd> jump</span>
		<span class="text-border">·</span>
		<span><kbd class="kbd">T</kbd> theme</span>
	</div>
</div>

{@render children()}

<style>
	:global(body) {
		overflow-x: hidden;
		scroll-behavior: smooth;
	}

	/* Smooth scroll snapping feel without actual snap */
	:global(html) {
		scroll-padding-top: 2rem;
	}

	/* Reveal animations */
	:global(.reveal-on-scroll) {
		opacity: 0;
		transform: translateY(20px);
		transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1),
		            transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
	}
	:global(.reveal-on-scroll.revealed) {
		opacity: 1;
		transform: translateY(0);
	}

	:global(.reveal-on-scroll > *) {
		opacity: 0;
		transform: translateY(12px);
		transition: opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1),
		            transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
	}
	:global(.reveal-on-scroll.revealed > *) { opacity: 1; transform: translateY(0); }
	:global(.reveal-on-scroll.revealed > *:nth-child(1)) { transition-delay: 0ms; }
	:global(.reveal-on-scroll.revealed > *:nth-child(2)) { transition-delay: 60ms; }
	:global(.reveal-on-scroll.revealed > *:nth-child(3)) { transition-delay: 120ms; }
	:global(.reveal-on-scroll.revealed > *:nth-child(4)) { transition-delay: 180ms; }
	:global(.reveal-on-scroll.revealed > *:nth-child(5)) { transition-delay: 240ms; }

	/* Keyboard hint bar */
	.kbd-hint {
		animation: hint-fade 6s ease forwards;
	}
	@keyframes hint-fade {
		0%, 60% { opacity: 1; }
		100% { opacity: 0; }
	}

	/* Kbd styling */
	:global(.kbd) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.25rem;
		border-radius: 0.25rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-raised);
		font-size: 9px;
		font-family: var(--font-mono);
		line-height: 1;
	}
</style>
