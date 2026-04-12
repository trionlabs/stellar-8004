<script lang="ts">
	const TRUST_OPTIONS = [
		{ value: 'reputation', label: 'Reputation-based Trust', desc: 'Validators provide subjective feedback on agent performance and behavior' },
		{ value: 'crypto-economic', label: 'Crypto-economic Trust', desc: 'Validators stake tokens to vouch for agent behavior; slashed if found malicious' },
		{ value: 'tee-attestation', label: 'TEE Attestation Trust', desc: 'Trusted Execution Environment provides cryptographic proof of agent code and execution integrity' }
	];

	let { supportedTrust, x402Enabled = $bindable() }: { supportedTrust: string[]; x402Enabled: boolean } = $props();

	function toggleTrust(value: string) {
		const idx = supportedTrust.indexOf(value);
		if (idx === -1) {
			supportedTrust.push(value);
		} else {
			supportedTrust.splice(idx, 1);
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center gap-2.5 rounded-xl bg-accent/4 px-4 py-3 ring-1 ring-accent/10">
		<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
		<p class="text-xs text-text-muted">These options help users understand your agent's trust model and operational capabilities.</p>
	</div>

	<div class="space-y-3">
		<h3 class="text-xs font-medium text-text-muted">Supported Trust Mechanisms</h3>
		<p class="text-[11px] text-text-dim">Select the trust mechanisms your agent supports</p>
		{#each TRUST_OPTIONS as opt (opt.value)}
			<label class="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 cursor-pointer hover:bg-surface-raised transition-colors">
				<input
					type="checkbox"
					checked={supportedTrust.includes(opt.value)}
					onchange={() => toggleTrust(opt.value)}
					class="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent/20"
				/>
				<div>
					<span class="text-sm font-medium text-text">{opt.label}</span>
					<p class="text-[11px] text-text-dim">{opt.desc}</p>
				</div>
			</label>
		{/each}
	</div>

	<hr class="border-border" />

	<div class="space-y-3">
		<h3 class="text-xs font-medium text-text-muted">Payment Protocol Support</h3>
		<p class="text-[11px] text-text-dim">Indicate support for the HTTP 402 Payment Required standard</p>
		<label class="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 cursor-pointer hover:bg-surface-raised transition-colors">
			<input
				type="checkbox"
				bind:checked={x402Enabled}
				class="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent/20"
			/>
			<div>
				<span class="text-sm font-medium text-text">HTTP 402 Payment Support (x402)</span>
				<p class="text-[11px] text-text-dim">Enable if your agent implements the HTTP 402 standard for paid services (microtransactions, per-request billing)</p>
			</div>
		</label>
	</div>
</div>
