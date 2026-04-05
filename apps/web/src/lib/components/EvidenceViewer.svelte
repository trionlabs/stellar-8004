<script lang="ts">
	const IPFS_GATEWAYS = [
		'https://gateway.pinata.cloud/ipfs/',
		'https://ipfs.io/ipfs/'
	];

	const FETCH_TIMEOUT_MS = 10_000;

	let {
		feedbackUri,
		feedbackHash
	}: {
		feedbackUri: string | null;
		feedbackHash: string | null;
	} = $props();

	let open = $state(false);
	let loading = $state(false);
	let evidenceJson = $state<string | null>(null);
	let hashStatus = $state<'verified' | 'mismatch' | 'no-hash' | null>(null);
	let errorMsg = $state('');

	function extractCid(uri: string): string | null {
		if (!uri.startsWith('ipfs://')) return null;
		return uri.slice('ipfs://'.length).replace(/^ipfs\//, '').replace(/^\/+/, '') || null;
	}

	async function fetchFromGateways(cid: string): Promise<string | null> {
		for (const gateway of IPFS_GATEWAYS) {
			try {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
				try {
					const res = await fetch(`${gateway}${cid}`, { signal: controller.signal });
					if (res.ok) {
						return await res.text();
					}
				} finally {
					clearTimeout(timeout);
				}
			} catch {
				continue;
			}
		}
		return null;
	}

	async function verifyHash(content: string, expectedHash: string): Promise<boolean> {
		const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
		const hashHex = Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		return hashHex.toLowerCase() === expectedHash.toLowerCase();
	}

	async function loadEvidence() {
		if (!feedbackUri || loading) return;

		const cid = extractCid(feedbackUri);
		if (!cid) {
			errorMsg = 'Invalid IPFS URI';
			return;
		}

		loading = true;
		errorMsg = '';
		evidenceJson = null;
		hashStatus = null;

		try {
			const content = await fetchFromGateways(cid);
			if (!content) {
				errorMsg = 'Evidence unavailable — all IPFS gateways failed';
				return;
			}

			// Pretty-print if valid JSON, otherwise show raw
			try {
				const parsed = JSON.parse(content);
				evidenceJson = JSON.stringify(parsed, null, 2);
			} catch {
				evidenceJson = content;
			}

			// Hash verification
			if (!feedbackHash) {
				hashStatus = 'no-hash';
			} else {
				const valid = await verifyHash(content, feedbackHash);
				hashStatus = valid ? 'verified' : 'mismatch';
			}
		} catch {
			errorMsg = 'Failed to load evidence';
		} finally {
			loading = false;
		}
	}

	function toggle() {
		open = !open;
		if (open && !evidenceJson && !errorMsg) {
			loadEvidence();
		}
	}
</script>

{#if feedbackUri}
	<div class="mt-1.5">
		<button
			type="button"
			onclick={toggle}
			class="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[11px] text-accent transition hover:bg-accent/10"
		>
			{#if loading}
				<svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
			{:else}
				<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
			{/if}
			Evidence
		</button>

		{#if open}
			<div class="mt-2 rounded-lg border border-border bg-surface-raised p-3 text-xs">
				{#if errorMsg}
					<p class="text-negative">{errorMsg}</p>
				{:else if evidenceJson}
					<div class="mb-2 flex items-center gap-2">
						{#if hashStatus === 'verified'}
							<span class="inline-flex items-center gap-1 rounded-full bg-positive-soft px-2 py-0.5 text-[11px] text-positive">
								&#10003; Hash verified
							</span>
						{:else if hashStatus === 'mismatch'}
							<span class="inline-flex items-center gap-1 rounded-full bg-negative-soft px-2 py-0.5 text-[11px] text-negative">
								&#10007; Hash mismatch
							</span>
						{:else if hashStatus === 'no-hash'}
							<span class="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] text-warning">
								&#9888; No hash on-chain
							</span>
						{/if}
					</div>
					<pre class="max-h-48 overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-[11px] leading-relaxed text-text-muted">{evidenceJson}</pre>
				{:else if loading}
					<p class="text-text-dim">Fetching evidence from IPFS...</p>
				{/if}
			</div>
		{/if}
	</div>
{/if}
