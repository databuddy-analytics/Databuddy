import { beforeEach, describe, expect, it, mock } from 'bun:test';
import basketRouter from './basket';

// Mock external dependencies
const mockClickHouse = {
	insert: mock(() => Promise.resolve()),
};

const mockRedis = {
	get: mock(() => Promise.resolve(null)),
	setex: mock(() => Promise.resolve()),
	exists: mock(() => Promise.resolve(false)),
};

const mockAutumn = {
	check: mock(() => Promise.resolve({ data: { allowed: true } })),
};

const mockDb = {
	query: {
		websites: {
			findFirst: mock(() => Promise.resolve({
				id: 'test-client-id',
				domain: 'example.com',
				status: 'ACTIVE',
				userId: 'test-user-id',
				organizationId: null,
			})),
		},
	},
};

const mockGetWebsiteByIdV2 = mock(() => Promise.resolve({
	id: 'test-client-id',
	domain: 'example.com',
	status: 'ACTIVE',
	userId: 'test-user-id',
	organizationId: null,
	ownerId: 'test-user-id',
}));

const mockIsValidOrigin = mock(() => true);
const mockDetectBot = mock(() => ({ isBot: false }));
const mockValidatePayloadSize = mock(() => true);

// Mock modules
mock.module('@databuddy/db', () => ({
	clickHouse: mockClickHouse,
	db: mockDb,
}));

mock.module('@databuddy/redis', () => ({
	redis: mockRedis,
}));

mock.module('autumn-js', () => ({
	Autumn: mockAutumn,
}));

mock.module('../hooks/auth', () => ({
	getWebsiteByIdV2: mockGetWebsiteByIdV2,
	isValidOrigin: mockIsValidOrigin,
}));

mock.module('../utils/event-schema', () => ({
	analyticsEventSchema: {
		safeParse: mock(() => ({ success: true, data: {} })),
	},
	errorEventSchema: {
		safeParse: mock(() => ({ success: true, data: {} })),
	},
	webVitalsEventSchema: {
		safeParse: mock(() => ({ success: true, data: {} })),
	},
	customEventSchema: {
		safeParse: mock(() => ({ success: true, data: {} })),
	},
	outgoingLinkSchema: {
		safeParse: mock(() => ({ success: true, data: {} })),
	},
}));

mock.module('../utils/ip-geo', () => ({
	extractIpFromRequest: mock(() => '127.0.0.1'),
	getGeo: mock(() => Promise.resolve({
		anonymizedIP: 'hashed-ip',
		country: 'US',
		region: 'CA',
		city: 'San Francisco',
	})),
}));

mock.module('../utils/user-agent', () => ({
	detectBot: mockDetectBot,
	parseUserAgent: mock(() => ({
		browserName: 'Chrome',
		browserVersion: '120.0.0.0',
		osName: 'Windows',
		osVersion: '10',
		deviceType: 'desktop',
		deviceBrand: 'Unknown',
		deviceModel: 'Unknown',
	})),
}));

mock.module('../utils/validation', () => ({
	sanitizeString: mock((input) => input),
	VALIDATION_LIMITS: {
		PAYLOAD_MAX_SIZE: 1024 * 1024,
		SHORT_STRING_MAX_LENGTH: 255,
		STRING_MAX_LENGTH: 2048,
		BATCH_MAX_SIZE: 100,
	},
	FILTERED_ERROR_MESSAGES: new Set(['Script error.']),
	validatePayloadSize: mockValidatePayloadSize,
	validatePerformanceMetric: mock((value) => value),
	validateSessionId: mock((value) => value),
}));

