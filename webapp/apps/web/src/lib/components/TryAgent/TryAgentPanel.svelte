<script lang="ts">
	import { onMount } from 'svelte';
	import { wallet } from '$lib/wallet.svelte.js';
	import { shortAddress } from '$lib/formatters.js';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import RequestEditor from './RequestEditor.svelte';
	import ResponseViewer from './ResponseViewer.svelte';

	interface ServiceEntry {
		name: string;
		endpoint: string;
		version?: string;
		description?: string;
		inputExample?: string;
	}

	let {
		services,
		x402Enabled,
		autoOpen = false
	}: {
		services: ServiceEntry[];
		x402Enabled: boolean;
		autoOpen?: boolean;
	} = $props();

	// x402 client (browser-only, lazy loaded)
	let x402Module: typeof import('$lib/x402-client') | null = $state(null);

	onMount(async () => {
		try {
			x402Module = await import('$lib/x402-client.js');
		} catch (err) {
			console.error('Failed to load x402 client:', err);
		}

		if (autoOpen && wallet.connected) {
			const idx = services.findIndex((s) => isX402Service(s));
			if (idx !== -1) openTryPanel(idx);
		}
	});

	// --- State ---
	type Phase =
		| 'idle'
		| 'editing'
		| 'sending'
		| 'price_confirm'
		| 'signing'
		| 'waiting_response'
		| 'done'
		| 'cors_error'
		| 'error';

	let activeServiceIdx = $state<number | null>(null);
	let phase = $state<Phase>('idle');
	let method = $state('POST');
	let body = $state('');
	let errorMsg = $state('');

	let pricingInfo = $state<{
		price: string;
		network: string;
		payTo: string;
		scheme: string;
	} | null>(null);

	let response = $state<{
		status: number;
		body: string;
		settlementTxHash: string | null;
	} | null>(null);

	// Derived
	const activeService = $derived(activeServiceIdx !== null ? services[activeServiceIdx] : null);
	const busy = $derived(
		phase === 'sending' || phase === 'signing' || phase === 'waiting_response'
	);

	const formattedPrice = $derived.by(() => {
		if (!pricingInfo?.price) return null;
		const raw = pricingInfo.price;
		if (raw.startsWith('$')) return raw;
		const num = Number(raw);
		if (!isNaN(num) && num > 0) {
			const usdc = num / 1e7;
			return `$${usdc.toFixed(usdc < 0.01 ? 4 : 2)}`;
		}
		return raw;
	});

	const curlCommand = $derived.by(() => {
		if (!activeService) return '';
		const parts = [`curl -X ${method}`];
		if (method !== 'GET' && method !== 'HEAD' && body) {
			parts.push(`-H "Content-Type: application/json"`);
			parts.push(`-d '${body}'`);
		}
		parts.push(`"${activeService.endpoint}"`);
		return parts.join(' \\\n  ');
	});

	const PROTOCOL_ICONS: Record<string, string> = {
		x402: '$',
		mcp: 'M',
		a2a: 'A',
		web: 'W'
	};

	function isX402Service(service: ServiceEntry): boolean {
		return (
			x402Enabled &&
			service.endpoint.startsWith('http') &&
			(service.name.toLowerCase() === 'x402' ||
				service.name.toLowerCase() === 'web' ||
				service.name.toLowerCase() === 'rest' ||
				service.name.toLowerCase() === 'http')
		);
	}

	function openTryPanel(idx: number) {
		activeServiceIdx = idx;
		phase = 'editing';
		method = 'POST';
		body = services[idx].inputExample || '';
		errorMsg = '';
		pricingInfo = null;
		response = null;
	}

	function closeTryPanel() {
		activeServiceIdx = null;
		phase = 'idle';
		pricingInfo = null;
		response = null;
		errorMsg = '';
	}

	function resetToEditing() {
		phase = 'editing';
		response = null;
		pricingInfo = null;
		errorMsg = '';
	}

	let copySuccess = $state(false);

	async function copyCurl() {
		await navigator.clipboard.writeText(curlCommand);
		copySuccess = true;
		setTimeout(() => {
			copySuccess = false;
		}, 1500);
	}

	function buildFetchOptions(): { headers?: Record<string, string>; body?: string } {
		const headers: Record<string, string> = {};
		let fetchBody: string | undefined;
		if (method !== 'GET' && method !== 'HEAD' && body) {
			headers['Content-Type'] = 'application/json';
			fetchBody = body;
		}
		return {
			headers: Object.keys(headers).length > 0 ? headers : undefined,
			body: fetchBody
		};
	}

	async function submitRequest() {
		if (!activeService || !wallet.address || busy) return;

		// Client-side JSON validation before sending
		if (method !== 'GET' && body.trim()) {
			try {
				JSON.parse(body);
			} catch {
				const trimmed = body.trim();
				if (/^https?:\/\//i.test(trimmed)) {
					// User pasted a raw URL — auto-wrap as JSON and continue
					body = JSON.stringify({ url: trimmed });
				} else {
					errorMsg = 'Request body must be valid JSON.';
					phase = 'error';
					return;
				}
			}
		}

		phase = 'sending';
		errorMsg = '';

		try {
			const opts = buildFetchOptions();
			const res = await fetch(activeService.endpoint, {
				method,
				headers: opts.headers,
				body: opts.body,
				signal: AbortSignal.timeout(15_000)
			});

			if (res.status === 402) {
				const paymentHeader =
					res.headers.get('PAYMENT-REQUIRED') || res.headers.get('X-PAYMENT');
				if (!paymentHeader) {
					errorMsg =
						'Endpoint returned 402 but the payment header is not accessible. The agent may need CORS headers.';
					phase = 'cors_error';
					return;
				}

				try {
					// Some agents have invalid JSON escapes (e.g. \$ instead of $) in descriptions
					const raw = atob(paymentHeader).replace(/\\(?!["\\/bfnrtu])/g, '');
					const decoded = JSON.parse(raw);
					// x402 PaymentRequired wraps requirements in an accepts[] array
					const req = decoded.accepts?.[0] ?? decoded;
					pricingInfo = {
						price: req.maxAmountRequired || req.amount || req.price || '?',
						network: req.network || decoded.network || 'unknown',
						payTo: req.payTo || req.payToAddress || '',
						scheme: req.scheme || 'exact'
					};
					phase = 'price_confirm';
				} catch {
					errorMsg = 'Could not parse payment header.';
					phase = 'error';
				}
			} else {
				const text = await res.text();
				response = { status: res.status, body: text, settlementTxHash: null };
				phase = 'done';
			}
		} catch (err) {
			handleFetchError(err);
		}
	}

	async function sendPaidRequest() {
		if (!activeService || !wallet.address || !pricingInfo) return;

		if (!x402Module) {
			errorMsg = 'Payment module failed to load. Please refresh the page.';
			phase = 'error';
			return;
		}

		if (wallet.networkMismatch) {
			errorMsg = `Switch Freighter to ${pricingInfo.network.includes('mainnet') ? 'Mainnet' : 'Testnet'} to continue.`;
			phase = 'error';
			return;
		}

		phase = 'signing';
		errorMsg = '';

		try {
			const client = x402Module.createX402Client(wallet.address);
			const { decodePaymentRequiredHeader, encodePaymentSignatureHeader } = x402Module;
			const opts = buildFetchOptions();

			// Step 1: Fresh 402 for nonce
			const preflightRes = await fetch(activeService.endpoint, {
				method,
				headers: opts.headers,
				body: opts.body,
				signal: AbortSignal.timeout(15_000)
			});

			if (preflightRes.status !== 402) {
				const text = await preflightRes.text();
				response = { status: preflightRes.status, body: text, settlementTxHash: null };
				phase = 'done';
				return;
			}

			// Step 2: Parse payment requirement from header
			const paymentRequiredHeader = preflightRes.headers.get('PAYMENT-REQUIRED');
			if (!paymentRequiredHeader) {
				errorMsg = 'Payment header not accessible. The agent may need CORS headers.';
				phase = 'cors_error';
				return;
			}
			let paymentRequired;
			try {
				paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
			} catch {
				// Fallback: fix invalid JSON escapes (e.g. \$ in agent descriptions)
				const fixed = atob(paymentRequiredHeader).replace(/\\(?!["\\/bfnrtu])/g, '');
				paymentRequired = JSON.parse(fixed);
			}

			// Step 3: Create payment payload — triggers Freighter signAuthEntry popup
			// Timeout after 60s — Freighter may hang due to SES lockdown or popup not visible
			const paymentPayload = await Promise.race([
				client.createPaymentPayload(paymentRequired),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('Signing timed out. Freighter may not have opened — check for a popup or try again.')), 60_000)
				)
			]);

			phase = 'waiting_response';

			// Step 4: Encode payment signature header
			const paymentHeader = encodePaymentSignatureHeader(paymentPayload);

			// Step 5: Send actual request with payment
			const paidHeaders: Record<string, string> = { 'PAYMENT-SIGNATURE': paymentHeader };
			if (method !== 'GET' && body) {
				paidHeaders['Content-Type'] = 'application/json';
			}

			const paidRes = await fetch(activeService.endpoint, {
				method,
				headers: paidHeaders,
				body: method !== 'GET' && method !== 'HEAD' ? body || undefined : undefined,
				signal: AbortSignal.timeout(30_000)
			});

			const paidBody = await paidRes.text();

			// Step 6: Parse settlement response
			let settlementTxHash: string | null = null;
			try {
				const paymentResponseHeader = paidRes.headers.get('PAYMENT-RESPONSE');
				if (paymentResponseHeader) {
					const settlement = JSON.parse(atob(paymentResponseHeader));
					settlementTxHash = settlement?.txHash ?? settlement?.transaction ?? null;
				}
			} catch {
				// Settlement header may not be present — non-blocking
			}

			response = { status: paidRes.status, body: paidBody, settlementTxHash };
			phase = 'done';
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Payment failed';
			if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
				errorMsg = 'Transaction was rejected. You can try again.';
				phase = 'price_confirm'; // Go back to confirmation, not error
			} else if (msg.includes('timed out')) {
				errorMsg = 'Request timed out. Please try again.';
				phase = 'error';
			} else if (msg.includes('insufficient') || msg.includes('balance')) {
				errorMsg = `Insufficient USDC balance. You need ${formattedPrice || 'funds'}.`;
				phase = 'error';
			} else if (
				msg.includes('Failed to fetch') ||
				msg.includes('NetworkError')
			) {
				phase = 'cors_error';
			} else {
				errorMsg = msg;
				phase = 'error';
			}
		}
	}

	function handleFetchError(err: unknown) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (
			msg.includes('Failed to fetch') ||
			msg.includes('NetworkError') ||
			msg.includes('CORS')
		) {
			phase = 'cors_error';
		} else if (msg.includes('timed out')) {
			errorMsg = 'Request timed out. The service may be offline.';
			phase = 'error';
		} else {
			errorMsg = msg;
			phase = 'error';
		}
	}
</script>

<section class="try-section">
	<div class="flex items-center gap-3">
		<div class="try-section__icon">
			<svg
				class="h-4.5 w-4.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
				/>
			</svg>
		</div>
		<div>
			<h2 class="text-base font-medium text-text">Try this Agent</h2>
			<p class="text-xs text-text-dim">Send paid requests via x402 micropayments</p>
		</div>
	</div>

	{#if !wallet.connected}
		<button
			type="button"
			onclick={() => wallet.connect()}
			class="try-lava-btn try-lava-btn--wide"
		>
			<span class="try-lava-btn__bg"></span>
			<span class="try-lava-btn__label try-lava-btn__label--wide">
				<svg class="try-wallet-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
				</svg>
				Connect & Try
			</span>
		</button>
	{:else}
		<div class="divide-y divide-border/30 rounded-xl border border-border/40 overflow-hidden">
			{#each services as service, idx}
				{@const tryable = isX402Service(service)}
				{@const isActive = activeServiceIdx === idx}

				<div class={isActive ? 'bg-accent/3' : ''}>
					<div class="flex items-center gap-3 px-4 py-3">
						<!-- Protocol icon -->
						<span
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-medium
							{tryable
								? 'border-accent/20 bg-accent/5 text-accent'
								: 'border-border bg-surface-raised text-text-dim'}"
						>
							{PROTOCOL_ICONS[service.name.toLowerCase()] ??
								service.name.charAt(0).toUpperCase()}
						</span>

						<!-- Service info -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium text-text">{service.name}</span>
								{#if service.version}
									<span
										class="rounded-full border border-border bg-surface-raised px-1.5 py-0.5 text-[9px] text-text-dim"
									>
										v{service.version}
									</span>
								{/if}
							</div>
							<p class="truncate font-mono text-[11px] text-text-muted">
								{service.endpoint}
							</p>
							{#if service.description}
								<p class="truncate text-[11px] text-text-dim">{service.description}</p>
							{/if}
						</div>

						<!-- Price badge -->
						{#if isActive && pricingInfo && formattedPrice}
							<span
								class="rounded-full border border-positive/15 bg-positive/5 px-2 py-0.5 text-[10px] font-medium text-positive"
							>
								{formattedPrice} USDC
							</span>
						{/if}

						<!-- Try / Close button -->
						{#if tryable}
							{#if isActive}
								<button
									type="button"
									onclick={closeTryPanel}
									class="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition hover:bg-surface-raised"
								>
									Close
								</button>
							{:else}
								<button
									type="button"
									onclick={() => openTryPanel(idx)}
									class="try-lava-btn"
								>
									<span class="try-lava-btn__bg"></span>
									<span class="try-lava-btn__label">Try</span>
								</button>
							{/if}
						{/if}
					</div>

					<!-- Inline try panel -->
					{#if isActive}
						<div class="border-t border-border/20 px-4 py-4 space-y-4">
							{#if phase === 'editing' || phase === 'sending'}
								<RequestEditor
									bind:method
									bind:body
									onsubmit={submitRequest}
									price={null}
									busy={phase === 'sending'}
								/>
								{#if phase === 'sending'}
									<div class="flex items-center gap-2 text-xs text-text-muted">
										<svg
											class="h-3.5 w-3.5 animate-spin"
											viewBox="0 0 24 24"
											fill="none"
										>
											<circle
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												stroke-width="2"
												opacity="0.25"
											/>
											<path
												d="M12 2a10 10 0 019.95 9"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
											/>
										</svg>
										Sending request...
									</div>
								{/if}

							{:else if phase === 'price_confirm'}
								{#if pricingInfo}
									<div
										class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/30 bg-surface px-3 py-2 text-[11px]"
									>
										<span class="text-text-dim">
											Price: <span class="font-medium text-text"
												>{formattedPrice} USDC</span
											>
										</span>
										<span class="text-text-dim">
											Network: <span class="text-text">{pricingInfo.network}</span>
										</span>
										{#if pricingInfo.payTo}
											<Tooltip text={pricingInfo.payTo}>
												<span class="text-text-dim">
													Pay to: <span class="font-mono text-text"
														>{shortAddress(pricingInfo.payTo)}</span
													>
												</span>
											</Tooltip>
										{/if}
									</div>
								{/if}

								{#if errorMsg}
									<p class="text-xs text-warning">{errorMsg}</p>
								{/if}

								<div class="flex items-center gap-3">
									<button
										type="button"
										onclick={sendPaidRequest}
										class="rounded-lg border border-accent/30 bg-accent-fill px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent-fill-hover hover:border-accent/45"
									>
										Confirm & Pay {formattedPrice}
									</button>
									<button
										type="button"
										onclick={resetToEditing}
										class="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition hover:bg-surface-raised"
									>
										Back
									</button>
								</div>

							{:else if phase === 'signing'}
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2 text-xs text-accent">
										<svg
											class="h-3.5 w-3.5 animate-spin"
											viewBox="0 0 24 24"
											fill="none"
										>
											<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
											<path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
										</svg>
										Confirm in Freighter...
									</div>
									<button type="button" onclick={resetToEditing} class="text-xs text-text-dim hover:text-text transition">
										Cancel
									</button>
								</div>

							{:else if phase === 'waiting_response'}
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2 text-xs text-text-muted">
										<svg
											class="h-3.5 w-3.5 animate-spin"
											viewBox="0 0 24 24"
											fill="none"
										>
											<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
											<path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
										</svg>
										Waiting for response...
									</div>
									<button type="button" onclick={resetToEditing} class="text-xs text-text-dim hover:text-text transition">
										Cancel
									</button>
								</div>

							{:else if phase === 'cors_error'}
								<div class="space-y-3">
									<div
										class="flex items-start gap-2 rounded-lg border border-warning/15 bg-warning/5 px-3 py-2.5"
									>
										<svg
											class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="1.5"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
											/>
										</svg>
										<div class="space-y-1">
											<p class="text-xs font-medium text-warning">
												Cannot reach this service from the browser
											</p>
											<p class="text-[11px] text-text-muted">
												The agent's server likely doesn't have CORS headers configured.
												You can still try from a terminal:
											</p>
										</div>
									</div>
									<div class="relative">
										<pre
											class="overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-[11px] text-text-muted leading-relaxed">{curlCommand}</pre>
										<button
											type="button"
											onclick={copyCurl}
											class="absolute top-2 right-2 rounded-md border border-border bg-surface-raised px-2 py-1 text-[10px] text-text-dim transition hover:text-text"
										>
											{copySuccess ? 'Copied!' : 'Copy'}
										</button>
									</div>
									<p class="text-[10px] text-text-dim">
										Agent developers: add <code
											class="rounded bg-surface-raised px-1 py-0.5"
											>cors({'{'} exposedHeaders: ["PAYMENT-REQUIRED",
											"PAYMENT-RESPONSE"] {'}'})</code
										> to your Express server to enable browser access.
									</p>
								</div>

							{:else if phase === 'error'}
								<div class="space-y-2">
									<div
										class="flex items-start gap-2 rounded-lg border border-negative/15 bg-negative/5 px-3 py-2"
									>
										<svg
											class="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="1.5"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
											/>
										</svg>
										<p class="text-xs text-negative">{errorMsg}</p>
									</div>
									<button
										type="button"
										onclick={resetToEditing}
										class="text-xs text-accent hover:underline"
									>
										Try again
									</button>
								</div>

							{:else if phase === 'done' && response}
								<ResponseViewer
									status={response.status}
									body={response.body}
									settlementTxHash={response.settlementTxHash}
								/>
								<div class="flex items-center gap-3 pt-1">
									<button
										type="button"
										onclick={resetToEditing}
										class="text-xs text-accent hover:underline"
									>
										Try again
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	/* ── Section wrapper — stands out from page ── */
	.try-section {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		border-radius: 1rem;
		border: 1px solid oklch(0.55 0.12 260 / 0.25);
		background:
			radial-gradient(ellipse 60% 50% at 50% 0%, oklch(0.5 0.1 260 / 0.08), transparent),
			linear-gradient(to bottom, oklch(0.16 0.02 260 / 0.6), transparent 70%);
		box-shadow:
			0 0 40px -10px oklch(0.5 0.15 260 / 0.12),
			inset 0 1px 0 oklch(0.6 0.1 260 / 0.08);
	}

	.try-section__icon {
		display: flex;
		height: 2.25rem;
		width: 2.25rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.75rem;
		border: 1px solid oklch(0.6 0.14 260 / 0.3);
		background: oklch(0.5 0.12 260 / 0.1);
		color: oklch(0.75 0.12 260);
		animation: icon-pulse 3s ease-in-out infinite;
	}

	@keyframes icon-pulse {
		0%, 100% { box-shadow: 0 0 0 0 oklch(0.6 0.14 260 / 0.15); }
		50% { box-shadow: 0 0 12px 2px oklch(0.6 0.14 260 / 0.25); }
	}

	/* ── Aurora button base ── */
	.try-lava-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 8px 18px;
		border-radius: 10px;
		border: 1px solid oklch(0.6 0.14 260 / 0.2);
		cursor: pointer;
		overflow: hidden;
		isolation: isolate;
		min-width: 60px;
		transition: transform 0.15s ease, border-color 0.3s;
	}

	.try-lava-btn:hover {
		border-color: oklch(0.6 0.14 260 / 0.4);
	}

	/* Aurora background — vertical curtain waves */
	.try-lava-btn__bg {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		z-index: 0;
		background: oklch(0.14 0.03 260);
		overflow: hidden;
	}

	.try-lava-btn__bg::before,
	.try-lava-btn__bg::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	/* Primary aurora curtain — vertical bands drifting left */
	.try-lava-btn__bg::before {
		background:
			linear-gradient(
				180deg,
				transparent 0%,
				oklch(0.50 0.20 280 / 0.6) 20%,
				oklch(0.55 0.24 260 / 0.4) 40%,
				transparent 60%
			),
			linear-gradient(
				180deg,
				transparent 15%,
				oklch(0.45 0.18 300 / 0.5) 35%,
				oklch(0.50 0.22 270 / 0.35) 55%,
				transparent 75%
			),
			linear-gradient(
				180deg,
				transparent 30%,
				oklch(0.55 0.16 220 / 0.45) 50%,
				oklch(0.50 0.20 240 / 0.3) 70%,
				transparent 85%
			);
		background-size: 300% 100%, 250% 100%, 350% 100%;
		animation: aurora-drift 8s ease-in-out infinite;
		opacity: 0.8;
		mix-blend-mode: screen;
	}

	/* Secondary shimmer — slower, offset phase */
	.try-lava-btn__bg::after {
		background:
			linear-gradient(
				180deg,
				transparent 5%,
				oklch(0.60 0.14 200 / 0.3) 30%,
				transparent 55%
			),
			linear-gradient(
				180deg,
				transparent 40%,
				oklch(0.48 0.20 290 / 0.25) 60%,
				transparent 80%
			);
		background-size: 200% 100%, 280% 100%;
		animation: aurora-drift-alt 11s ease-in-out infinite;
		opacity: 0.6;
		mix-blend-mode: screen;
	}

	/* Soft edge glow — no spin, just a gentle pulse */
	.try-lava-btn::before {
		content: '';
		position: absolute;
		inset: -1px;
		border-radius: 11px;
		z-index: -1;
		background: linear-gradient(
			90deg,
			oklch(0.50 0.18 280 / 0.3),
			oklch(0.55 0.16 240 / 0.2),
			oklch(0.45 0.20 300 / 0.3)
		);
		background-size: 200% 100%;
		animation: glow-shift 6s ease-in-out infinite;
		filter: blur(4px);
		opacity: 0.5;
		transition: opacity 0.3s, filter 0.3s;
	}

	.try-lava-btn:hover::before {
		opacity: 0.9;
		filter: blur(6px);
	}

	.try-lava-btn__label {
		position: relative;
		z-index: 2;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: oklch(0.92 0.04 260);
		text-shadow: 0 0 10px oklch(0.6 0.14 260 / 0.5);
		transition: text-shadow 0.3s;
	}

	.try-lava-btn:hover .try-lava-btn__label {
		text-shadow:
			0 0 14px oklch(0.7 0.18 260 / 0.7),
			0 0 28px oklch(0.55 0.2 280 / 0.3);
	}

	.try-lava-btn:hover .try-lava-btn__bg::before {
		animation-duration: 5s;
	}

	.try-lava-btn:active {
		transform: scale(0.96);
	}

	/* ── Wide variant — full-width connect CTA ── */
	.try-lava-btn--wide {
		width: 100%;
		padding: 14px 24px;
		border-radius: 12px;
	}

	.try-lava-btn--wide::before {
		inset: -2px;
		border-radius: 14px;
		filter: blur(6px);
		opacity: 0.6;
	}

	.try-lava-btn--wide:hover::before {
		filter: blur(8px);
		opacity: 1;
	}

	.try-lava-btn__label--wide {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		letter-spacing: 0.06em;
	}

	/* Wallet icon — gentle breathe */
	.try-wallet-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		animation: wallet-breathe 3s ease-in-out infinite;
	}

	@keyframes wallet-breathe {
		0%, 100% { opacity: 0.75; transform: scale(1); }
		50% { opacity: 1; transform: scale(1.06); }
	}

	/* ── Keyframes ── */

	/* Vertical aurora bands drifting horizontally */
	@keyframes aurora-drift {
		0%   { background-position: 0% 0%, 30% 0%, 60% 0%; }
		50%  { background-position: 100% 0%, 80% 0%, 20% 0%; }
		100% { background-position: 0% 0%, 30% 0%, 60% 0%; }
	}

	@keyframes aurora-drift-alt {
		0%   { background-position: 100% 0%, 70% 0%; }
		50%  { background-position: 0% 0%, 20% 0%; }
		100% { background-position: 100% 0%, 70% 0%; }
	}

	/* Edge glow shifts side to side */
	@keyframes glow-shift {
		0%, 100% { background-position: 0% 50%; }
		50% { background-position: 100% 50%; }
	}

	/* ── Light theme ── */
	:global(.light) .try-section,
	:global([data-theme='light']) .try-section {
		border-color: oklch(0.5 0.14 260 / 0.2);
		background:
			radial-gradient(ellipse 60% 50% at 50% 0%, oklch(0.6 0.12 260 / 0.06), transparent),
			linear-gradient(to bottom, oklch(0.94 0.01 260 / 0.8), transparent 70%);
		box-shadow:
			0 0 30px -8px oklch(0.5 0.15 260 / 0.08),
			inset 0 1px 0 oklch(1 0 0 / 0.5);
	}

	:global(.light) .try-section__icon,
	:global([data-theme='light']) .try-section__icon {
		border-color: oklch(0.5 0.16 260 / 0.25);
		background: oklch(0.5 0.14 260 / 0.08);
		color: oklch(0.45 0.16 260);
	}

	:global(.light) .try-lava-btn__bg,
	:global([data-theme='light']) .try-lava-btn__bg {
		background: oklch(0.24 0.05 270);
	}
</style>
