<script lang="ts">
	import { onMount } from 'svelte';
	import { wallet } from '$lib/wallet.svelte.js';
	import { explorerTxUrl } from '$lib/explorer.js';
	import { shortAddress } from '$lib/formatters.js';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import RequestEditor from './RequestEditor.svelte';
	import ResponseViewer from './ResponseViewer.svelte';

	interface ServiceEntry {
		name: string;
		endpoint: string;
		version?: string;
	}

	let {
		services,
		x402Enabled
	}: {
		services: ServiceEntry[];
		x402Enabled: boolean;
	} = $props();

	// x402 client (browser-only, lazy loaded)
	let x402Module: typeof import('$lib/x402-client') | null = $state(null);

	onMount(async () => {
		try {
			x402Module = await import('$lib/x402-client.js');
		} catch (err) {
			console.error('Failed to load x402 client:', err);
		}
	});

	// --- State ---
	type Phase =
		| 'idle'
		| 'discovering_price'
		| 'price_shown'
		| 'signing'
		| 'waiting_response'
		| 'done'
		| 'error';

	let activeServiceIdx = $state<number | null>(null);
	let phase = $state<Phase>('idle');
	let method = $state('GET');
	let body = $state('');
	let errorMsg = $state('');

	// Price discovery
	let pricingInfo = $state<{
		price: string;
		network: string;
		payTo: string;
		scheme: string;
	} | null>(null);

	// Response
	let response = $state<{
		status: number;
		body: string;
		settlementTxHash: string | null;
	} | null>(null);

	// Derived
	const activeService = $derived(activeServiceIdx !== null ? services[activeServiceIdx] : null);
	const busy = $derived(
		phase === 'discovering_price' || phase === 'signing' || phase === 'waiting_response'
	);

	const formattedPrice = $derived.by(() => {
		if (!pricingInfo?.price) return null;
		// x402 prices come as USD string like "$0.01" or raw amount
		const raw = pricingInfo.price;
		if (raw.startsWith('$')) return raw;
		// Try to parse as USDC amount (7 decimals on Stellar)
		const num = Number(raw);
		if (!isNaN(num) && num > 0) {
			const usdc = num / 1e7;
			return `$${usdc.toFixed(usdc < 0.01 ? 4 : 2)}`;
		}
		return raw;
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
		phase = 'idle';
		method = 'GET';
		body = '';
		errorMsg = '';
		pricingInfo = null;
		response = null;
		discoverPrice();
	}

	function closeTryPanel() {
		activeServiceIdx = null;
		phase = 'idle';
		pricingInfo = null;
		response = null;
		errorMsg = '';
	}

	async function proxyFetch(
		url: string,
		fetchMethod: string,
		headers: Record<string, string> = {},
		fetchBody?: string
	): Promise<{ status: number; headers: Record<string, string>; body: string; error?: string }> {
		const res = await fetch('/api/x402-proxy', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url, method: fetchMethod, headers, body: fetchBody })
		});

		if (!res.ok) {
			const text = await res.text();
			let msg = `Proxy error: ${res.status}`;
			try {
				const json = JSON.parse(text);
				msg = json.message || json.error || msg;
			} catch {
				/* use default */
			}
			throw new Error(msg);
		}

		return res.json();
	}

	async function discoverPrice() {
		if (!activeService) return;

		phase = 'discovering_price';
		errorMsg = '';

		try {
			const result = await proxyFetch(activeService.endpoint, 'GET');

			if (result.error) {
				errorMsg = result.error;
				phase = 'error';
				return;
			}

			if (result.status === 402) {
				// Parse x402 payment required header
				const paymentHeader = result.headers['x-payment'] || result.headers['payment-required'];
				if (!paymentHeader) {
					errorMsg =
						'Endpoint returned 402 but missing payment header. It may not support x402.';
					phase = 'error';
					return;
				}

				try {
					const decoded = JSON.parse(atob(paymentHeader));
					pricingInfo = {
						price: decoded.maxAmountRequired || decoded.price || decoded.amount || '?',
						network: decoded.network || 'unknown',
						payTo: decoded.payTo || decoded.payToAddress || '',
						scheme: decoded.scheme || 'exact'
					};
					phase = 'price_shown';
				} catch {
					errorMsg = 'Could not parse payment header from endpoint.';
					phase = 'error';
				}
			} else if (result.status >= 200 && result.status < 300) {
				// No payment needed — show response directly
				response = { status: result.status, body: result.body, settlementTxHash: null };
				pricingInfo = null;
				phase = 'done';
			} else {
				errorMsg = `Service returned error: ${result.status}`;
				phase = 'error';
			}
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Failed to reach service';
			phase = 'error';
		}
	}

	async function sendPaidRequest() {
		if (!activeService || !wallet.address || !x402Module || !pricingInfo) return;

		if (wallet.networkMismatch) {
			errorMsg = `Switch Freighter to ${pricingInfo.network.includes('mainnet') ? 'Mainnet' : 'Testnet'} to continue.`;
			phase = 'error';
			return;
		}

		phase = 'signing';
		errorMsg = '';

		try {
			const { client, httpClient } = x402Module.createX402Client(wallet.address);

			// Step 1: Get fresh 402 to create payment payload
			const preflightResult = await proxyFetch(activeService.endpoint, method, {}, undefined);

			if (preflightResult.status !== 402) {
				// Endpoint didn't require payment this time
				response = {
					status: preflightResult.status,
					body: preflightResult.body,
					settlementTxHash: null
				};
				phase = 'done';
				return;
			}

			const paymentHeader =
				preflightResult.headers['x-payment'] || preflightResult.headers['payment-required'];
			if (!paymentHeader) {
				errorMsg = 'Missing payment header from endpoint.';
				phase = 'error';
				return;
			}

			// Step 2: Parse payment requirement via x402 SDK
			const paymentRequired = httpClient.getPaymentRequiredResponse(
				(name: string) => preflightResult.headers[name.toLowerCase()] || null
			);

			// Step 3: Create payment payload — triggers Freighter signAuthEntry popup
			const paymentPayload = await client.createPaymentPayload(paymentRequired);

			phase = 'waiting_response';

			// Step 4: Encode payment signature header
			const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

			// Step 5: Send actual request with payment
			const headers: Record<string, string> = { ...paymentHeaders };
			if (method !== 'GET' && method !== 'HEAD' && body) {
				headers['content-type'] = 'application/json';
			}

			const paidResult = await proxyFetch(
				activeService.endpoint,
				method,
				headers,
				method !== 'GET' && method !== 'HEAD' ? body : undefined
			);

			// Step 6: Parse settlement response
			let settlementTxHash: string | null = null;
			try {
				const settlementResponse = httpClient.getPaymentSettleResponse(
					(name: string) => paidResult.headers[name.toLowerCase()] || null
				);
				settlementTxHash =
					(settlementResponse as Record<string, unknown>)?.txHash as string | null;
			} catch {
				// Settlement header may not be present — non-blocking
			}

			response = {
				status: paidResult.status,
				body: paidResult.body,
				settlementTxHash
			};
			phase = 'done';
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Payment failed';
			if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
				errorMsg = 'Transaction was rejected. You can try again.';
			} else if (msg.includes('timed out')) {
				errorMsg = 'Signing timed out. Please try again.';
			} else if (msg.includes('insufficient') || msg.includes('balance')) {
				errorMsg = `Insufficient USDC balance. You need ${formattedPrice || 'funds'}.`;
			} else {
				errorMsg = msg;
			}
			phase = 'error';
		}
	}
