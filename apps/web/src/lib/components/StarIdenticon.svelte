<script lang="ts">
	interface Props {
		seed: string;
		size?: number;
	}

	let { seed, size = 40 }: Props = $props();

	const HUES = [210, 250, 285, 320, 160, 190, 140, 30, 350, 55, 115, 270];

	function hashBytes(str: string): number[] {
		const bytes: number[] = [];
		let h = 0;
		for (let i = 0; i < str.length; i++) {
			h = (h * 31 + str.charCodeAt(i)) | 0;
			if (i % 2 === 1) bytes.push(Math.abs(h) & 0xff);
		}
		while (bytes.length < 32) {
			h = (h * 31 + bytes.length) | 0;
			bytes.push(Math.abs(h) & 0xff);
		}
		return bytes;
	}

	const bytes = $derived(hashBytes(seed));
	const hue = $derived(HUES[bytes[0] % HUES.length]);

	const cta1 = $derived(`oklch(0.35 0.06 ${hue})`);   // dark shade
	const cta2 = $derived(`oklch(0.60 0.08 ${hue})`);   // light shade
	const cta3 = 'oklch(0.92 0.005 250)';                // beyaz
	const palette = $derived([cta1, cta2, cta3]);

	// 8x8 grid, 4-fold symmetry, 3 values: dark=50%, light=35%, white=15%
	const grid = $derived.by(() => {
		const cells: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));

		for (let row = 0; row < 4; row++) {
			for (let col = 0; col < 4; col++) {
				const v = bytes[1 + row * 4 + col] % 20;
				const colorIdx = v < 10 ? 0 : v < 17 ? 1 : 2;
				cells[row][col] = colorIdx;
				cells[row][7 - col] = colorIdx;
				cells[7 - row][col] = colorIdx;
				cells[7 - row][7 - col] = colorIdx;
			}
		}
		return cells;
	});
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 64 64"
	aria-hidden="true"
>
	{#each grid as row, y}
		{#each row as colorIdx, x}
			<rect
				x={x * 8}
				y={y * 8}
				width="8"
				height="8"
				fill={palette[colorIdx]}
			/>
		{/each}
	{/each}
</svg>
