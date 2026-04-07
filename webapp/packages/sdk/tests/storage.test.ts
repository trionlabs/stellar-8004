import { describe, expect, it, vi } from 'vitest';
import { AutoStorage } from '../src/storage/auto.js';
import { DataUriStorage } from '../src/storage/data-uri.js';
import { PinataStorage } from '../src/storage/pinata.js';

describe('storage uploaders', () => {
	it('stores small metadata as a data URI', async () => {
		const storage = new DataUriStorage();
		const uri = await storage.upload({ name: 'Nova' });

		expect(uri.startsWith('data:application/json;base64,')).toBe(true);
	});

	it('uploads metadata with Pinata', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ IpfsHash: 'bafy123' })
		});

		const storage = new PinataStorage('pinata-jwt', {
			fetch: fetchMock as typeof fetch
		});

		await expect(storage.upload({ name: 'Nova' })).resolves.toBe('ipfs://bafy123');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('falls back to Pinata when data URI metadata exceeds the limit', async () => {
		const pinataStorage = {
			upload: vi.fn().mockResolvedValue('ipfs://bafy456')
		} as unknown as PinataStorage;

		const storage = new AutoStorage({ pinataStorage });
		const uri = await storage.upload({
			name: 'Nova',
			description: 'x'.repeat(10_000)
		});

		expect(uri).toBe('ipfs://bafy456');
	});
});
