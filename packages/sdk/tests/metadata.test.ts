import { describe, expect, it } from 'vitest';
import {
	buildMetadataJson,
	buildMetadataJsonForEdit,
	getMetadataSize,
	toDataUri,
	validateUrl
} from '../src/core/metadata.js';
import type { AgentFormData } from '../src/core/types.js';

const formData: AgentFormData = {
	name: 'Nova',
	description: 'Automated analytics agent',
	imageUrl: 'https://example.com/agent.png',
	services: [
		{
			name: 'A2A',
			endpoint: 'https://example.com/a2a',
			version: '1.0.0'
		}
	],
	supportedTrust: ['reputation'],
	x402Enabled: true
};

describe('metadata helpers', () => {
	it('builds metadata json from form data', () => {
		expect(buildMetadataJson(formData)).toEqual({
			type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
			name: 'Nova',
			description: 'Automated analytics agent',
			image: 'https://example.com/agent.png',
			services: [
				{
					name: 'A2A',
					endpoint: 'https://example.com/a2a',
					version: '1.0.0'
				}
			],
			supportedTrust: ['reputation'],
			x402: true
		});
	});

	it('preserves unknown keys when rebuilding edit metadata', () => {
		const metadata = buildMetadataJsonForEdit(formData, {
			type: 'custom-type',
			license: 'MIT',
			category: 'trading'
		});

		expect(metadata).toMatchObject({
			type: 'custom-type',
			license: 'MIT',
			category: 'trading',
			name: 'Nova'
		});
	});

	it('validates supported url schemes', () => {
		expect(validateUrl('https://example.com')).toBe('');
		expect(validateUrl('ipfs://bafy123')).toBe('');
		expect(validateUrl('ftp://example.com')).toBe(
			'URL must start with https://, http://, or ipfs://'
		);
	});

	it('encodes metadata into a data URI', () => {
		const uri = toDataUri(buildMetadataJson(formData));
		expect(uri.startsWith('data:application/json;base64,')).toBe(true);
		expect(getMetadataSize(buildMetadataJson(formData))).toBeGreaterThan(0);
	});
});
