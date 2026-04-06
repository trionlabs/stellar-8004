/**
 * E2E Testnet Smoke Test — 5 wallets, 10 agents, cross-feedback, cross-validation.
 *
 * Usage: pnpm e2e:testnet
 *
 * Creates 5 keypairs (Alice, Bob, Carol, Dave, Eve), funds via Friendbot,
 * registers 2 agents per wallet, submits 40 cross-feedback entries,
 * 20 validation requests, and 20 validation responses.
 *
 * All on-chain. Zero mocking. ~95 transactions, ~15-25 minutes.
 *
 * WARNING: This script creates NEW keypairs each run. Do not reuse keys.
 */
import * as StellarSdk from '@stellar/stellar-sdk';

const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const RPC_URL = 'https://soroban-testnet.stellar.org';
const IDENTITY_CONTRACT = 'CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ';
const REPUTATION_CONTRACT = 'CAOSF6L4UPTJSZD6KOJMGOOKUKXZNYRNPA2QBPZPTLGGK6XLGCW72YM4';
const VALIDATION_CONTRACT = 'CA6GIV7QB4B3O5SBZZRL3E3XMFFECGRETSN4JXAYTFKF5HUTD4JY2SJQ';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5000;

const server = new StellarSdk.rpc.Server(RPC_URL);

// ─── Test Data ──────────────────────────────────────────────────────

interface AgentDef {
	name: string;
	description: string;
	services: Array<{ name: string; endpoint: string; protocol: string }>;
	tag: string;
}

interface WalletDef {
	name: string;
	agents: AgentDef[];
}

const WALLETS: WalletDef[] = [
	{
		name: 'Alice',
		agents: [
			{
				name: 'Nova',
				description: 'High-performance analytics agent for real-time data processing',
				services: [
					{ name: 'analytics', endpoint: 'https://nova.example.com/mcp', protocol: 'mcp' },
					{ name: 'data-feed', endpoint: 'https://nova.example.com/a2a', protocol: 'a2a' },
				],
				tag: 'starred',
			},
			{
				name: 'Kael',
				description: 'Code review assistant with multi-language support',
				services: [{ name: 'review', endpoint: 'https://kael.example.com/mcp', protocol: 'mcp' }],
				tag: 'successRate',
			},
		],
	},
	{
		name: 'Bob',
		agents: [
			{
				name: 'Lyra',
				description: 'Music recommendation engine using collaborative filtering',
				services: [{ name: 'recommend', endpoint: 'https://lyra.example.com/a2a', protocol: 'a2a' }],
				tag: 'uptime',
			},
			{
				name: 'Orion',
				description: 'Navigation and routing agent with traffic awareness',
				services: [
					{ name: 'route', endpoint: 'https://orion.example.com/mcp', protocol: 'mcp' },
					{ name: 'traffic', endpoint: 'https://orion.example.com/a2a', protocol: 'a2a' },
				],
				tag: 'reachable',
			},
		],
	},
	{
		name: 'Carol',
		agents: [
			{
				name: 'Vega',
				description: 'Real-time data visualization tool for dashboards',
				services: [{ name: 'visualize', endpoint: 'https://vega.example.com/mcp', protocol: 'mcp' }],
				tag: 'responseTime',
			},
			{
				name: 'Pulse',
				description: 'Real-time monitoring agent with alert capabilities',
				services: [{ name: 'monitor', endpoint: 'https://pulse.example.com/a2a', protocol: 'a2a' }],
				tag: 'starred',
			},
		],
	},
	{
		name: 'Dave',
		agents: [
			{
				name: 'Drift',
				description: 'Anomaly detection service for time-series data',
				services: [{ name: 'detect', endpoint: 'https://drift.example.com/mcp', protocol: 'mcp' }],
				tag: 'successRate',
			},
			{
				name: 'Echo',
				description: 'Voice transcription agent with speaker diarization',
				services: [{ name: 'transcribe', endpoint: 'https://echo.example.com/a2a', protocol: 'a2a' }],
				tag: 'uptime',
			},
		],
	},
	{
		name: 'Eve',
		agents: [
			{
				name: 'Flux',
				description: 'Stream processing agent for event-driven architectures',
				services: [
					{ name: 'process', endpoint: 'https://flux.example.com/mcp', protocol: 'mcp' },
					{ name: 'stream', endpoint: 'https://flux.example.com/a2a', protocol: 'a2a' },
				],
				tag: 'reachable',
			},
			{
				name: 'Ember',
				description: 'Log aggregation service with structured search',
				services: [{ name: 'aggregate', endpoint: 'https://ember.example.com/mcp', protocol: 'mcp' }],
				tag: 'responseTime',
			},
		],
	},
];

