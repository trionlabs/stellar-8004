import { PINATA_JWT } from '$env/static/private';

const PINATA_FILE_API = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

/**
 * Upload raw JSON string to IPFS via Pinata.
 * Uses pinFileToIPFS (not pinJSONToIPFS) to preserve exact bytes —
 * critical for hash verification: the uploaded bytes must match
 * what was hashed client-side via SHA-256.
 */
export async function uploadEvidence(
	name: string,
	jsonString: string
): Promise<{ cid: string; uri: string }> {
	if (!PINATA_JWT) {
		throw new Error('PINATA_JWT not configured — cannot upload evidence to IPFS');
	}

	const blob = new Blob([jsonString], { type: 'application/json' });
	const formData = new FormData();
	formData.append('file', blob, `${name}.json`);
	formData.append(
		'pinataMetadata',
		JSON.stringify({ name })
	);

	const response = await fetch(PINATA_FILE_API, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${PINATA_JWT}`
		},
		body: formData
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Pinata upload failed (${response.status}): ${text}`);
	}

	const result = (await response.json()) as { IpfsHash: string };
	return {
		cid: result.IpfsHash,
		uri: `ipfs://${result.IpfsHash}`
	};
}
