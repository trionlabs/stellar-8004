<script>
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Stellar8004 — Agent Trust Protocol on Stellar</title>
	<meta name="description" content="Find, use, and trust AI agents on Stellar. On-chain identity, reputation, validation, and x402 + MPP micropayments." />
</svelte:head>

{@render children()}