// Feedback scores: FEEDBACK_SCORES[giverWalletIdx][targetAgentGlobalIdx] = score
// Global agent order: Nova(0), Kael(1), Lyra(2), Orion(3), Vega(4), Pulse(5), Drift(6), Echo(7), Flux(8), Ember(9)
// --- means self-owned agent (skipped)
const FEEDBACK_SCORES: (number | null)[][] = [
	// Alice owns 0,1
	[null, null, 78, 85, 42, 95, 55, 70, 30, 15],
	// Bob owns 2,3
	[92, 80, null, null, 38, 90, 60, 75, 25, 10],
	// Carol owns 4,5
	[88, 75, 82, 80, null, null, 50, 68, 35, 20],
	// Dave owns 6,7
	[95, 85, 70, 88, 45, 92, null, null, 28, 12],
	// Eve owns 8,9
	[90, 78, 75, 82, 40, 88, 58, 72, null, null],
];

// Validation plan: [ownerWalletIdx, agentLocalIdx, validator1WalletIdx, validator2WalletIdx]
const VALIDATION_PLAN: [number, number, number, number][] = [
	[0, 0, 1, 2], // Nova:  Alice → Bob, Carol
	[0, 1, 3, 4], // Kael:  Alice → Dave, Eve
	[1, 0, 2, 3], // Lyra:  Bob → Carol, Dave
	[1, 1, 4, 0], // Orion: Bob → Eve, Alice
	[2, 0, 3, 4], // Vega:  Carol → Dave, Eve
	[2, 1, 0, 1], // Pulse: Carol → Alice, Bob
	[3, 0, 4, 0], // Drift: Dave → Eve, Alice
	[3, 1, 1, 2], // Echo:  Dave → Bob, Carol
	[4, 0, 0, 1], // Flux:  Eve → Alice, Bob
	[4, 1, 2, 3], // Ember: Eve → Carol, Dave
];

// Validation response scores (deterministic, 60-95 range)
const VALIDATION_SCORES = [85, 78, 90, 72, 88, 65, 92, 70, 80, 75, 82, 68, 95, 60, 87, 73, 91, 66, 83, 77];

// ─── Helpers ────────────────────────────────────────────────────────

function buildMetadata(agent: AgentDef) {
	return {
		type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
		name: agent.name,
		description: agent.description,
		image: '',
		services: agent.services.map((s) => ({
			name: s.name,
			endpoint: s.endpoint,
			version: '1.0.0',
		})),
		supportedTrust: ['reputation'],
		x402: false,
	};
}

function toDataUri(metadata: object): string {
	const json = JSON.stringify(metadata);
	const b64 = Buffer.from(json).toString('base64');
	return `data:application/json;base64,${b64}`;
}

async function sha256(data: string): Promise<Buffer> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
	return Buffer.from(buf);
}

async function fund(address: string): Promise<void> {
	const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
	if (!res.ok) {
		throw new Error(`Friendbot failed for ${address}: ${res.status} ${await res.text()}`);
	}
	console.log(`  Funded ${address.slice(0, 8)}...`);
}

async function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

// ─── Transaction Builder (with retry) ──────────────────────────────

async function pollTransaction(
	hash: string
): Promise<{ hash: string; result?: StellarSdk.xdr.ScVal }> {
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	let result = await server.getTransaction(hash);
	while (result.status === 'NOT_FOUND') {
		if (Date.now() > deadline) {
			throw new Error(`Tx timeout: ${hash}`);
		}
		await sleep(POLL_INTERVAL_MS);
		result = await server.getTransaction(hash);
	}
	if (result.status === 'SUCCESS') {
		return { hash, result: result.returnValue };
	}
	if (result.status === 'FAILED') {
		throw new Error(`Tx failed on-chain: ${hash}`);
	}
	throw new Error(`Unexpected status: ${(result as any).status}`);
}

