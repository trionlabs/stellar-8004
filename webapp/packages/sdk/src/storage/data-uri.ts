import { toDataUri } from '../core/metadata.js';
import type { StorageUploader } from './interface.js';

export class DataUriStorage implements StorageUploader {
	async upload(metadata: Record<string, unknown>): Promise<string> {
		return toDataUri(metadata);
	}
}
