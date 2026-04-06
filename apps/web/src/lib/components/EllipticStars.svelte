<script lang="ts">
	import { onMount } from 'svelte';

	const browser = typeof window !== 'undefined';

	let container: SVGSVGElement = $state() as SVGSVGElement;
	let mouse = { x: -1000, y: -1000 };
	let smoothMouse = { x: -1000, y: -1000 };
	let animId: number;

	const SPACING = 24;
	const GLOW_RADIUS = 100;
	const GLOW_RADIUS_SQ = GLOW_RADIUS * GLOW_RADIUS;
	const BASE_OPACITY = 0.008;
	const MAX_OPACITY = 0.3;
	const FOLLOW_LERP = 0.1;

	const paths = [
		'M-1.2,0L-0.4,0L0,-1.2L0,-0.4L1.2,0L0.4,0L0,1.2L0,0.4Z',
		'M-2.2,0L-0.7,0L0,-2.2L0,-0.7L2.2,0L0.7,0L0,2.2L0,0.7Z',
		'M-3.5,0L-1.2,0L0,-3.5L0,-1.2L3.5,0L1.2,0L0,3.5L0,1.2Z',
	];

	const T1 = 0.3 * 0.3;
	const T2 = 0.6 * 0.6;

	const IDLE_THRESHOLD = 0.1;
	const RESIZE_DEBOUNCE = 150;

	let els: SVGPathElement[] = [];
	let sx: Float64Array;
	let sy: Float64Array;
	let phase: Float64Array;
	let count = 0;
	let idle = false;
	let resizeTimer: ReturnType<typeof setTimeout>;

	function debouncedBuildGrid() {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(buildGrid, RESIZE_DEBOUNCE);
	}

	function buildGrid() {
		const w = window.innerWidth;
		const h = window.innerHeight;
		container.setAttribute('width', String(w));
		container.setAttribute('height', String(h));
		container.setAttribute('viewBox', `0 0 ${w} ${h}`);

		const cols = Math.ceil(w / SPACING) + 1;
		const rows = Math.ceil(h / SPACING) + 1;
		const total = cols * rows;

		while (els.length > total) {
			els.pop()?.remove();
		}

		sx = new Float64Array(total);
		sy = new Float64Array(total);
		phase = new Float64Array(total);
		count = total;

		for (let i = 0; i < total; i++) {
			const col = i % cols;
			const row = (i / cols) | 0;
			sx[i] = col * SPACING + SPACING / 2;
			sy[i] = row * SPACING + SPACING / 2;
			phase[i] = Math.random() * 6.2832;

			if (i < els.length) continue;
			const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			p.setAttribute('d', paths[0]);
			p.setAttribute('fill', 'oklch(0.64 0.012 250)');
			container.appendChild(p);
			els.push(p);
		}
	}

	function animate(time: number) {
		const dx = mouse.x - smoothMouse.x;
		const dy = mouse.y - smoothMouse.y;

		if (idle && dx * dx + dy * dy < IDLE_THRESHOLD) {
			animId = requestAnimationFrame(animate);
			return;
		}

		smoothMouse.x += dx * FOLLOW_LERP;
		smoothMouse.y += dy * FOLLOW_LERP;

		idle = dx * dx + dy * dy < IDLE_THRESHOLD;

		const mx = smoothMouse.x;
		const my = smoothMouse.y;
		const t = time * 0.0015;
		const invR = 1 / GLOW_RADIUS;
		const range = MAX_OPACITY - BASE_OPACITY;

		for (let i = 0; i < count; i++) {
			const ddx = sx[i] - mx;
			const ddy = sy[i] - my;
			const distSq = ddx * ddx + ddy * ddy;

			if (distSq > GLOW_RADIUS_SQ) {
				els[i].style.opacity = '0.005';
				continue;
			}

			const dist = Math.sqrt(distSq);
			const prox = 1 - dist * invR;
			const p2 = prox * prox;

			const pathIdx = p2 > T2 ? 2 : p2 > T1 ? 1 : 0;
			const breathe = 0.85 + 0.15 * Math.sin(t + phase[i]);
			const opacity = BASE_OPACITY + range * p2 * breathe;

			const el = els[i];
			el.setAttribute('d', paths[pathIdx]);
			el.style.transform = `translate(${sx[i]}px,${sy[i]}px)`;
			el.style.opacity = String(opacity);
		}

		animId = requestAnimationFrame(animate);
	}

	function onMove(e: MouseEvent) {
		mouse.x = e.clientX;
		mouse.y = e.clientY;
		idle = false;
	}

	onMount(() => {
		buildGrid();
		window.addEventListener('mousemove', onMove, { passive: true });
		window.addEventListener('resize', debouncedBuildGrid);
		animId = requestAnimationFrame(animate);

		return () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('resize', debouncedBuildGrid);
			clearTimeout(resizeTimer);
			cancelAnimationFrame(animId);
		};
	});
</script>

{#if browser}
	<svg
		bind:this={container}
		class="pointer-events-none fixed inset-0"
		style="z-index: -1;"
	></svg>
{/if}
