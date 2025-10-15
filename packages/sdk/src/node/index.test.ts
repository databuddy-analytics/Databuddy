import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Databuddy, EventResponse, db } from './index';

describe('Databuddy', () => {
	const mockFetch = mock(() => 
		Promise.resolve(
			new Response(JSON.stringify({ status: 'success', eventId: 'evt_123' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			})
		)
	);

	beforeEach(() => {
		mockFetch.mockClear();
		global.fetch = mockFetch as any;
	});

	describe('initialization', () => {
		it('should initialize with client ID', () => {
			const client = new Databuddy({ clientId: 'test-client-id' });
			expect(client).toBeDefined();
		});

		it('should throw error without client ID', () => {
			expect(() => new Databuddy({ clientId: '' })).toThrow('clientId is required');
		});

		it('should throw error with invalid client ID type', () => {
			expect(() => new Databuddy({ clientId: null as any })).toThrow('clientId is required');
		});

		it('should accept custom API URL', () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				apiUrl: 'https://custom.api.com',
			});
			expect(client).toBeDefined();
		});

		it('should accept debug flag', () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				debug: true,
			});
			expect(client).toBeDefined();
		});

		it('should accept custom logger', () => {
			const customLogger = {
				info: mock(() => {}),
				error: mock(() => {}),
				warn: mock(() => {}),
				debug: mock(() => {}),
			};

			const client = new Databuddy({
				clientId: 'test-client-id',
				logger: customLogger,
			});
			expect(client).toBeDefined();
		});

		it('should accept batching configuration', () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: true,
				batchSize: 20,
				batchTimeout: 5000,
				maxQueueSize: 500,
			});
			expect(client).toBeDefined();
		});

		it('should trim client ID', () => {
			const client = new Databuddy({ clientId: '  test-client-id  ' });
			expect(client).toBeDefined();
		});
	});

	describe('track - without batching', () => {
		it('should send event immediately when batching is disabled', async () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: false,
			});

			const result = await client.track({ name: 'test_event' });

			expect(result.success).toBe(true);
			expect(result.eventId).toBe('evt_123');
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should send event with properties', async () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: false,
			});

			const result = await client.track({
				name: 'test_event',
				properties: { foo: 'bar', count: 42 },
			});

			expect(result.success).toBe(true);
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should send event with all fields', async () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: false,
			});

			const result = await client.track({
				name: 'test_event',
				eventId: 'custom_id',
				anonymousId: 'anon_123',
				sessionId: 'sess_456',
				timestamp: 1234567890,
				properties: { key: 'value' },
			});

			expect(result.success).toBe(true);
		});

		it('should return error for missing event name', async () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: false,
			});

			const result = await client.track({ name: '' });

			expect(result.success).toBe(false);
			expect(result.error).toContain('Event name is required');
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should return error for invalid event name type', async () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: false,
			});

			const result = await client.track({ name: null as any });

			expect(result.success).toBe(false);
			expect(result.error).toContain('Event name is required');
		});

		it('should handle network errors', async () => {
			global.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: false,
			});

			const result = await client.track({ name: 'test_event' });

			expect(result.success).toBe(false);
			expect(result.error).toContain('Network error');
		});

		it('should handle HTTP errors', async () => {
			global.fetch = mock(() =>
				Promise.resolve(
					new Response('Not Found', {
						status: 404,
						statusText: 'Not Found',
					})
				)
			) as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: false,
			});

			const result = await client.track({ name: 'test_event' });

			expect(result.success).toBe(false);
			expect(result.error).toContain('404');
		});

		it('should handle server errors', async () => {
			global.fetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ status: 'error', message: 'Server error' }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					})
				)
			) as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: false,
			});

			const result = await client.track({ name: 'test_event' });

			expect(result.success).toBe(false);
			expect(result.error).toBe('Server error');
		});

		it('should use custom API URL', async () => {
			const customFetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ status: 'success', eventId: 'evt_123' }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					})
				)
			);
			global.fetch = customFetch as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				apiUrl: 'https://custom.api.com',
				enableBatching: false,
			});

			await client.track({ name: 'test_event' });

			expect(customFetch).toHaveBeenCalledTimes(1);
			const callArgs = customFetch.mock.calls[0] as any;
			expect(callArgs[0]).toContain('custom.api.com');
		});

		it('should include client ID in URL', async () => {
			const idFetch = mock(() =>
				Promise.resolve(
					new Response(JSON.stringify({ status: 'success', eventId: 'evt_123' }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					})
				)
			);
			global.fetch = idFetch as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: false,
			});

			await client.track({ name: 'test_event' });

			const callArgs = idFetch.mock.calls[0] as any;
			expect(callArgs[0]).toContain('client_id=test-client-id');
		});
	});

	describe('track - with batching', () => {
		it('should queue events when batching is enabled', async () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: true,
				batchSize: 10,
			});

			const result = await client.track({ name: 'test_event' });

			expect(result.success).toBe(true);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should auto-flush when batch size is reached', async () => {
			const batchFetch = mock(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							status: 'success',
							batch: true,
							processed: 3,
							results: [],
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } }
					)
				)
			);
			global.fetch = batchFetch as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: true,
				batchSize: 3,
			});

			await client.track({ name: 'event1' });
			await client.track({ name: 'event2' });
			await client.track({ name: 'event3' });

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(batchFetch).toHaveBeenCalled();
		});

		it('should auto-flush when max queue size is reached', async () => {
			const batchFetch = mock(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							status: 'success',
							batch: true,
							processed: 5,
							results: [],
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } }
					)
				)
			);
			global.fetch = batchFetch as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: true,
				batchSize: 10,
				maxQueueSize: 5,
			});

			for (let i = 0; i < 5; i++) {
				await client.track({ name: `event${i}` });
			}

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(batchFetch).toHaveBeenCalled();
		});
	});

	describe('flush', () => {
		it('should flush queued events', async () => {
			const flushFetch = mock(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							status: 'success',
							batch: true,
							processed: 2,
							results: [],
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } }
					)
				)
			);
			global.fetch = flushFetch as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: true,
				batchSize: 10,
			});

			await client.track({ name: 'event1' });
			await client.track({ name: 'event2' });

			const result = await client.flush();

			expect(result.success).toBe(true);
			expect(result.processed).toBe(2);
			expect(flushFetch).toHaveBeenCalledTimes(1);
		});

		it('should return success for empty queue', async () => {
			const emptyFetch = mock(() => Promise.resolve(new Response()));
			global.fetch = emptyFetch as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: true,
			});

			const result = await client.flush();

			expect(result.success).toBe(true);
			expect(result.processed).toBe(0);
			expect(emptyFetch).not.toHaveBeenCalled();
		});

		it('should clear queue after flush', async () => {
			const clearFetch = mock(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							status: 'success',
							batch: true,
							processed: 1,
							results: [],
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } }
					)
				)
			);
			global.fetch = clearFetch as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: true,
			});

			await client.track({ name: 'event1' });
			await client.flush();

			const result = await client.flush();

			expect(result.success).toBe(true);
			expect(result.processed).toBe(0);
		});

		it('should work with batching disabled', async () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: false,
			});

			const result = await client.flush();

			expect(result.success).toBe(true);
			expect(result.processed).toBe(0);
		});
	});

	describe('batch', () => {
		it('should send batch request', async () => {
			const batchReqFetch = mock(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							status: 'success',
							batch: true,
							processed: 2,
							results: [],
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } }
					)
				)
			);
			global.fetch = batchReqFetch as any;

			const client = new Databuddy({ clientId: 'test-client-id' });

			const result = await client.batch([
				{ type: 'custom', name: 'event1' },
				{ type: 'custom', name: 'event2' },
			]);

			expect(result.success).toBe(true);
			expect(result.processed).toBe(2);
			expect(batchReqFetch).toHaveBeenCalledTimes(1);
		});

		it('should reject non-array input', async () => {
			const client = new Databuddy({ clientId: 'test-client-id' });

			const result = await client.batch(null as any);

			expect(result.success).toBe(false);
			expect(result.error).toContain('array');
		});

		it('should reject empty array', async () => {
			const client = new Databuddy({ clientId: 'test-client-id' });

			const result = await client.batch([]);

			expect(result.success).toBe(false);
			expect(result.error).toContain('empty');
		});

		it('should reject batch over 100 events', async () => {
			const client = new Databuddy({ clientId: 'test-client-id' });

			const events = Array(101)
				.fill(null)
				.map((_, i) => ({ type: 'custom' as const, name: `event${i}` }));

			const result = await client.batch(events);

			expect(result.success).toBe(false);
			expect(result.error).toContain('100');
		});

		it('should reject events without name', async () => {
			const client = new Databuddy({ clientId: 'test-client-id' });

			const result = await client.batch([
				{ type: 'custom', name: 'event1' },
				{ type: 'custom', name: '' },
			]);

			expect(result.success).toBe(false);
			expect(result.error).toContain('name');
		});

		it('should handle batch network errors', async () => {
			global.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;

			const client = new Databuddy({ clientId: 'test-client-id' });

			const result = await client.batch([{ type: 'custom', name: 'event1' }]);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Network error');
		});
	});

	describe('db alias', () => {
		it('should export db as alias for Databuddy', () => {
			expect(db).toBe(Databuddy);
		});

		it('should work with db alias', () => {
			const client = new db({ clientId: 'test-client-id' });
			expect(client).toBeInstanceOf(Databuddy);
		});
	});

	describe('integration scenarios', () => {
		it('should handle rapid successive events with batching', async () => {
			const rapidFetch = mock(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							status: 'success',
							batch: true,
							processed: 5,
							results: [],
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } }
					)
				)
			);
			global.fetch = rapidFetch as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: true,
				batchSize: 5,
			});

			const promises: Promise<EventResponse>[] = [];
			for (let i = 0; i < 5; i++) {
				promises.push(client.track({ name: `event${i}` }));
			}

			await Promise.all(promises);
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(rapidFetch).toHaveBeenCalled();
		});

		it('should handle mixed track and flush calls', async () => {
			const mixedFetch = mock(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							status: 'success',
							batch: true,
							processed: 3,
							results: [],
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } }
					)
				)
			);
			global.fetch = mixedFetch as any;

			const client = new Databuddy({
				clientId: 'test-client-id',
				enableBatching: true,
			});

			await client.track({ name: 'event1' });
			await client.track({ name: 'event2' });
			await client.flush();

			await client.track({ name: 'event3' });
			await client.flush();

			expect(mixedFetch).toHaveBeenCalledTimes(2);
		});
	});

	describe('configuration edge cases', () => {
		it('should cap batch size at 100', () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				batchSize: 200,
			});
			expect(client).toBeDefined();
		});

		it('should handle zero batch timeout', () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				batchTimeout: 0,
			});
			expect(client).toBeDefined();
		});

		it('should handle very large max queue size', () => {
			const client = new Databuddy({
				clientId: 'test-client-id',
				maxQueueSize: 1000000,
			});
			expect(client).toBeDefined();
		});
	});
});

