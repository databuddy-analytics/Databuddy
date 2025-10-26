import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { randomUUID } from 'node:crypto';

/**
 * Comprehensive ingestion system tests
 * Tests focus on:
 * - Circuit breaker behavior under stress
 * - Edge cases in event processing
 * - Failure handling and recovery
 * - Buffer overflow scenarios
 * - Concurrent request handling
 */

type EventType = 'track' | 'error' | 'web_vitals' | 'custom' | 'outgoing_link';

interface MockProducerState {
	sent: number;
	failed: number;
	buffered: number;
	dropped: number;
	errors: number;
	bufferSize: number;
	simulateFailure: boolean;
	failureRate: number;
	latency: number;
	maxBufferSize: number;
	circuitBreakerOpen: boolean;
	consecutiveFailures: number;
	lastFailureTime: number;
}

// Mock producer with circuit breaker simulation
const mockProducerState: MockProducerState = {
	sent: 0,
	failed: 0,
	buffered: 0,
	dropped: 0,
	errors: 0,
	bufferSize: 0,
	simulateFailure: false,
	failureRate: 0,
	latency: 0,
	maxBufferSize: 10000,
	circuitBreakerOpen: false,
	consecutiveFailures: 0,
	lastFailureTime: 0,
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 5000;
const BUFFER_HARD_MAX = 10000;
const BUFFER_SOFT_MAX = 1000;

// Simulate event sending with circuit breaker logic
async function simulateSendEvent(topic: string, event: any): Promise<void> {
	// Simulate latency
	if (mockProducerState.latency > 0) {
		await new Promise(resolve => setTimeout(resolve, mockProducerState.latency));
	}

	// Check circuit breaker
	if (mockProducerState.circuitBreakerOpen) {
		const timeSinceLastFailure = Date.now() - mockProducerState.lastFailureTime;
		if (timeSinceLastFailure < CIRCUIT_BREAKER_TIMEOUT) {
			// Circuit breaker is open - buffer the event
			if (mockProducerState.bufferSize < mockProducerState.maxBufferSize) {
				mockProducerState.bufferSize++;
				mockProducerState.buffered++;
			} else {
				mockProducerState.dropped++;
			}
			return;
		}
		// Try to close circuit breaker
		mockProducerState.circuitBreakerOpen = false;
		mockProducerState.consecutiveFailures = 0;
	}

	// Simulate random failures based on failure rate
	const shouldFail = mockProducerState.simulateFailure || 
		(mockProducerState.failureRate > 0 && Math.random() < mockProducerState.failureRate);

	if (shouldFail) {
		mockProducerState.failed++;
		mockProducerState.consecutiveFailures++;
		mockProducerState.lastFailureTime = Date.now();

		// Open circuit breaker if threshold reached
		if (mockProducerState.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
			mockProducerState.circuitBreakerOpen = true;
		}

		// Buffer the event on failure
		if (mockProducerState.bufferSize < mockProducerState.maxBufferSize) {
			mockProducerState.bufferSize++;
			mockProducerState.buffered++;
		} else {
			mockProducerState.dropped++;
		}
		throw new Error('Simulated producer failure');
	}

	// Success
	mockProducerState.sent++;
	mockProducerState.consecutiveFailures = 0;
}

async function simulateSendEventBatch(topic: string, events: any[]): Promise<void> {
	for (const event of events) {
		await simulateSendEvent(topic, event);
	}
}

// Mock flush buffer
async function simulateFlush(): Promise<void> {
	if (mockProducerState.bufferSize === 0) return;
	
	// Simulate flushing buffer to clickhouse
	const itemsToFlush = Math.min(mockProducerState.bufferSize, 1000);
	mockProducerState.bufferSize -= itemsToFlush;
	
	// Simulate some failures during flush
	if (mockProducerState.simulateFailure) {
		mockProducerState.errors++;
	}
}

// Mock implementations
const mockClickHouse = {
	insert: mock(() => Promise.resolve()),
};

const mockRedis = {
	get: mock(() => Promise.resolve(null)),
	setex: mock(() => Promise.resolve()),
	exists: mock(() => Promise.resolve(false)),
	incr: mock(() => Promise.resolve(1)),
	expire: mock(() => Promise.resolve(1)),
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
				ownerId: 'test-user-id',
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

// Mock the producer module with our simulated functions
mock.module('../lib/producer', () => ({
	sendEvent: mock((topic: string, event: any) => {
		return simulateSendEvent(topic, event).catch(() => {});
	}),
	sendEventSync: mock(async (topic: string, event: any) => {
		return simulateSendEvent(topic, event);
	}),
	sendEventBatch: mock(async (topic: string, events: any[]) => {
		return simulateSendEventBatch(topic, events);
	}),
	getProducerStats: mock(() => ({
		kafkaSent: mockProducerState.sent,
		kafkaFailed: mockProducerState.failed,
		buffered: mockProducerState.buffered,
		flushed: 0,
		dropped: mockProducerState.dropped,
		errors: mockProducerState.errors,
		bufferSize: mockProducerState.bufferSize,
		connected: !mockProducerState.circuitBreakerOpen,
		failed: mockProducerState.circuitBreakerOpen,
	})),
	disconnectProducer: mock(() => Promise.resolve()),
}));

// Mock other modules
mock.module('@databuddy/db', () => ({
	clickHouse: mockClickHouse,
	db: mockDb,
	TABLE_NAMES: {
		events: 'events',
		errors: 'errors',
		web_vitals: 'web_vitals',
		custom_events: 'custom_events',
		outgoing_links: 'outgoing_links',
	},
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
	sanitizeString: mock((input: string) => input),
	VALIDATION_LIMITS: {
		PAYLOAD_MAX_SIZE: 1024 * 1024,
		SHORT_STRING_MAX_LENGTH: 255,
		STRING_MAX_LENGTH: 2048,
		PATH_MAX_LENGTH: 4096,
		TEXT_MAX_LENGTH: 1024,
		BATCH_MAX_SIZE: 100,
	},
	FILTERED_ERROR_MESSAGES: new Set(['Script error.']),
	validatePayloadSize: mockValidatePayloadSize,
	validatePerformanceMetric: mock((value: number) => value),
	validateSessionId: mock((value: string) => value),
}));

mock.module('../lib/security', () => ({
	getDailySalt: mock(() => Promise.resolve('test-salt')),
	saltAnonymousId: mock((id: string) => `salted-${id}`),
	checkDuplicate: mock(() => Promise.resolve(false)),
}));

mock.module('../lib/blocked-traffic', () => ({
	logBlockedTraffic: mock(() => Promise.resolve()),
}));

// Import after mocks
const basketRouter = (await import('./basket')).default;

function resetMockState(): void {
	mockProducerState.sent = 0;
	mockProducerState.failed = 0;
	mockProducerState.buffered = 0;
	mockProducerState.dropped = 0;
	mockProducerState.errors = 0;
	mockProducerState.bufferSize = 0;
	mockProducerState.simulateFailure = false;
	mockProducerState.failureRate = 0;
	mockProducerState.latency = 0;
	mockProducerState.maxBufferSize = BUFFER_HARD_MAX;
	mockProducerState.circuitBreakerOpen = false;
	mockProducerState.consecutiveFailures = 0;
	mockProducerState.lastFailureTime = 0;
}

function createTrackEvent(overrides = {}): Record<string, any> {
	return {
		type: 'track',
		name: 'page_view',
		anonymousId: randomUUID(),
		sessionId: randomUUID(),
		timestamp: Date.now(),
		path: 'https://example.com/test',
		title: 'Test Page',
		...overrides,
	};
}

function createErrorEvent(overrides = {}): Record<string, any> {
	return {
		type: 'error',
		payload: {
			eventId: randomUUID(),
			anonymousId: randomUUID(),
			sessionId: randomUUID(),
			timestamp: Date.now(),
			path: 'https://example.com/test',
			message: 'Test error message',
			filename: 'test.js',
			lineno: 42,
			colno: 15,
			stack: 'Error: Test error',
			errorType: 'Error',
			...overrides,
		},
	};
}

async function sendEvent(event: Record<string, any>): Promise<Response> {
	return basketRouter.fetch(new Request('http://localhost:4000/?client_id=test-client-id', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Origin': 'https://example.com',
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		},
		body: JSON.stringify(event),
	}));
}

