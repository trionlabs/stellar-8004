import type { StorageUploader } from './interface.js';
import { DataUriStorage } from './data-uri.js';
import { PinataStorage } from './pinata.js';

export interface AutoStorageOptions {
	dataUriStorage?: DataUriStorage;
	pinataJwt?: string;
	pinataStorage?: PinataStorage;
}

export class AutoStorage implements StorageUploader {
	private readonly dataUriStorage: DataUriStorage;
	private readonly pinataStorage?: PinataStorage;

	constructor(options: AutoStorageOptions = {}) {
		this.dataUriStorage = options.dataUriStorage ?? new DataUriStorage();
		this.pinataStorage =
			options.pinataStorage ??
			(options.pinataJwt ? new PinataStorage(options.pinataJwt) : undefined);
	}

	async upload(metadata: Record<string, unknown>): Promise<string> {
		try {
			return await this.dataUriStorage.upload(metadata);
		} catch (error) {
			const isSizeError =
				error instanceof Error && error.message.includes('Maximum is 8KB');

			if (!isSizeError) {
				throw error;
			}

			if (!this.pinataStorage) {
				throw new Error(
					'Metadata exceeds the 8KB data URI limit and no Pinata JWT was provided'
				);
			}

			return this.pinataStorage.upload(metadata);
		}
	}
}
