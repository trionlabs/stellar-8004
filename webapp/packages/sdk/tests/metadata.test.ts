import { describe, expect, it } from 'vitest';
import {
	buildMetadataJson,
	buildMetadataJsonForEdit,
	getMetadataSize,
	toDataUri,
	validateUrl,
	validateMetadataJson
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
	x402Enabled: true,
	mppEnabled: false
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

	it('includes mpp field when mppEnabled is true', () => {
		const mppForm = { ...formData, mppEnabled: true };
		const metadata = buildMetadataJson(mppForm);
		expect(metadata.mpp).toBe(true);
		expect(metadata.x402).toBe(true);
	});

	it('omits mpp field when mppEnabled is false', () => {
		const metadata = buildMetadataJson(formData);
		expect('mpp' in metadata).toBe(false);
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

	it('translates legacy endpoints to services when form services are empty', () => {
		const emptyServicesForm = { ...formData, services: [] };
		const metadata = buildMetadataJsonForEdit(emptyServicesForm, {
			type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
			endpoints: [
				{ type: 'MCP', url: 'https://agent.example.com/mcp' },
				{ type: 'A2A', url: 'https://agent.example.com/a2a', version: '1.0' }
			]
		});

		expect(metadata.services).toEqual([
			{ name: 'MCP', endpoint: 'https://agent.example.com/mcp' },
			{ name: 'A2A', endpoint: 'https://agent.example.com/a2a', version: '1.0' }
		]);
		// `endpoints` must NOT survive into the new metadata - the spec
		// uses `services`.
		expect('endpoints' in metadata).toBe(false);
	});

	it('does not translate legacy endpoints when the form has explicit services', () => {
		const metadata = buildMetadataJsonForEdit(formData, {
			endpoints: [{ type: 'MCP', url: 'https://legacy.example/mcp' }]
		});
		// Form services win.
		expect(metadata.services).toEqual(formData.services);
		expect('endpoints' in metadata).toBe(false);
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

describe('validateMetadataJson', () => {
	it('accepts valid metadata', () => {
		expect(() => validateMetadataJson(buildMetadataJson(formData))).not.toThrow();
	});

	it('accepts minimal metadata (type + name only)', () => {
		expect(() => validateMetadataJson({ type: 'test', name: 'Agent' })).not.toThrow();
	});

	it('rejects missing type', () => {
		expect(() => validateMetadataJson({ name: 'Agent' })).toThrow(
			'Metadata must have a non-empty "type" string field'
		);
	});

	it('rejects missing name', () => {
		expect(() => validateMetadataJson({ type: 'test' })).toThrow(
			'Metadata must have a non-empty "name" string field'
		);
	});

	it('rejects non-string description', () => {
		expect(() =>
			validateMetadataJson({ type: 'test', name: 'Agent', description: 123 })
		).toThrow('Metadata "description" must be a string');
	});

	it('rejects non-string image', () => {
		expect(() =>
			validateMetadataJson({ type: 'test', name: 'Agent', image: 42 })
		).toThrow('Metadata "image" must be a string');
	});

	it('rejects non-array services', () => {
		expect(() =>
			validateMetadataJson({ type: 'test', name: 'Agent', services: 'not-array' })
		).toThrow('Metadata "services" must be an array');
	});
});