describe('Basket Route', () => {
	beforeEach(() => {
		// Reset all mocks
		mockClickHouse.insert.mockClear();
		mockRedis.get.mockClear();
		mockRedis.setex.mockClear();
		mockRedis.exists.mockClear();
		mockAutumn.check.mockClear();
		mockGetWebsiteByIdV2.mockClear();
		mockIsValidOrigin.mockClear();
		mockDetectBot.mockClear();
		mockValidatePayloadSize.mockClear();
		
		mockGetWebsiteByIdV2.mockImplementation(() => Promise.resolve({
			id: 'test-client-id',
			domain: 'example.com',
			status: 'ACTIVE',
			userId: 'test-user-id',
			organizationId: null,
			ownerId: 'test-user-id',
		}));
		mockIsValidOrigin.mockImplementation(() => true);
		mockDetectBot.mockImplementation(() => ({ isBot: false }));
		mockValidatePayloadSize.mockImplementation(() => true);
	});

	describe('POST /', () => {
		it('should handle track events', async () => {
			const response = await basketRouter.fetch(new Request('http://localhost:4000/?client_id=test-client-id', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Origin': 'https://example.com',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
				body: JSON.stringify({
					type: 'track',
					name: 'page_view',
					anonymousId: 'test-anon-id',
					sessionId: 'test-session-id',
					timestamp: Date.now(),
					path: 'https://example.com/page',
					title: 'Test Page',
					screen_resolution: '1920x1080',
					viewport_size: '1920x1080',
					language: 'en-US',
					timezone: 'America/New_York',
					page_count: 1,
				}),
			}));

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.type).toBe('track');
		});

		it('should handle error events', async () => {
			const response = await basketRouter.fetch(new Request('http://localhost:4000/?client_id=test-client-id', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Origin': 'https://example.com',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
				body: JSON.stringify({
					type: 'error',
					payload: {
						eventId: 'test-event-id',
						anonymousId: 'test-anon-id',
						sessionId: 'test-session-id',
						timestamp: Date.now(),
						path: 'https://example.com/page',
						message: 'Test error message',
						filename: 'test.js',
						lineno: 42,
						colno: 15,
						stack: 'Error: Test error\n    at test.js:42:15',
						errorType: 'Error',
					},
				}),
			}));

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.type).toBe('error');
		});

		it('should handle web vitals events', async () => {
			const response = await basketRouter.fetch(new Request('http://localhost:4000/?client_id=test-client-id', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Origin': 'https://example.com',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
				body: JSON.stringify({
					type: 'web_vitals',
					payload: {
						eventId: 'test-event-id',
						anonymousId: 'test-anon-id',
						sessionId: 'test-session-id',
						timestamp: Date.now(),
						path: 'https://example.com/page',
						fcp: 1200,
						lcp: 2500,
						cls: 0.1,
						fid: 50,
						inp: 200,
					},
				}),
			}));

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.type).toBe('web_vitals');
		});

		it('should handle custom events', async () => {
			const response = await basketRouter.fetch(new Request('http://localhost:4000/?client_id=test-client-id', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Origin': 'https://example.com',
				},
				body: JSON.stringify({
					type: 'custom',
					eventId: 'test-event-id',
					name: 'button_click',
					anonymousId: 'test-anon-id',
					sessionId: 'test-session-id',
					timestamp: Date.now(),
					properties: {
						button_id: 'cta-button',
						button_text: 'Sign Up',
					},
				}),
			}));

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.type).toBe('custom');
		});

		it('should handle outgoing link events', async () => {
			const response = await basketRouter.fetch(new Request('http://localhost:4000/?client_id=test-client-id', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Origin': 'https://example.com',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
				body: JSON.stringify({
					type: 'outgoing_link',
					eventId: 'test-event-id',
					anonymousId: 'test-anon-id',
					sessionId: 'test-session-id',
					timestamp: Date.now(),
					href: 'https://external-site.com',
					text: 'Visit External Site',
					properties: {
						link_type: 'external',
					},
				}),
			}));

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.type).toBe('outgoing_link');
		});

		it('should accept valid requests with all fields', async () => {
			const response = await basketRouter.fetch(new Request('http://localhost:4000/?client_id=test-client-id', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Origin': 'https://example.com',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
				body: JSON.stringify({
					type: 'track',
					name: 'page_view',
					anonymousId: 'test-anon-id',
					sessionId: 'test-session-id',
					timestamp: Date.now(),
					sessionStartTime: Date.now() - 30000,
					path: 'https://example.com/page',
					title: 'Test Page',
					referrer: 'https://google.com',
					screen_resolution: '1920x1080',
					viewport_size: '1920x1080',
					language: 'en-US',
					timezone: 'America/New_York',
					connection_type: 'wifi',
					rtt: 50,
					downlink: 10,
					time_on_page: 30,
					scroll_depth: 75,
					interaction_count: 5,
					page_count: 1,
					utm_source: 'google',
					utm_medium: 'cpc',
					utm_campaign: 'summer_sale',
					load_time: 1200,
					dom_ready_time: 800,
					properties: {
						category: 'test',
					},
				}),
			}));

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.type).toBe('track');
		});
	});

	describe('POST /batch', () => {
		it('should handle batch requests', async () => {
			const response = await basketRouter.fetch(new Request('http://localhost:4000/batch?client_id=test-client-id', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Origin': 'https://example.com',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
				body: JSON.stringify([
					{
						type: 'track',
						name: 'page_view',
						anonymousId: 'test-anon-id',
						sessionId: 'test-session-id',
						timestamp: Date.now(),
						path: 'https://example.com/page1',
					},
					{
						type: 'track',
						name: 'page_view',
						anonymousId: 'test-anon-id',
						sessionId: 'test-session-id',
						timestamp: Date.now(),
						path: 'https://example.com/page2',
					},
				]),
			}));

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.batch).toBe(true);
			expect(data.results).toHaveLength(2);
		});

		it('should handle batch with multiple events', async () => {
			const response = await basketRouter.fetch(new Request('http://localhost:4000/batch?client_id=test-client-id', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Origin': 'https://example.com',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
				body: JSON.stringify([
					{
						type: 'track',
						name: 'page_view',
						anonymousId: 'test-anon-id',
						sessionId: 'test-session-id',
						timestamp: Date.now(),
						path: 'https://example.com/page1',
					},
					{
						type: 'track',
						name: 'page_view',
						anonymousId: 'test-anon-id',
						sessionId: 'test-session-id',
						timestamp: Date.now(),
						path: 'https://example.com/page2',
					},
					{
						type: 'track',
						name: 'page_view',
						anonymousId: 'test-anon-id',
						sessionId: 'test-session-id',
						timestamp: Date.now(),
						path: 'https://example.com/page3',
					},
				]),
			}));

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.batch).toBe(true);
			expect(data.results).toHaveLength(3);
		});

		it('should handle mixed event types in batch', async () => {
			const response = await basketRouter.fetch(new Request('http://localhost:4000/batch?client_id=test-client-id', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Origin': 'https://example.com',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
				body: JSON.stringify([
					{
						type: 'track',
						name: 'page_view',
						anonymousId: 'test-anon-id',
						sessionId: 'test-session-id',
						timestamp: Date.now(),
						path: 'https://example.com/page',
					},
					{
						type: 'error',
						payload: {
							eventId: 'test-event-id',
							anonymousId: 'test-anon-id',
							sessionId: 'test-session-id',
							timestamp: Date.now(),
							path: 'https://example.com/page',
							message: 'Test error',
						},
					},
					{
						type: 'custom',
						name: 'button_click',
						anonymousId: 'test-anon-id',
						sessionId: 'test-session-id',
						timestamp: Date.now(),
					},
				]),
			}));

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.batch).toBe(true);
			expect(data.results).toHaveLength(3);
		});
	});
});
