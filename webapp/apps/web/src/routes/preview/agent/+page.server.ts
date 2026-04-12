import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		state: 'ready' as const,
		justRegistered: false,
		txHash: null,
		uriResolveAttempts: 0,
		tag: '',
		agent: {
			id: 42,
			name: 'WeatherOracle',
			description:
				'Real-time weather data API powered by satellite feeds. Returns current conditions, 7-day forecasts, and severe weather alerts for any coordinate pair. Pay per request via x402.',
			image: null,
			owner: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3B3ILOUG5TM',
			wallet: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3B3ILOUG5TM',
			agentUri: 'https://weather-oracle.example.com/.well-known/8004.json',
			supportedTrust: ['uptime', 'reachable', 'successRate'],
			x402Enabled: true,
			services: [
				{
					name: 'Web',
					endpoint: 'https://weather-oracle.example.com/api/v1/forecast',
					version: '1.2.0',
					description: 'Get weather forecast for a location',
					inputExample: JSON.stringify(
						{ lat: 41.0082, lng: 28.9784, days: 3 },
						null,
						2
					)
				},
				{
					name: 'MCP',
					endpoint: 'https://weather-oracle.example.com/mcp',
					version: '1.0.0',
					description: 'Model Context Protocol endpoint'
				}
			],
			createdAt: '2026-03-15T10:30:00Z',
			updatedAt: '2026-04-10T14:22:00Z',
			registrationData: JSON.stringify(
				{
					name: 'WeatherOracle',
					description: 'Real-time weather data API',
					image: null,
					services: [
						{
							name: 'Web',
							endpoint: 'https://weather-oracle.example.com/api/v1/forecast',
							version: '1.2.0'
						}
					],
					supportedTrust: ['uptime', 'reachable', 'successRate'],
					x402Enabled: true
				},
				null,
				2
			)
		},
		metadata: [
			{ agent_id: 42, key: 'region', value: 'global' },
			{ agent_id: 42, key: 'data_source', value: 'NOAA + Copernicus' },
			{ agent_id: 42, key: 'update_frequency', value: '15min' }
		],
		feedback: [
			{
				id: 1,
				clientAddress: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAVOQZS3CORNESXNDEV',
				score: 88,
				tag1: 'uptime',
				tag2: 'reachable',
				feedbackUri: null,
				feedbackHash: null,
				isRevoked: false,
				createdAt: '2026-04-12T08:15:00Z',
				responses: []
			},
			{
				id: 2,
				clientAddress: 'GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5E3SMOUSE3LSMR3T',
				score: 92,
				tag1: 'successRate',
				tag2: null,
				feedbackUri: 'https://evidence.example.com/report-42',
				feedbackHash: 'a1b2c3d4e5f6',
				isRevoked: false,
				createdAt: '2026-04-10T16:42:00Z',
				responses: [
					{
						id: 10,
						responder: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3B3ILOUG5TM',
						responseUri: null,
						createdAt: '2026-04-10T17:00:00Z'
					}
				]
			},
			{
				id: 3,
				clientAddress: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
				score: 75,
				tag1: 'responseTime',
				tag2: null,
				feedbackUri: null,
				feedbackHash: null,
				isRevoked: false,
				createdAt: '2026-04-08T11:30:00Z',
				responses: []
			},
			{
				id: 4,
				clientAddress: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAVOQZS3CORNESXNDEV',
				score: 90,
				tag1: 'starred',
				tag2: null,
				feedbackUri: null,
				feedbackHash: null,
				isRevoked: false,
				createdAt: '2026-04-05T09:00:00Z',
				responses: []
			}
		],
		scores: {
			totalScore: 86.2,
			avgScore: 86.2,
			feedbackCount: 4,
			uniqueClients: 3,
			rank: 7,
			totalAgents: 128
		},
		clientBreakdown: [
			{
				clientAddress: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAVOQZS3CORNESXNDEV',
				feedbackCount: 2,
				avgScore: 89,
				lastFeedback: '2026-04-12T08:15:00Z'
			},
			{
				clientAddress: 'GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5E3SMOUSE3LSMR3T',
				feedbackCount: 1,
				avgScore: 92,
				lastFeedback: '2026-04-10T16:42:00Z'
			},
			{
				clientAddress: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
				feedbackCount: 1,
				avgScore: 75,
				lastFeedback: '2026-04-08T11:30:00Z'
			}
		],
		metadataCompleteness: 80,
		metadataMissing: ['image'],
		recentFeedbackCount: 2
	};
};
