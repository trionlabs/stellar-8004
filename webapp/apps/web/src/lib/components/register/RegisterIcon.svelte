<script module lang="ts">
	// 24px outline icons for the registration flow, one path each.
	const PATHS = {
		mcp: 'M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0zM12 16v5',
		a2a: 'M5 8h13l-3.5-3.5M19 16H6l3.5 3.5',
		custom:
			'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3c-2.4 2.6-3.5 5.6-3.5 9s1.1 6.4 3.5 9M12 3c2.4 2.6 3.5 5.6 3.5 9s-1.1 6.4-3.5 9',
		reputation: 'M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7.9-5.6-4-3.9 5.6-.8z',
		'crypto-economic':
			'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6',
		'tee-attestation': 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
		x402: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
		mpp: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
		image:
			'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM4 15.5l4.5-4.5 4 4 2.5-2.5 5 5M15 9.5h.01',
		plus: 'M12 5v14M5 12h14',
		close: 'M7 7l10 10M17 7L7 17',
		download: 'M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14',
		link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
		wallet:
			'M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3M4 7.5v10A2.5 2.5 0 0 0 6.5 20H20V8H6.5A2.5 2.5 0 0 1 4 7.5zM16 14h.01',
		check: 'M5 12.5l4.5 4.5L19 7.5',
		copy: 'M10.5 8h8A2.5 2.5 0 0 1 21 10.5v8a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 8 18.5v-8A2.5 2.5 0 0 1 10.5 8zM16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8',
		edit: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4',
		code: 'M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5',
		back: 'M14.5 6l-6 6 6 6',
		next: 'M5 12h14m-5-5.5L19.5 12 14 17.5',
		alert: 'M12 8v5M12 16.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'
	} as const;

	export type IconName = keyof typeof PATHS;

	export function serviceIcon(name: string): IconName {
		return name === 'MCP' ? 'mcp' : name === 'A2A' ? 'a2a' : 'custom';
	}
</script>

<script lang="ts">
	let { name, class: cls = 'h-4 w-4' }: { name: IconName; class?: string } = $props();
</script>

<svg
	class={cls}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={PATHS[name]} /></svg
>
