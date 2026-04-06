/**
 * Recover agents from on-chain state into Supabase DB.
 *
 * Reads agent data directly from the Identity Registry contract using
 * view functions (owner_of, agent_uri). No event retention dependency.
 *
 * Usage:
 *   SUPABASE_URL=http://... SUPABASE_SERVICE_KEY=... npx tsx scripts/recover-agents.ts [startId] [endId]
 *
 * Examples:
 *   npx tsx scripts/recover-agents.ts 1 55        # scan agents 1-55
 *   npx tsx scripts/recover-agents.ts 31 33       # recover specific range
 */
import * as StellarSdk from '@stellar/stellar-sdk';

const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const IDENTITY_CONTRACT = 'CDGNYED4CKOFL6FIJTQY76JU7ZMOSUB5JQTOD545CXNVSC7H7UL4TRGZ';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

const server = new StellarSdk.rpc.Server(RPC_URL);

// ─── Contract Read Helpers ──────────────────────────────────────────

async function simulateRead(
	method: string,
	args: StellarSdk.xdr.ScVal[]
): Promise<StellarSdk.xdr.ScVal | null> {
	const contract = new StellarSdk.Contract(IDENTITY_CONTRACT);

	// Use a dummy source account for simulation (read-only, no signing needed)
	const dummyAccount = new StellarSdk.Account(
		'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
		'0'
	);

	const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
		fee: StellarSdk.BASE_FEE,
		networkPassphrase: NETWORK_PASSPHRASE,
	})
		.addOperation(contract.call(method, ...args))
		.setTimeout(30)
		.build();

	const sim = await server.simulateTransaction(tx);
	if (StellarSdk.rpc.Api.isSimulationError(sim)) {
		return null; // Agent doesn't exist or method failed
	}
	if (StellarSdk.rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
		return sim.result.retval;
	}
	return null;
}

async function getOwnerOf(agentId: number): Promise<string | null> {
	try {
		const result = await simulateRead('owner_of', [
			StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
		]);
		if (!result) return null;
		return StellarSdk.scValToNative(result) as string;
	} catch {
		return null;
	}
}

async function getAgentUri(agentId: number): Promise<string | null> {
	try {
		const result = await simulateRead('agent_uri', [
			StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
		]);
		if (!result) return null;
		return StellarSdk.scValToNative(result) as string;
	} catch {
		return null;
	}
}

async function getAgentWallet(agentId: number): Promise<string | null> {
	try {
		const result = await simulateRead('get_agent_wallet', [
			StellarSdk.nativeToScVal(agentId, { type: 'u32' }),
		]);
		if (!result) return null;
		const val = StellarSdk.scValToNative(result);
		return val || null;
	} catch {
		return null;
	}
}

// ─── DB Writer ──────────────────────────────────────────────────────

async function upsertAgent(agent: {
	id: number;
	owner: string;
	agentUri: string | null;
	wallet: string | null;
}): Promise<boolean> {
	const body: Record<string, any> = {
		id: agent.id,
		owner: agent.owner,
		agent_uri: agent.agentUri,
		wallet: agent.wallet,
		resolve_uri_pending: !!agent.agentUri,
	};

	const res = await fetch(`${SUPABASE_URL}/rest/v1/agents`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			apikey: SUPABASE_SERVICE_KEY,
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			Prefer: 'resolution=merge-duplicates',
		},
		body: JSON.stringify(body),
	});

	if (!res.ok && res.status !== 409) {
		const text = await res.text();
		console.error(`  DB error for agent ${agent.id}: ${res.status} ${text}`);
		return false;
	}
	return true;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
	const startId = parseInt(process.argv[2] || '1', 10);
	const endId = parseInt(process.argv[3] || '100', 10);

	if (!SUPABASE_SERVICE_KEY) {
		console.error('SUPABASE_SERVICE_KEY required');
		process.exit(1);
	}

	console.log(`=== Agent Recovery: scanning IDs ${startId}-${endId} ===`);
	console.log(`RPC: ${RPC_URL}`);
	console.log(`DB:  ${SUPABASE_URL}\n`);

	let found = 0;
	let inserted = 0;
	let notFound = 0;
	let consecutiveMisses = 0;

	for (let id = startId; id <= endId; id++) {
		const owner = await getOwnerOf(id);

		if (!owner) {
			notFound++;
			consecutiveMisses++;
			// Stop early if 10 consecutive IDs don't exist
			if (consecutiveMisses >= 10 && id > startId + 10) {
				console.log(`\n  10 consecutive misses at id=${id}, stopping scan.`);
				break;
			}
			continue;
		}
		consecutiveMisses = 0;

		const uri = await getAgentUri(id);
		const wallet = await getAgentWallet(id);
		found++;

		const ok = await upsertAgent({ id, owner, agentUri: uri, wallet });
		if (ok) {
			inserted++;
			console.log(`  #${id} → owner=${owner.slice(0, 8)}... uri=${uri ? 'yes' : 'no'} wallet=${wallet ? wallet.slice(0, 8) + '...' : 'none'}`);
		}
	}

	console.log(`\n=== Summary ===`);
	console.log(`Scanned:  ${endId - startId + 1} IDs`);
	console.log(`Found:    ${found} agents on-chain`);
	console.log(`Inserted: ${inserted} into DB`);
	console.log(`Missing:  ${notFound} IDs not registered`);

	if (inserted > 0) {
		console.log('\nTrigger URI resolution:');
		console.log('  curl -X POST $SUPABASE_URL/functions/v1/resolve-uris -H "Authorization: Bearer $SECRET"');
	}
}

main().catch((err) => {
	console.error('FATAL:', err);
	process.exit(1);
});