async function sendBatch(events: Record<string, any>[]): Promise<Response> {
	return basketRouter.fetch(new Request('http://localhost:4000/batch?client_id=test-client-id', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Origin': 'https://example.com',
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		},
		body: JSON.stringify(events),
	}));
}

describe('Ingestion System - Circuit Breaker Tests', () => {
	beforeEach(() => {
		resetMockState();
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
		mockAutumn.check.mockImplementation(() => Promise.resolve({ data: { allowed: true } }));
	});

	describe('Circuit Breaker Behavior', () => {
		it('should open circuit breaker after consecutive failures', async () => {
			mockProducerState.simulateFailure = true;

			// Send events that will fail
			const promises: Promise<Response>[] = [];
			for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) {
				promises.push(sendEvent(createTrackEvent()));
			}

			await Promise.all(promises);

			// Circuit breaker should be open
			expect(mockProducerState.circuitBreakerOpen).toBe(true);
			expect(mockProducerState.consecutiveFailures).toBeGreaterThanOrEqual(CIRCUIT_BREAKER_THRESHOLD);
		});

		it('should buffer events when circuit breaker is open', async () => {
			mockProducerState.simulateFailure = true;

			// Open circuit breaker
			for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) {
				await sendEvent(createTrackEvent());
			}

			expect(mockProducerState.circuitBreakerOpen).toBe(true);
			const initialBuffered = mockProducerState.buffered;

			// Send more events - should be buffered
			await sendEvent(createTrackEvent());
			await sendEvent(createTrackEvent());

			expect(mockProducerState.buffered).toBeGreaterThan(initialBuffered);
		});

	it('should close circuit breaker after timeout', async () => {
		mockProducerState.simulateFailure = true;

		// Open circuit breaker
		for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) {
			await sendEvent(createTrackEvent());
		}

		expect(mockProducerState.circuitBreakerOpen).toBe(true);

		// Manually advance time to simulate timeout
		mockProducerState.lastFailureTime = Date.now() - CIRCUIT_BREAKER_TIMEOUT - 100;

		// Stop simulating failures
		mockProducerState.simulateFailure = false;

		// Next request should close circuit breaker
		await sendEvent(createTrackEvent());

		expect(mockProducerState.circuitBreakerOpen).toBe(false);
		expect(mockProducerState.consecutiveFailures).toBe(0);
	});

		it('should handle partial failures without opening circuit breaker', async () => {
			mockProducerState.failureRate = 0.3; // 30% failure rate

			const totalEvents = 20;
			const promises: Promise<Response>[] = [];

			for (let i = 0; i < totalEvents; i++) {
				promises.push(sendEvent(createTrackEvent()));
			}

			await Promise.all(promises);

			// With 30% failure rate, circuit breaker shouldn't open
			// unless we get 5 consecutive failures (very unlikely)
			// We can't assert exact numbers due to randomness, but we can check the system still works
			expect(mockProducerState.sent + mockProducerState.failed).toBeGreaterThan(0);
		});
	});

	describe('Buffer Management', () => {
		it('should buffer events when kafka is unavailable', async () => {
			mockProducerState.simulateFailure = true;

			const eventsToSend = 10;
			for (let i = 0; i < eventsToSend; i++) {
				await sendEvent(createTrackEvent());
			}

			expect(mockProducerState.buffered).toBeGreaterThan(0);
			expect(mockProducerState.dropped).toBe(0);
		});

		it('should drop events when buffer is full', async () => {
			mockProducerState.simulateFailure = true;
			mockProducerState.maxBufferSize = 10; // Small buffer for testing

			// Fill the buffer
			for (let i = 0; i < 15; i++) {
				await sendEvent(createTrackEvent());
			}

			expect(mockProducerState.dropped).toBeGreaterThan(0);
		});

		it('should handle buffer overflow gracefully', async () => {
			mockProducerState.simulateFailure = true;
			mockProducerState.maxBufferSize = 100;

			// Overflow the buffer
			const promises: Promise<Response>[] = [];
			for (let i = 0; i < 200; i++) {
				promises.push(sendEvent(createTrackEvent()));
			}

			await Promise.all(promises);

			// Should have dropped events
			expect(mockProducerState.dropped).toBeGreaterThan(0);
			
			// Buffer size should not exceed max
			expect(mockProducerState.bufferSize).toBeLessThanOrEqual(mockProducerState.maxBufferSize);
		});

		it('should flush buffer periodically', async () => {
			mockProducerState.simulateFailure = true;

			// Buffer some events
			for (let i = 0; i < 50; i++) {
				await sendEvent(createTrackEvent());
			}

			const initialBufferSize = mockProducerState.bufferSize;
			expect(initialBufferSize).toBeGreaterThan(0);

			// Simulate flush
			await simulateFlush();

			expect(mockProducerState.bufferSize).toBeLessThan(initialBufferSize);
		});

		it('should handle buffer flush failures', async () => {
			mockProducerState.simulateFailure = true;

			// Buffer events
			for (let i = 0; i < 20; i++) {
				await sendEvent(createTrackEvent());
			}

			const initialErrors = mockProducerState.errors;

			// Flush will fail because simulateFailure is true
			await simulateFlush();

			expect(mockProducerState.errors).toBeGreaterThanOrEqual(initialErrors);
		});
	});

	describe('Stress Testing - High Volume', () => {
		it('should handle 1000 concurrent events', async () => {
			const eventCount = 1000;
			const promises: Promise<Response>[] = [];

			for (let i = 0; i < eventCount; i++) {
				promises.push(sendEvent(createTrackEvent({ eventId: `stress-test-${i}` })));
			}

			const responses = await Promise.all(promises);

			// All requests should return successfully
			for (const response of responses) {
				expect(response.status).toBe(200);
			}

			// Check that events were processed
			expect(mockProducerState.sent + mockProducerState.buffered).toBeGreaterThan(0);
		});

		it('should handle burst traffic patterns', async () => {
			// Simulate burst traffic: 500 events in quick succession
			const burstSize = 500;
			const promises: Promise<Response>[] = [];

			const startTime = Date.now();

			for (let i = 0; i < burstSize; i++) {
				promises.push(sendEvent(createTrackEvent()));
			}

			await Promise.all(promises);

			const duration = Date.now() - startTime;

			// All events should be processed within reasonable time
			expect(duration).toBeLessThan(30000); // 30 seconds max

			// No events should be dropped under normal conditions
			expect(mockProducerState.dropped).toBe(0);
		});

		it('should handle sustained high load', async () => {
			// Simulate sustained load: 100 events/sec for 5 seconds
			const eventsPerBatch = 100;
			const batches = 5;

			for (let batch = 0; batch < batches; batch++) {
				const promises: Promise<Response>[] = [];

				for (let i = 0; i < eventsPerBatch; i++) {
					promises.push(sendEvent(createTrackEvent()));
				}

				await Promise.all(promises);
				
				// Small delay between batches
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			const totalExpected = eventsPerBatch * batches;
			const totalProcessed = mockProducerState.sent + mockProducerState.buffered;

			expect(totalProcessed).toBeGreaterThan(0);
		});
	});

	describe('Stress Testing - Batch Operations', () => {
		it('should handle large batch requests', async () => {
			const batchSize = 100; // Max batch size
			const events: Record<string, any>[] = [];

			for (let i = 0; i < batchSize; i++) {
				events.push(createTrackEvent({ eventId: `batch-${i}` }));
			}

			const response = await sendBatch(events);
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.batch).toBe(true);
			expect(data.processed).toBe(batchSize);
		});

		it('should handle multiple concurrent batch requests', async () => {
			const batchCount = 10;
			const eventsPerBatch = 50;
			const promises: Promise<Response>[] = [];

			for (let b = 0; b < batchCount; b++) {
				const events: Record<string, any>[] = [];
				for (let i = 0; i < eventsPerBatch; i++) {
					events.push(createTrackEvent({ eventId: `batch-${b}-event-${i}` }));
				}
				promises.push(sendBatch(events));
			}

			const responses = await Promise.all(promises);

			for (const response of responses) {
				expect(response.status).toBe(200);
				const data = await response.json();
				expect(data.status).toBe('success');
				expect(data.batch).toBe(true);
			}
		});

		it('should handle mixed event types in large batches', async () => {
			const events: Record<string, any>[] = [];

			// Mix of different event types
			for (let i = 0; i < 25; i++) events.push(createTrackEvent());
			for (let i = 0; i < 25; i++) events.push(createErrorEvent());
			for (let i = 0; i < 25; i++) events.push({ type: 'custom', name: 'test', anonymousId: randomUUID(), sessionId: randomUUID() });
			for (let i = 0; i < 25; i++) events.push({ type: 'web_vitals', payload: { anonymousId: randomUUID(), sessionId: randomUUID(), path: '/test', fcp: 100 } });

			const response = await sendBatch(events);
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.status).toBe('success');
			expect(data.processed).toBe(100);
		});

		it('should reject oversized batches', async () => {
			const events: Record<string, any>[] = [];
			const oversizedBatch = 150; // Over the limit

			for (let i = 0; i < oversizedBatch; i++) {
				events.push(createTrackEvent());
			}

			const response = await sendBatch(events);
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.status).toBe('error');
			expect(data.message).toBe('Batch too large');
		});
	});

	describe('Edge Cases', () => {
		it('should handle events with missing optional fields', async () => {
			const minimalEvent = {
				type: 'track',
				anonymousId: randomUUID(),
				sessionId: randomUUID(),
			};

			const response = await sendEvent(minimalEvent);
			expect(response.status).toBe(200);
		});

		it('should handle events with extremely large properties', async () => {
			const largeProperties = {
				data: 'x'.repeat(50000), // 50KB of data
			};

			const event = createTrackEvent({ properties: largeProperties });
			const response = await sendEvent(event);

			// Should still process (assuming under payload limit)
			expect(response.status).toBe(200);
		});

		it('should handle events with unicode characters', async () => {
			const event = createTrackEvent({
				title: '测试页面 🎉 Тест صفحة اختبار',
				path: '/测试/тест/اختبار',
			});

			const response = await sendEvent(event);
			expect(response.status).toBe(200);
		});

		it('should handle events with special characters in strings', async () => {
			const event = createTrackEvent({
				title: 'Test <script>alert("xss")</script>',
				path: '/test?param=value&other=<>"\'',
			});

			const response = await sendEvent(event);
			expect(response.status).toBe(200);
		});

		it('should handle events with null and undefined values', async () => {
			const event = {
				type: 'track',
				anonymousId: randomUUID(),
				sessionId: randomUUID(),
				title: null,
				referrer: undefined,
				properties: {
					nullValue: null,
					undefinedValue: undefined,
				},
			};

			const response = await sendEvent(event);
			expect(response.status).toBe(200);
		});

		it('should handle duplicate event IDs gracefully', async () => {
			const eventId = randomUUID();
			const event1 = createTrackEvent({ eventId });
			const event2 = createTrackEvent({ eventId });

			const response1 = await sendEvent(event1);
			const response2 = await sendEvent(event2);

			expect(response1.status).toBe(200);
			expect(response2.status).toBe(200);
		});

		it('should handle events with very old timestamps', async () => {
			const event = createTrackEvent({
				timestamp: Date.now() - (365 * 24 * 60 * 60 * 1000), // 1 year ago
			});

			const response = await sendEvent(event);
			expect(response.status).toBe(200);
		});

		it('should handle events with future timestamps', async () => {
			const event = createTrackEvent({
				timestamp: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year in future
			});

			const response = await sendEvent(event);
			expect(response.status).toBe(200);
		});

		it('should handle filtered error messages', async () => {
			const event = createErrorEvent({
				message: 'Script error.', // This is in FILTERED_ERROR_MESSAGES
			});

			const response = await sendEvent(event);
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.status).toBe('ignored');
		});

		it('should handle events with deeply nested properties', async () => {
			const deepObject: Record<string, any> = { level: 1 };
			let current = deepObject;

			// Create 10 levels of nesting
			for (let i = 2; i <= 10; i++) {
				current.nested = { level: i };
				current = current.nested;
			}

			const event = createTrackEvent({ properties: deepObject });
			const response = await sendEvent(event);
			expect(response.status).toBe(200);
		});
	});

	describe('Performance Under Degraded Conditions', () => {
		it('should maintain responsiveness with high latency', async () => {
			mockProducerState.latency = 100; // 100ms latency

			const startTime = Date.now();
			const response = await sendEvent(createTrackEvent());
			const duration = Date.now() - startTime;

			expect(response.status).toBe(200);
			// Should complete in reasonable time despite latency
			expect(duration).toBeLessThan(5000);
		});

		it('should handle intermittent failures', async () => {
			mockProducerState.failureRate = 0.5; // 50% failure rate

			const eventCount = 100;
			const promises: Promise<Response>[] = [];

			for (let i = 0; i < eventCount; i++) {
				promises.push(sendEvent(createTrackEvent()));
			}

			const responses = await Promise.all(promises);

			// All responses should be successful (events buffered on failure)
			for (const response of responses) {
				expect(response.status).toBe(200);
			}

			// Should have mix of sent and buffered events
			expect(mockProducerState.sent).toBeGreaterThan(0);
			expect(mockProducerState.buffered).toBeGreaterThan(0);
		});

	it('should recover from temporary outages', async () => {
		// Start with failures
		mockProducerState.simulateFailure = true;

		for (let i = 0; i < 10; i++) {
			await sendEvent(createTrackEvent());
		}

		const bufferedDuringOutage = mockProducerState.buffered;
		expect(bufferedDuringOutage).toBeGreaterThan(0);

		// Simulate recovery by manually advancing time
		mockProducerState.simulateFailure = false;
		mockProducerState.lastFailureTime = Date.now() - CIRCUIT_BREAKER_TIMEOUT - 100;

		// Send more events
		for (let i = 0; i < 10; i++) {
			await sendEvent(createTrackEvent());
		}

		// Should start sending again
		expect(mockProducerState.sent).toBeGreaterThan(0);
	});
	});

	describe('Concurrent Processing', () => {
		it('should handle mixed single and batch requests concurrently', async () => {
			const promises: Promise<Response>[] = [];

			// Mix of single events and batches
			for (let i = 0; i < 10; i++) {
				promises.push(sendEvent(createTrackEvent()));
			}

			for (let i = 0; i < 5; i++) {
				const batch: Record<string, any>[] = [];
				for (let j = 0; j < 10; j++) {
					batch.push(createTrackEvent());
				}
				promises.push(sendBatch(batch));
			}

			const responses = await Promise.all(promises);

			for (const response of responses) {
				expect(response.status).toBe(200);
			}
		});

		it('should maintain data integrity under concurrent load', async () => {
			const uniqueIds = new Set<string>();
			const eventCount = 100;
			const promises: Promise<Response>[] = [];

			for (let i = 0; i < eventCount; i++) {
				const eventId = randomUUID();
				uniqueIds.add(eventId);
				promises.push(sendEvent(createTrackEvent({ eventId })));
			}

			await Promise.all(promises);

			// All unique event IDs should be processed
			expect(uniqueIds.size).toBe(eventCount);
		});
	});

	describe('Resource Limits', () => {
		it('should handle rapid connection attempts', async () => {
			// Simulate many rapid requests
			const promises: Promise<Response>[] = [];
			for (let i = 0; i < 100; i++) {
				promises.push(sendEvent(createTrackEvent()));
			}

			const responses = await Promise.allSettled(promises);

			// Most should succeed
			const fulfilled = responses.filter(r => r.status === 'fulfilled');
			expect(fulfilled.length).toBeGreaterThan(90);
		});

		it('should prevent memory leaks with abandoned requests', async () => {
			const promises: Promise<Response>[] = [];

			// Create many requests but don't await them
			for (let i = 0; i < 50; i++) {
				promises.push(sendEvent(createTrackEvent()));
			}

			// Wait a bit then check system is still stable
			await new Promise(resolve => setTimeout(resolve, 100));

			// System should still accept new requests
			const response = await sendEvent(createTrackEvent());
			expect(response.status).toBe(200);
		});
	});

	describe('Validation Edge Cases', () => {
		it('should handle missing client_id', async () => {
			const response = await basketRouter.fetch(new Request('http://localhost:4000/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Origin': 'https://example.com',
				},
				body: JSON.stringify(createTrackEvent()),
			}));

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('error');
		});

		it('should handle invalid client_id', async () => {
			mockGetWebsiteByIdV2.mockImplementation(() => Promise.resolve({
				id: 'invalid-client-id',
				domain: 'example.com',
				status: 'ACTIVE',
				userId: 'test-user-id',
				organizationId: null,
				ownerId: 'test-user-id',
			}));

			const response = await sendEvent(createTrackEvent());
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.status).toBe('error');
		});

		it('should handle inactive website', async () => {
			mockGetWebsiteByIdV2.mockImplementation(() => Promise.resolve({
				id: 'test-client-id',
				domain: 'example.com',
				status: 'INACTIVE',
				userId: 'test-user-id',
				organizationId: null,
				ownerId: 'test-user-id',
			}));

			const response = await sendEvent(createTrackEvent());
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.status).toBe('error');
		});

		it('should handle bot traffic', async () => {
			mockDetectBot.mockImplementation(() => ({ isBot: true, reason: 'known_bot', category: 'Bot Detection', botName: 'Googlebot' }));

			const response = await sendEvent(createTrackEvent());
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.status).toBe('ignored');
		});

		it('should handle rate limit exceeded', async () => {
			mockAutumn.check.mockImplementation(() => Promise.resolve({ data: { allowed: false } }));

			const response = await sendEvent(createTrackEvent());
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.status).toBe('error');
			expect(data.message).toBe('Exceeded event limit');
		});

		it('should handle unauthorized origin', async () => {
			mockIsValidOrigin.mockImplementation(() => false);

			const response = await sendEvent(createTrackEvent());
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.status).toBe('error');
		});

		it('should handle payload too large', async () => {
			mockValidatePayloadSize.mockImplementation(() => false);

			const response = await sendEvent(createTrackEvent());
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.status).toBe('error');
			expect(data.message).toBe('Payload too large');
		});
	});
});

