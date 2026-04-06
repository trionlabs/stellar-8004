/**
 * Seed Testnet — Register 10 agents + give feedback to test indexer & scoring.
 *
 * Usage: pnpm seed:testnet
 *
 * Creates 3 keypairs (owner, clientA, clientB), funds via Friendbot,
 * registers 10 agents with data URIs, and submits 20 feedback entries.
 */
import * as StellarSdk from '@stellar/stellar-sdk';

const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const RPC_URL = 'https://soroban-testnet.stellar.org';
const IDENTITY_CONTRACT = 'CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ';
const REPUTATION_CONTRACT = 'CAOSF6L4UPTJSZD6KOJMGOOKUKXZNYRNPA2QBPZPTLGGK6XLGCW72YM4';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

const rpc = new StellarSdk.rpc.Server(RPC_URL);

// ─── Test Data ──────────────────────────────────────────────────────

interface AgentDef {
	name: string;
	description: string;
	scoreA: number;
	scoreB: number;
	tag: string;
}

const AGENTS: AgentDef[] = [
	{ name: 'Nova', description: 'High-performance analytics agent', scoreA: 95, scoreB: 96, tag: 'starred' },
	{ name: 'Kael', description: 'Code review assistant', scoreA: 78, scoreB: 82, tag: 'starred' },
	{ name: 'Lyra', description: 'Music recommendation engine', scoreA: 55, scoreB: 65, tag: 'uptime' },
	{ name: 'Orion', description: 'Navigation and routing agent', scoreA: 38, scoreB: 42, tag: 'reachable' },
	{ name: 'Vega', description: 'Data visualization tool', scoreA: 18, scoreB: 22, tag: 'responseTime' },
	{ name: 'Pulse', description: 'Real-time monitoring agent', scoreA: 100, scoreB: 99, tag: 'starred' },
	{ name: 'Drift', description: 'Anomaly detection service', scoreA: 50, scoreB: 50, tag: 'successRate' },
	{ name: 'Echo', description: 'Voice transcription agent', scoreA: 70, scoreB: 80, tag: 'uptime' },
	{ name: 'Flux', description: 'Stream processing agent', scoreA: 8, scoreB: 12, tag: 'reachable' },
	{ name: 'Ember', description: 'Log aggregation service', scoreA: 0, scoreB: 5, tag: 'responseTime' },
];

// ─── Helpers ────────────────────────────────────────────────────────

