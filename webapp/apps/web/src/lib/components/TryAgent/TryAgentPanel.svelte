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
		mppEnabled = false,
		autoOpen = false
	}: {
		services: ServiceEntry[];
		x402Enabled: boolean;
		mppEnabled?: boolean;
		autoOpen?: boolean;
	} = $props();

	// Payment clients (browser-only, lazy loaded to avoid SSR crashes)
	let x402Module: typeof import('$lib/x402-client') | null = $state(null);
	let mppModule: typeof import('$lib/mpp-client') | null = $state(null);

	onMount(async () => {
		const loads: Promise<void>[] = [];
		loads.push(
			import('$lib/x402-client.js').then((m) => { x402Module = m; }).catch((err) => {
				console.error('Failed to load x402 client:', err);
			})
		);
		loads.push(
			import('$lib/mpp-client.js').then((m) => { mppModule = m; }).catch((err) => {
				console.error('Failed to load mpp client:', err);
			})
		);
		await Promise.all(loads);

		if (autoOpen && wallet.connected) {
			const idx = services.findIndex((s) => isPayableService(s));
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
	let detectedProtocol = $state<'x402' | 'mpp' | null>(null);

	// Store the raw MPP challenge for use in sendPaidRequest
	let mppChallenge = $state<import('mppx').Challenge.Challenge | null>(null);

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

	function isPayableService(service: ServiceEntry): boolean {
		return (
			(x402Enabled || mppEnabled) &&
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
		detectedProtocol = null;
		mppChallenge = null;
	}

	function resetToEditing() {
		phase = 'editing';
		response = null;
		pricingInfo = null;
		errorMsg = '';
		detectedProtocol = null;
		mppChallenge = null;
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
				// Try MPP first (preferred — no facilitator dependency)
				let parsed = false;
				if (mppModule) {
					try {
						const challenge = mppModule.parseMppChallenge(res);
						if (challenge) {
							detectedProtocol = 'mpp';
							mppChallenge = challenge;
							const pricing = mppModule.extractMppPricing(challenge);
							pricingInfo = {
								price: pricing.displayPrice,
								network: pricing.network,
								payTo: pricing.recipient,
								scheme: pricing.feePayer ? 'mpp-sponsored' : 'mpp-charge'
							};
							phase = 'price_confirm';
							parsed = true;
						}
					} catch {
						// Not MPP — fall through to x402
					}
				}

				// Fall back to x402
				if (!parsed) {
					const paymentHeader =
						res.headers.get('PAYMENT-REQUIRED') || res.headers.get('X-PAYMENT');
					if (!paymentHeader) {
						errorMsg =
							'Endpoint returned 402 but the payment header is not accessible. The agent may need CORS headers.';
						phase = 'cors_error';
						return;
					}

					try {
						detectedProtocol = 'x402';
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

		if (wallet.networkMismatch) {
			errorMsg = `Switch Freighter to ${pricingInfo.network.includes('mainnet') || pricingInfo.network.includes('pubnet') ? 'Mainnet' : 'Testnet'} to continue.`;
			phase = 'error';
			return;
		}

		phase = 'signing';
		errorMsg = '';

		try {
			if (detectedProtocol === 'mpp') {
				await sendMppPaidRequest();
			} else {
				await sendX402PaidRequest();
			}

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

	async function sendX402PaidRequest() {
		if (!activeService || !wallet.address) return;

		if (!x402Module) {
			errorMsg = 'Payment module failed to load. Please refresh the page.';
			phase = 'error';
			return;
		}

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
			const fixed = atob(paymentRequiredHeader).replace(/\\(?!["\\/bfnrtu])/g, '');
			paymentRequired = JSON.parse(fixed);
		}

		// Step 3: Create payment payload — triggers Freighter signAuthEntry popup
		const paymentPayload = await Promise.race([
			client.createPaymentPayload(paymentRequired),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Signing timed out. Freighter may not have opened — check for a popup or try again.')), 60_000)
			)
		]);

		phase = 'waiting_response';

		// Step 4: Encode and send
		const paymentHeader = encodePaymentSignatureHeader(paymentPayload);
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

		// Step 5: Parse settlement
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
	}

	async function sendMppPaidRequest() {
		if (!activeService || !wallet.address || !mppModule || !mppChallenge) {
			errorMsg = 'MPP payment module not available. Please refresh the page.';
			phase = 'error';
			return;
		}

		// Check challenge expiry before signing
		if (mppChallenge.expires && new Date(mppChallenge.expires).getTime() < Date.now()) {
			errorMsg = 'Payment challenge expired. Please try again.';
			phase = 'error';
			return;
		}

		// MPP challenges have built-in id + expires — no fresh 402 needed.
		// Build and sign the credential with Freighter.
		const credential = await Promise.race([
			mppModule.createMppCredential(mppChallenge, wallet.address),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Signing timed out. Freighter may not have opened — check for a popup or try again.')), 60_000)
			)
		]);

		phase = 'waiting_response';

		// Send request with Authorization header
		const paidHeaders: Record<string, string> = { 'Authorization': credential };
		if (method !== 'GET' && body) {
			paidHeaders['Content-Type'] = 'application/json';
		}

		const opts = buildFetchOptions();
		const paidRes = await fetch(activeService.endpoint, {
			method,
			headers: paidHeaders,
			body: method !== 'GET' && method !== 'HEAD' ? opts.body || undefined : undefined,
			signal: AbortSignal.timeout(30_000)
		});

		const paidBody = await paidRes.text();

		// Parse Payment-Receipt header
		let settlementTxHash: string | null = null;
		try {
			const receipt = mppModule.parseMppReceipt(paidRes);
			settlementTxHash = receipt.reference;
		} catch {
			// Receipt header may not be present — non-blocking
		}

		response = { status: paidRes.status, body: paidBody, settlementTxHash };
		phase = 'done';
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
			<p class="text-xs text-text-dim">Send paid requests via micropayments</p>
		</div>
	</div>

	{#if !wallet.connected}
		<button
			type="button"
			onclick={() => wallet.connect()}
			onmousemove={(e) => {
				const rect = e.currentTarget.getBoundingClientRect();
				e.currentTarget.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width * 100) + '%');
				e.currentTarget.style.setProperty('--my', ((e.clientY - rect.top) / rect.height * 100) + '%');
			}}
			class="try-connect-btn"
		>
			<svg class="h-4 w-4 shrink-0 relative" style="z-index:1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
			</svg>
			<span class="relative" style="z-index:1">Connect & Try</span>
		</button>
	{:else}
		<div class="divide-y divide-border/30 rounded-xl border border-border/40 overflow-hidden">
			{#each services as service, idx}
				{@const tryable = isPayableService(service)}
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
									class="try-service-btn"
								>
									Try
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

								{#if pricingInfo?.scheme === 'mpp-charge'}
									<p class="text-[11px] text-warning">This agent uses direct settlement (no fee sponsor). Your wallet needs XLM for network fees.</p>
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
											"PAYMENT-RESPONSE", "WWW-Authenticate",
											"Payment-Receipt"] {'}'})</code
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
	/* ── Section wrapper ── */
	.try-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklch, var(--color-accent) 15%, transparent);
		background:
			linear-gradient(to bottom, color-mix(in oklch, var(--color-accent) 3%, transparent), transparent 60%),
			var(--color-glass);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
	}

	.try-section__icon {
		display: flex;
		height: 2.25rem;
		width: 2.25rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklch, var(--color-accent) 20%, transparent);
		background: color-mix(in oklch, var(--color-accent) 5%, transparent);
		color: var(--color-accent);
	}

	/* ── Shared button base ── */
	.try-connect-btn,
	.try-service-btn {
		position: relative;
		overflow: hidden;
		border: 1px solid oklch(0.5 0.12 265 / 0.25);
		background: oklch(0.18 0.04 265);
		color: oklch(0.93 0.03 265);
		cursor: pointer;
		transition: border-color 0.4s, box-shadow 0.4s;
	}

	.try-connect-btn::before,
	.try-service-btn::before,
	.try-connect-btn::after,
	.try-service-btn::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
	}

	/* ::before — mouse-tracking spotlight (soft, wide) */
	.try-connect-btn::before,
	.try-service-btn::before {
		background: radial-gradient(
			ellipse 200px 140px at var(--mx, 50%) var(--my, 50%),
			oklch(0.58 0.14 265 / 0.25),
			oklch(0.50 0.10 265 / 0.08) 50%,
			transparent 80%
		);
		opacity: 0;
		transition: opacity 0.5s ease;
	}

	.try-connect-btn:hover::before,
	.try-service-btn:hover::before {
		opacity: 1;
	}

	/* ::after — idle ambient drift (always on, whisper-level) */
	.try-connect-btn::after,
	.try-service-btn::after {
		background:
			radial-gradient(ellipse 60% 80% at 25% 50%, oklch(0.50 0.10 265 / 0.12), transparent 70%),
			radial-gradient(ellipse 50% 70% at 75% 45%, oklch(0.48 0.08 265 / 0.08), transparent 70%);
		background-size: 200% 200%;
		background-repeat: no-repeat;
		animation: glow-idle 20s ease-in-out infinite;
	}

	.try-connect-btn:hover,
	.try-service-btn:hover {
		border-color: oklch(0.50 0.10 265 / 0.30);
		box-shadow:
			0 0 60px -12px oklch(0.50 0.12 265 / 0.12),
			0 0 100px -20px oklch(0.52 0.10 265 / 0.06);
	}

	.try-connect-btn:hover::after,
	.try-service-btn:hover::after {
		animation-duration: 10s;
	}

	/* ── Connect & Try (wide) ── */
	.try-connect-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.875rem 1.25rem;
		border-radius: 0.75rem;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.try-connect-btn:active {
		transform: scale(0.98);
	}

	/* ── Small "Try" (inline) ── */
	.try-service-btn {
		padding: 0.4rem 0.875rem;
		border-radius: 0.5rem;
		font-size: 12px;
		font-weight: 600;
	}

	.try-service-btn:active {
		transform: scale(0.96);
	}

	@keyframes glow-idle {
		0%   { background-position: 15% 45%; }
		33%  { background-position: 70% 60%; }
		66%  { background-position: 45% 30%; }
		100% { background-position: 15% 45%; }
	}
</style>