async function buildAndSubmit(
	keypair: StellarSdk.Keypair,
	method: string,
	contractId: string,
	args: StellarSdk.xdr.ScVal[]
): Promise<{ hash: string; result?: StellarSdk.xdr.ScVal }> {
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const account = await server.getAccount(keypair.publicKey());
		const contract = new StellarSdk.Contract(contractId);

		let tx = new StellarSdk.TransactionBuilder(account, {
			fee: StellarSdk.BASE_FEE,
			networkPassphrase: NETWORK_PASSPHRASE,
		})
			.addOperation(contract.call(method, ...args))
			.setTimeout(180)
			.build();

		const sim = await server.simulateTransaction(tx);
		if (StellarSdk.rpc.Api.isSimulationError(sim)) {
			throw new Error(`Simulation failed for ${method}: ${(sim as any).error}`);
		}

		tx = StellarSdk.rpc.assembleTransaction(tx, sim).build();
		tx.sign(keypair);

		const response = await server.sendTransaction(tx);

		if (response.status === 'TRY_AGAIN_LATER') {
			const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
			console.log(`  TRY_AGAIN_LATER — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
			await sleep(delay);
			continue;
		}
		if (response.status === 'ERROR') {
			throw new Error(`Send failed for ${method}: ${JSON.stringify(response.errorResult)}`);
		}

		return await pollTransaction(response.hash);
	}
	throw new Error(`Max retries exhausted for ${method}`);
}

// ─── Contract Operations ────────────────────────────────────────────

async function registerAgent(
	ownerKeypair: StellarSdk.Keypair,
	uri: string
): Promise<number> {
	const args = [
		StellarSdk.nativeToScVal(ownerKeypair.publicKey(), { type: 'address' }),
		StellarSdk.nativeToScVal(uri, { type: 'string' }),
	];
	const { result } = await buildAndSubmit(ownerKeypair, 'register_with_uri', IDENTITY_CONTRACT, args);
	return result ? (StellarSdk.scValToNative(result) as number) : 0;
}

async function giveFeedback(
	clientKeypair: StellarSdk.Keypair,
	agentId: number,
	value: number,
	tag: string
): Promise<void> {
	const evidenceJson = JSON.stringify({
		agent_id: agentId,
		score: value,
		tag,
		client: clientKeypair.publicKey(),
		ts: Date.now(),
	});
	const feedbackHash = await sha256(evidenceJson);

	const args = [
		StellarSdk.nativeToScVal(clientKeypair.publicKey(), { type: 'address' }),
		StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
		StellarSdk.nativeToScVal(BigInt(value), { type: 'i128' }),
		StellarSdk.nativeToScVal(0, { type: 'u32' }),
		StellarSdk.nativeToScVal(tag, { type: 'string' }),
		StellarSdk.nativeToScVal('', { type: 'string' }),
		StellarSdk.nativeToScVal('', { type: 'string' }),
		StellarSdk.nativeToScVal('', { type: 'string' }),
		StellarSdk.nativeToScVal(feedbackHash, { type: 'bytes' }),
	];
	await buildAndSubmit(clientKeypair, 'give_feedback', REPUTATION_CONTRACT, args);
}

async function requestValidation(
	ownerKeypair: StellarSdk.Keypair,
	validatorAddress: string,
	agentId: number,
	requestUri: string
): Promise<{ hash: string; requestHash: Buffer }> {
	const data = `${agentId}:${validatorAddress}:${Date.now()}:${crypto.randomUUID()}`;
	const requestHash = await sha256(data);

	const args = [
		StellarSdk.nativeToScVal(ownerKeypair.publicKey(), { type: 'address' }),
		StellarSdk.nativeToScVal(validatorAddress, { type: 'address' }),
		StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
		StellarSdk.nativeToScVal(requestUri, { type: 'string' }),
		StellarSdk.nativeToScVal(requestHash, { type: 'bytes' }),
	];
	const { hash } = await buildAndSubmit(ownerKeypair, 'validation_request', VALIDATION_CONTRACT, args);
	return { hash, requestHash };
}

async function respondValidation(
	validatorKeypair: StellarSdk.Keypair,
	requestHash: Buffer,
	response: number,
	responseUri: string,
	tag: string
): Promise<{ hash: string }> {
	const responseData = JSON.stringify({ response, tag, validator: validatorKeypair.publicKey(), ts: Date.now() });
	const responseHash = await sha256(responseData);

	const args = [
		StellarSdk.nativeToScVal(validatorKeypair.publicKey(), { type: 'address' }),
		StellarSdk.nativeToScVal(requestHash, { type: 'bytes' }),
		StellarSdk.nativeToScVal(response, { type: 'u32' }),
		StellarSdk.nativeToScVal(responseUri, { type: 'string' }),
		StellarSdk.nativeToScVal(responseHash, { type: 'bytes' }),
		StellarSdk.nativeToScVal(tag, { type: 'string' }),
	];
	const { hash } = await buildAndSubmit(validatorKeypair, 'validation_response', VALIDATION_CONTRACT, args);
	return { hash };
}

// ─── Main ───────────────────────────────────────────────────────────

interface WalletState {
	name: string;
	keypair: StellarSdk.Keypair;
	agents: AgentDef[];
	agentIds: number[];
}

async function main() {
	const startTime = Date.now();
	console.log('=== Stellar 8004 E2E Testnet Smoke Test ===');
	console.log('WARNING: Creates NEW keypairs each run. ~95 transactions, ~15-25 minutes.\n');

	// Phase 1: Generate keypairs
	console.log('--- Phase 1: Generating 5 keypairs ---');
	const wallets: WalletState[] = WALLETS.map((w) => ({
		name: w.name,
		keypair: StellarSdk.Keypair.random(),
		agents: w.agents,
		agentIds: [],
	}));

	for (const w of wallets) {
		console.log(`  ${w.name}: ${w.keypair.publicKey()}`);
	}
	console.log();

	// Phase 2: Fund wallets
	console.log('--- Phase 2: Funding 5 wallets via Friendbot ---');
	for (const w of wallets) {
		await fund(w.keypair.publicKey());
		await sleep(1000);
	}
	console.log();

	// Phase 3: Register agents
	console.log('--- Phase 3: Registering 10 agents ---');
	for (const w of wallets) {
		for (const agent of w.agents) {
			const metadata = buildMetadata(agent);
			const uri = toDataUri(metadata);
			const agentId = await registerAgent(w.keypair, uri);
			w.agentIds.push(agentId);
			console.log(`  ${w.name} -> ${agent.name} (id=${agentId})`);
		}
	}
	console.log();

	// Build flat agent list for feedback lookup
	const allAgents: Array<{ name: string; id: number; tag: string; ownerIdx: number }> = [];
	for (let wi = 0; wi < wallets.length; wi++) {
		for (let ai = 0; ai < wallets[wi].agentIds.length; ai++) {
			allAgents.push({
				name: wallets[wi].agents[ai].name,
				id: wallets[wi].agentIds[ai],
				tag: wallets[wi].agents[ai].tag,
				ownerIdx: wi,
			});
		}
	}

	// Phase 4: Cross-feedback
	console.log('--- Phase 4: Cross-feedback (40 transactions) ---');
	let feedbackCount = 0;
	const totalFeedback = FEEDBACK_SCORES.flat().filter((s) => s !== null).length;

	for (let giverIdx = 0; giverIdx < wallets.length; giverIdx++) {
		for (let agentGlobalIdx = 0; agentGlobalIdx < allAgents.length; agentGlobalIdx++) {
			const score = FEEDBACK_SCORES[giverIdx][agentGlobalIdx];
			if (score === null) continue;

			const agent = allAgents[agentGlobalIdx];
			await giveFeedback(wallets[giverIdx].keypair, agent.id, score, agent.tag);
			feedbackCount++;
			console.log(
				`  [${feedbackCount}/${totalFeedback}] ${wallets[giverIdx].name} -> ${agent.name} (id=${agent.id}): score=${score}`
			);
		}
	}
	console.log();

	// Phase 5: Validation requests
	console.log('--- Phase 5: Validation requests (20 transactions) ---');
	const validationRequests: Array<{
		agentName: string;
		agentId: number;
		ownerIdx: number;
		validatorIdx: number;
		requestHash: Buffer;
	}> = [];

	let requestCount = 0;
	for (const [ownerIdx, agentLocalIdx, val1Idx, val2Idx] of VALIDATION_PLAN) {
		const owner = wallets[ownerIdx];
		const agentId = owner.agentIds[agentLocalIdx];
		const agentName = owner.agents[agentLocalIdx].name;

		for (const validatorIdx of [val1Idx, val2Idx]) {
			const validator = wallets[validatorIdx];
			const requestUri = `https://e2e-test.stellar8004.com/validation/${agentId}`;
			const { requestHash } = await requestValidation(
				owner.keypair,
				validator.keypair.publicKey(),
				agentId,
				requestUri
			);
			validationRequests.push({ agentName, agentId, ownerIdx, validatorIdx, requestHash });
			requestCount++;
			console.log(
				`  [${requestCount}/20] ${owner.name} requests validation for ${agentName} from ${validator.name}`
			);
		}
	}
	console.log();

	// Phase 6: Validation responses
	console.log('--- Phase 6: Validation responses (20 transactions) ---');
	for (let i = 0; i < validationRequests.length; i++) {
		const req = validationRequests[i];
		const validator = wallets[req.validatorIdx];
		const score = VALIDATION_SCORES[i];
		const responseUri = `https://e2e-test.stellar8004.com/response/${req.agentId}`;

		await respondValidation(validator.keypair, req.requestHash, score, responseUri, 'security');
		console.log(
			`  [${i + 1}/20] ${validator.name} validates ${req.agentName} (id=${req.agentId}): score=${score}`
		);
	}
	console.log();

	// Phase 7: Summary
	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

	console.log('=== Summary ===');
	console.log(`Wallets:              ${wallets.length}`);
	console.log(`Agents registered:    ${allAgents.length}`);
	console.log(`Feedback entries:     ${feedbackCount}`);
	console.log(`Validation requests:  ${validationRequests.length}`);
	console.log(`Validation responses: ${validationRequests.length}`);
	console.log(`Total time:           ${elapsed}s`);
	console.log();

	// Agent score table
	console.log('Agent ID | Name   | Avg Feedback | Val Avg | Owner');
	console.log('---------|--------|--------------|---------|------');
	for (const agent of allAgents) {
		const scores = FEEDBACK_SCORES.map((row) => row[allAgents.indexOf(agent)]).filter(
			(s): s is number => s !== null
		);
		const avgFeedback = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';

		// Validation scores for this agent
		const valScores = validationRequests
			.filter((r) => r.agentId === agent.id)
			.map((_, idx) => VALIDATION_SCORES[validationRequests.indexOf(_)]);
		const avgVal = valScores.length > 0 ? (valScores.reduce((a, b) => a + b, 0) / valScores.length).toFixed(1) : 'N/A';

		console.log(
			`  ${String(agent.id).padStart(6)} | ${agent.name.padEnd(6)} | ${String(avgFeedback).padStart(12)} | ${String(avgVal).padStart(7)} | ${wallets[agent.ownerIdx].name}`
		);
	}

	// JSON output for CI/CD
	console.log('\n--- JSON Output ---');
	const jsonOutput = {
		wallets: wallets.map((w) => ({
			name: w.name,
			address: w.keypair.publicKey(),
			agentIds: w.agentIds,
		})),
		agents_registered: allAgents.length,
		feedback_submitted: feedbackCount,
		validation_requests: validationRequests.length,
		validation_responses: validationRequests.length,
		elapsed_seconds: parseFloat(elapsed),
	};
	console.log(JSON.stringify(jsonOutput, null, 2));

	console.log('\nDone! Run the indexer to pick up these events:');
	console.log('  pnpm indexer:serve');
	console.log('Then check: http://localhost:5173/leaderboard');
}

main().catch((err) => {
	console.error('FATAL:', err);
	process.exit(1);
});
