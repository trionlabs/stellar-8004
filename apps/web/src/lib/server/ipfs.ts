import { PINATA_JWT } from '$env/static/private';

const PINATA_API = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

export async function uploadEvidence(
	name: string,
	data: unknown
): Promise<{ cid: string; uri: string }> {
	if (!PINATA_JWT) {
		throw new Error('PINATA_JWT not configured — cannot upload evidence to IPFS');
	}

	const response = await fetch(PINATA_API, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${PINATA_JWT}`
		},
		body: JSON.stringify({
			pinataContent: data,
			pinataMetadata: { name }
		})
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
