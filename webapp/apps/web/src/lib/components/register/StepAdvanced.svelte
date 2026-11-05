<script module lang="ts">
	import type { IconName } from './RegisterIcon.svelte';

	export const TRUST_OPTIONS: { value: IconName; label: string; desc: string }[] = [
		{
			value: 'reputation',
			label: 'Reputation',
			desc: 'Validators provide subjective feedback on agent performance and behavior'
		},
		{
			value: 'crypto-economic',
			label: 'Crypto-economic',
			desc: 'Validators stake tokens to vouch for agent behavior; slashed if found malicious'
		},
		{
			value: 'tee-attestation',
			label: 'TEE',
			desc: 'Trusted Execution Environment provides cryptographic proof of agent code and execution integrity'
		}
	];
</script>

<script lang="ts">
	import RegisterIcon from './RegisterIcon.svelte';
	import { chip } from './ui.js';

	let {
		supportedTrust,
		x402Enabled = $bindable(),
		mppEnabled = $bindable()
	}: { supportedTrust: string[]; x402Enabled: boolean; mppEnabled: boolean } = $props();

	function toggleTrust(value: string) {
		const idx = supportedTrust.indexOf(value);
		if (idx === -1) supportedTrust.push(value);
		else supportedTrust.splice(idx, 1);
	}
</script>

<div class="space-y-10">
	<div class="space-y-3" role="group" aria-labelledby="trust-label">
		<p id="trust-label" class="text-sm text-text-muted">Trust</p>
		<div class="flex flex-wrap gap-2">
			{#each TRUST_OPTIONS as opt (opt.value)}
				{@const on = supportedTrust.includes(opt.value)}
				<button
					type="button"
					aria-pressed={on}
					title={opt.desc}
					onclick={() => toggleTrust(opt.value)}
					class={chip(on)}
				>
					<RegisterIcon name={opt.value} />
					{opt.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="space-y-3" role="group" aria-labelledby="pay-label">
		<p id="pay-label" class="text-sm text-text-muted">Payments</p>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				aria-pressed={x402Enabled}
				title="HTTP 402 payments through a facilitator (OZ Channels / Coinbase)"
				onclick={() => (x402Enabled = !x402Enabled)}
				class={chip(x402Enabled)}
			>
				<RegisterIcon name="x402" />
				x402
			</button>
			<button
				type="button"
				aria-pressed={mppEnabled}
				title="Machine Payments Protocol: direct on-chain settlement, no facilitator"
				onclick={() => (mppEnabled = !mppEnabled)}
				class={chip(mppEnabled)}
			>
				<RegisterIcon name="mpp" />
				MPP
			</button>
		</div>
	</div>
</div>
