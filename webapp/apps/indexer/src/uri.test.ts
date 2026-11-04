import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveUri } from './uri.js';

const json = (body: unknown) =>
	new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
const stubFetch = (...responses: Response[]) => {
	const fetchMock = vi.fn<typeof fetch>();
	for (const response of responses) fetchMock.mockResolvedValueOnce(response);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('resolveUri', () => {
	it('fetches an http(s) document with a 10 s timeout and redirects off, where no Deno global exists', async () => {
		expect('Deno' in globalThis).toBe(false); // as on Workers
		const fetchMock = stubFetch(json({ name: 'agent' }));
		const timeout = vi.spyOn(AbortSignal, 'timeout');

		await expect(resolveUri('https://agents.example/a.json')).resolves.toEqual({ name: 'agent' });
		expect(fetchMock).toHaveBeenCalledWith(
			'https://agents.example/a.json',
			expect.objectContaining({ redirect: 'manual' })
		);
		expect(timeout).toHaveBeenCalledWith(10_000);
	});

	it.each([
		'ftp://agents.example/a.json',
		'file:///etc/passwd',
		'http://localhost/a',
		'http://metadata.internal/a',
		'http://printer.local/a',
		'http://127.0.0.1/a',
		'http://10.0.0.8/a',
		'http://192.168.1.1/a',
		'http://169.254.169.254/latest/meta-data',
		'http://100.64.0.1/a',
		'http://[::1]/a',
		'http://[fe80::1]/a',
		'http://[fd00::1]/a',
		'http://[fc00::1]/a',
		'http://[ff02::1]/a',
		'http://[::ffff:127.0.0.1]/a',
		'https://8.8.8.8/a.json',
		'https://[2606:4700::1111]/a.json'
	])('refuses %s without fetching', async (uri) => {
		const fetchMock = stubFetch();
		await expect(resolveUri(uri)).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		'https://fdroid.org/a.json',
		'https://ffmpeg.org/a.json',
		'https://fcc.gov/a.json',
		'https://feb.example/a.json'
	])('fetches %s: IPv6 prefixes apply to IP literals only', async (uri) => {
		const fetchMock = stubFetch(json({ name: 'public' }));
		await expect(resolveUri(uri)).resolves.toEqual({ name: 'public' });
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('follows one redirect after checking its target, without redirect: "error" (workerd rejects it)', async () => {
		const fetchMock = stubFetch(redirect('/moved.json'), json({ name: 'moved' }));
		await expect(resolveUri('https://agents.example/a.json')).resolves.toEqual({ name: 'moved' });
		expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.redirect])).toEqual([
			['https://agents.example/a.json', 'manual'],
			['https://agents.example/moved.json', 'manual']
		]);
	});

	it('refuses a redirect into private space and a second redirect', async () => {
		const toMetadata = stubFetch(redirect('http://169.254.169.254/latest/meta-data'));
		await expect(resolveUri('https://agents.example/a.json')).resolves.toBeNull();
		expect(toMetadata).toHaveBeenCalledTimes(1);

		const twice = stubFetch(redirect('https://b.example/1'), redirect('https://c.example/2'));
		await expect(resolveUri('https://agents.example/a.json')).resolves.toBeNull();
		expect(twice).toHaveBeenCalledTimes(2);
	});

	it('caps the body at 1 MiB, whether declared or streamed', async () => {
		const body = JSON.stringify('a'.repeat(1_100_000)); // valid JSON, so only the cap rejects it
		const bytes = new TextEncoder().encode(body);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				for (let offset = 0; offset < bytes.length; offset += 65_536)
					controller.enqueue(bytes.slice(offset, offset + 65_536));
				controller.close();
			}
		});
		stubFetch(
			new Response(body, { headers: { 'content-length': String(bytes.length) } }),
			new Response(stream)
		);
		await expect(resolveUri('https://agents.example/declared.json')).resolves.toBeNull();
		await expect(resolveUri('https://agents.example/streamed.json')).resolves.toBeNull();
	});

	it('reads data: URIs up to the same cap', async () => {
		await expect(
			resolveUri(`data:application/json,${encodeURIComponent('{"name":"inline"}')}`)
		).resolves.toEqual({
			name: 'inline'
		});
		await expect(
			resolveUri(`data:application/json;base64,${btoa('{"name":"b64"}')}`)
		).resolves.toEqual({ name: 'b64' });
		await expect(
			resolveUri(`data:application/json,${JSON.stringify('a'.repeat(1_048_576))}`)
		).resolves.toBeNull();
	});

	it('tries the IPFS gateways in order', async () => {
		const fetchMock = stubFetch(new Response('gone', { status: 410 }), json({ name: 'ipfs' }));
		await expect(resolveUri('ipfs://bafyexample/agent.json')).resolves.toEqual({ name: 'ipfs' });
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			'https://ipfs.io/ipfs/bafyexample/agent.json',
			'https://gateway.pinata.cloud/ipfs/bafyexample/agent.json'
		]);
	});

	it('still refuses a public name that resolves into private space where the runtime offers DNS', async () => {
		const resolveDns = vi.fn(async (_host: string, type: string) =>
			type === 'A' ? ['10.1.2.3'] : []
		);
		vi.stubGlobal('Deno', { resolveDns });
		const fetchMock = stubFetch();
		await expect(resolveUri('https://rebind.example/a.json')).resolves.toBeNull();
		expect(resolveDns).toHaveBeenCalledWith('rebind.example', 'A');
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