</script>

<section class="space-y-3">
	<div>
		<h2 class="text-sm font-medium text-text">Try Services</h2>
		<p class="mt-1 text-xs text-text-dim">
			Send requests to this agent's x402-enabled endpoints
		</p>
	</div>

	{#if !wallet.connected}
		<div
			class="flex items-center gap-3 rounded-xl border border-accent/15 bg-accent-fill px-4 py-3"
		>
			<svg
				class="h-4 w-4 shrink-0 text-accent"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
				/>
			</svg>
			<p class="text-xs text-text-muted">
				Connect your wallet to try this agent's services.
			</p>
		</div>
	{:else}
		<div class="divide-y divide-border/30 rounded-xl border border-border/40 overflow-hidden">
			{#each services as service, idx}
				{@const tryable = isX402Service(service)}
				{@const isActive = activeServiceIdx === idx}

				<!-- Service row -->
				<div class={isActive ? 'bg-accent/[0.03]' : ''}>
					<div class="flex items-center gap-3 px-4 py-3">
						<!-- Protocol icon -->
						<span
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-medium
							{tryable
								? 'border-accent/20 bg-accent/5 text-accent'
								: 'border-border bg-surface-raised text-text-dim'}"
						>
							{PROTOCOL_ICONS[service.name.toLowerCase()] ?? service.name.charAt(0).toUpperCase()}
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
							<p class="truncate font-mono text-[11px] text-text-muted">{service.endpoint}</p>
						</div>

						<!-- Price badge (shown when discovered) -->
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
									class="rounded-lg border border-accent/30 bg-accent-fill px-3 py-1.5 text-xs font-medium text-accent
										   transition hover:bg-accent-fill-hover hover:border-accent/45"
								>
									Try
								</button>
							{/if}
						{/if}
					</div>

					<!-- Inline try panel -->
					{#if isActive}
						<div class="border-t border-border/20 px-4 py-4 space-y-4">
							{#if phase === 'discovering_price'}
								<div class="flex items-center gap-2 py-2">
									<svg
										class="h-4 w-4 animate-spin text-accent"
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
									<span class="text-xs text-text-muted">Discovering price...</span>
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
										onclick={discoverPrice}
										class="text-xs text-accent hover:underline"
									>
										Retry
									</button>
								</div>
							{:else if phase === 'price_shown' || phase === 'signing' || phase === 'waiting_response'}
								<!-- Pricing info -->
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

								<!-- Request editor -->
								<RequestEditor
									bind:method
									bind:body
									onsubmit={sendPaidRequest}
									price={formattedPrice}
									busy={phase === 'signing' || phase === 'waiting_response'}
								/>

								{#if phase === 'signing'}
									<div class="flex items-center gap-2 text-xs text-accent">
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
										Confirm in Freighter...
									</div>
								{:else if phase === 'waiting_response'}
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
										Waiting for response...
									</div>
								{/if}
							{:else if phase === 'done' && response}
								<ResponseViewer
									status={response.status}
									body={response.body}
									settlementTxHash={response.settlementTxHash}
								/>

								<div class="flex items-center gap-3 pt-1">
									<button
										type="button"
										onclick={discoverPrice}
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
