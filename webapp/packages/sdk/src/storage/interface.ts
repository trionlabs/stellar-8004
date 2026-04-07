export interface StorageUploader {
	upload(metadata: Record<string, unknown>): Promise<string>;
}
