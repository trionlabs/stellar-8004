import * as StellarSdk from '@stellar/stellar-sdk';

export interface GasEstimate {
	minResourceFee: string;
	instructions: string;
	readBytes: number;
	writeBytes: number;
	footprint: {
		readOnly: number;
		readWrite: number;
	};
}

export async function fundTestnet(address: string): Promise<void> {
	const response = await fetch(
		`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`
	);

	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		const suffix = detail ? ` — ${detail}` : '';
		throw new Error(`Friendbot failed: ${response.status}${suffix}`);
	}
}

export function estimateGas(
	simulation: StellarSdk.rpc.Api.SimulateTransactionResponse
): GasEstimate {
	if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
		throw new Error(`Simulation failed: ${simulation.error}`);
	}

	const resources = simulation.transactionData.build().resources();

	return {
		minResourceFee: simulation.minResourceFee,
		instructions: resources.instructions().toString(),
		readBytes: Number(resources.diskReadBytes()),
		writeBytes: Number(resources.writeBytes()),
		footprint: {
			readOnly: simulation.transactionData.getReadOnly().length,
			readWrite: simulation.transactionData.getReadWrite().length
		}
	};
}