function buildMetadata(name: string, description: string) {
	return {
		type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
		name,
		description,
		image: '',
		services: [],
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

// ─── Transaction Builder ────────────────────────────────────────────

async function buildAndSubmit(
	keypair: StellarSdk.Keypair,
	method: string,
	contractId: string,
	args: StellarSdk.xdr.ScVal[]
): Promise<{ hash: string; result?: StellarSdk.xdr.ScVal }> {
	const account = await rpc.getAccount(keypair.publicKey());
	const contract = new StellarSdk.Contract(contractId);

	let tx = new StellarSdk.TransactionBuilder(account, {
		fee: StellarSdk.BASE_FEE,
		networkPassphrase: NETWORK_PASSPHRASE,
	})
		.addOperation(contract.call(method, ...args))
		.setTimeout(180)
		.build();

	const sim = await rpc.simulateTransaction(tx);
	if (StellarSdk.rpc.Api.isSimulationError(sim)) {
		throw new Error(`Simulation failed: ${(sim as any).error}`);
	}

	tx = StellarSdk.rpc.assembleTransaction(tx, sim).build();
	tx.sign(keypair);

	const response = await rpc.sendTransaction(tx);

	if (response.status === 'ERROR') {
		throw new Error(`Send failed: ${JSON.stringify(response.errorResult)}`);
	}
	if (response.status === 'TRY_AGAIN_LATER') {
		throw new Error('Network busy — try again later');
	}

	// Poll for confirmation
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	let result = await rpc.getTransaction(response.hash);
	while (result.status === 'NOT_FOUND') {
		if (Date.now() > deadline) {
			throw new Error(`Tx timeout: ${response.hash}`);
		}
		await sleep(POLL_INTERVAL_MS);
		result = await rpc.getTransaction(response.hash);
	}

	if (result.status === 'SUCCESS') {
		return { hash: response.hash, result: result.returnValue };
	}
	if (result.status === 'FAILED') {
		throw new Error(`Tx failed on-chain: ${response.hash}`);
	}
	throw new Error(`Unexpected status: ${(result as any).status}`);
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
		StellarSdk.nativeToScVal(0, { type: 'u32' }), // valueDecimals
		StellarSdk.nativeToScVal(tag, { type: 'string' }),
		StellarSdk.nativeToScVal('', { type: 'string' }), // tag2
		StellarSdk.nativeToScVal('', { type: 'string' }), // endpoint
		StellarSdk.nativeToScVal('', { type: 'string' }), // feedbackUri
		StellarSdk.nativeToScVal(feedbackHash, { type: 'bytes' }),
	];
	await buildAndSubmit(clientKeypair, 'give_feedback', REPUTATION_CONTRACT, args);
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
	console.log('=== Stellar 8004 Testnet Seed ===\n');

	// 1. Generate keypairs
	const owner = StellarSdk.Keypair.random();
	const clientA = StellarSdk.Keypair.random();
	const clientB = StellarSdk.Keypair.random();

	console.log('Keypairs:');
	console.log(`  Owner:   ${owner.publicKey()}`);
	console.log(`  ClientA: ${clientA.publicKey()}`);
	console.log(`  ClientB: ${clientB.publicKey()}`);
	console.log();

	// 2. Fund wallets
	console.log('Funding wallets via Friendbot...');
	await fund(owner.publicKey());
	await fund(clientA.publicKey());
	await fund(clientB.publicKey());
	console.log();

	// 3. Register 10 agents
	console.log('Registering 10 agents...');
	const agentIds: number[] = [];

	for (const agent of AGENTS) {
		const metadata = buildMetadata(agent.name, agent.description);
		const uri = toDataUri(metadata);
		const agentId = await registerAgent(owner, uri);
		agentIds.push(agentId);
		console.log(`  ${agent.name} → agent_id=${agentId}`);
	}
	console.log();

	// 4. Give feedback from Client A
	console.log('Submitting feedback from Client A...');
	for (let i = 0; i < AGENTS.length; i++) {
		const agent = AGENTS[i];
		await giveFeedback(clientA, agentIds[i], agent.scoreA, agent.tag);
		console.log(`  ${agent.name} (id=${agentIds[i]}): score=${agent.scoreA}`);
	}
	console.log();

	// 5. Give feedback from Client B
	console.log('Submitting feedback from Client B...');
	for (let i = 0; i < AGENTS.length; i++) {
		const agent = AGENTS[i];
		await giveFeedback(clientB, agentIds[i], agent.scoreB, agent.tag);
		console.log(`  ${agent.name} (id=${agentIds[i]}): score=${agent.scoreB}`);
	}
	console.log();

	// 6. Summary
	console.log('=== Summary ===');
	console.log('Agent ID | Name   | Avg Score | Expected Rank');
	console.log('---------|--------|-----------|---------------');
	const sorted = AGENTS.map((a, i) => ({
		name: a.name,
		id: agentIds[i],
		avg: (a.scoreA + a.scoreB) / 2,
	})).sort((a, b) => b.avg - a.avg);

	sorted.forEach((a, rank) => {
		console.log(
			`  ${String(a.id).padStart(6)} | ${a.name.padEnd(6)} | ${String(a.avg).padStart(9)} | #${rank + 1}`
		);
	});

	console.log('\nDone! Run the indexer to pick up these events.');
	console.log('Then check: http://localhost:5173/leaderboard');
}

main().catch((err) => {
	console.error('FATAL:', err);
	process.exit(1);
});
