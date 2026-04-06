import type { StorageUploader } from './interface.js';

const PINATA_ENDPOINT = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

export interface PinataStorageOptions {
	endpoint?: string;
	fetch?: typeof fetch;
	name?: string;
}

export class PinataStorage implements StorageUploader {
	private readonly fetchImpl: typeof fetch;
	private readonly endpoint: string;
	private readonly name: string;

	constructor(
		private readonly pinataJwt: string,
		options: PinataStorageOptions = {}
	) {
		if (!pinataJwt) {
			throw new Error('Pinata JWT is required');
		}

		this.fetchImpl = options.fetch ?? fetch;
		this.endpoint = options.endpoint ?? PINATA_ENDPOINT;
		this.name = options.name ?? 'stellar-erc8004-agent';
	}

	async upload(metadata: Record<string, unknown>): Promise<string> {
		const response = await this.fetchImpl(this.endpoint, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.pinataJwt}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				pinataMetadata: { name: this.name },
				pinataContent: metadata
			})
		});

		if (!response.ok) {
			const detail = await response.text().catch(() => '');
			const suffix = detail ? ` — ${detail}` : '';
			throw new Error(`Pinata upload failed: ${response.status}${suffix}`);
		}

		const body = (await response.json()) as { IpfsHash?: string };
		if (!body.IpfsHash) {
			throw new Error('Pinata upload failed: missing IpfsHash');
		}

		return `ipfs://${body.IpfsHash}`;
	}
}
