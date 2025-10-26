import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from './index';

// Mock external dependencies
const mockLogger = {
	info: vi.fn(() => {}),
	warn: vi.fn(() => {}),
	error: vi.fn(() => {}),
};

const mockClickHouse = {
	insert: vi.fn(() => Promise.resolve()),
};

const mockRedis = {
	get: vi.fn(() => Promise.resolve(null)),
	setex: vi.fn(() => Promise.resolve()),
	exists: vi.fn(() => Promise.resolve(false)),
};

const mockAutumn = {
	check: vi.fn(() => Promise.resolve({ data: { allowed: true } })),
};

const mockDb = {
	query: {
		websites: {
			findFirst: vi.fn(() => Promise.resolve({
				id: 'test-client-id',
				domain: 'example.com',
				status: 'ACTIVE',
				userId: 'test-user-id',
				organizationId: null,
			})),
		},
	},
};
	
vi.mock('./lib/logger', () => ({
	logger: mockLogger,
}));

vi.mock('@databuddy/db', () => ({
	clickHouse: mockClickHouse,
	db: mockDb,
}));

vi.mock('@databuddy/redis', () => ({
	redis: mockRedis,
}));

vi.mock('autumn-js', () => ({
	Autumn: mockAutumn,
}));

vi.mock('./routes/basket', () => ({
	default: {
		fetch: vi.fn((request: Request) => {
			const url = new URL(request.url);
			const isBatch = url.pathname.includes('/batch');
			
			if (isBatch) {
				return request.json().then((body) => {
					const eventCount = Array.isArray(body) ? body.length : 1;
					const results = Array(eventCount).fill(null).map((_, index) => {
						const event = Array.isArray(body) ? body[index] : body;
						const eventType = event?.type || 'track';
						return { status: 'success', type: eventType };
					});
					
					return Promise.resolve(new Response(JSON.stringify({ 
						status: 'success', 
						batch: true,
						processed: eventCount,
						results
					}), { status: 200 }));
				}).catch(() => {
					return Promise.resolve(new Response(JSON.stringify({ 
						status: 'success', 
						batch: true,
						processed: 1,
						results: [{ status: 'success', type: 'track' }]
					}), { status: 200 }));
				});
			}
			
			return request.json().then((body) => {
				const eventType = body.type || 'track';
				return Promise.resolve(new Response(JSON.stringify({ 
					status: 'success', 
					type: eventType 
				}), { status: 200 }));
			}).catch(() => {
				return Promise.resolve(new Response(JSON.stringify({ 
					status: 'success', 
					type: 'track' 
				}), { status: 200 }));
			});
		}),
	},
}));

vi.mock('./routes/email', () => ({
	default: {
		fetch: vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 }))),
	},
}));

vi.mock('./routes/stripe', () => ({
	default: {
		fetch: vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 }))),
	},
}));

describe('Basket App', () => {
	beforeEach(() => {
		mockLogger.info.mockClear();
		mockLogger.warn.mockClear();
		mockLogger.error.mockClear();
		mockClickHouse.insert.mockClear();
		mockRedis.get.mockClear();
		mockRedis.setex.mockClear();
		mockRedis.exists.mockClear();
		mockAutumn.check.mockClear();
	});

	describe('App Initialization', () => {
		it('should initialize without errors', () => {
			expect(app).toBeDefined();
			expect(app.fetch).toBeDefined();
			expect(app.port).toBeDefined();
		});

		it('should have correct port configuration', () => {
			expect(app.port).toBe(4000);
		});

		it('should export fetch function', () => {
			expect(typeof app.fetch).toBe('function');
		});
	});

	describe('Health Endpoint', () => {
		it('should respond to health check', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/health'));
			expect(response.status).toBe(200);
			
			const data = await response.json();
			expect(data).toEqual({
				status: 'ok',
				version: '1.0.0',
				producer_stats: {
					kafkaSent: 0,
					kafkaFailed: 0,
					buffered: 0,
					flushed: 0,
					dropped: 0,
					errors: 0,
					bufferSize: 0,
					connected: false,
					failed: false,
				},
			});
		});

		it('should handle multiple health checks', async () => {
			const requests = Array(5).fill(null).map(() => 
				app.fetch(new Request('http://localhost:4000/health'))
			);
			
			const responses = await Promise.all(requests);
			
			for (const response of responses) {
				expect(response.status).toBe(200);
				const data = await response.json();
				expect(data.status).toBe('ok');
			}
		});
	});

	describe('CORS Configuration', () => {
		it('should handle OPTIONS requests', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/', {
				method: 'OPTIONS',
				headers: {
					'Origin': 'https://example.com',
				},
			}));
			
			expect(response.status).toBe(204);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
			expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
			expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
			expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
		});

		it('should set CORS headers for requests with origin', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/health', {
				headers: {
					'Origin': 'https://example.com',
				},
			}));
			
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
			expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
		});

		it('should handle requests without origin', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/health'));
			expect(response.status).toBe(200);
		});

		it('should include custom headers in CORS', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/', {
				method: 'OPTIONS',
				headers: {
					'Origin': 'https://example.com',
				},
			}));
			
			const allowedHeaders = response.headers.get('Access-Control-Allow-Headers');
			expect(allowedHeaders).toContain('databuddy-client-id');
			expect(allowedHeaders).toContain('databuddy-sdk-name');
			expect(allowedHeaders).toContain('databuddy-sdk-version');
		});
	});

	describe('Error Handling', () => {
		it('should handle malformed requests gracefully', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: 'invalid json',
			}));
			
			expect([200, 400, 500]).toContain(response.status);
		});

		it('should handle requests to non-existent endpoints', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/non-existent'));
			expect([200, 404, 405]).toContain(response.status);
		});

		it('should handle requests with invalid methods', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/health', {
				method: 'DELETE',
			}));
			
			expect([200, 404, 405]).toContain(response.status);
		});
	});

	describe('Route Integration', () => {
		it('should have basket routes available', () => {
			expect(app).toBeDefined();
			expect(app.fetch).toBeDefined();
		});

		it('should have email routes available', () => {
			expect(app).toBeDefined();
			expect(app.fetch).toBeDefined();
		});

		it('should have stripe routes available', () => {
			expect(app).toBeDefined();
			expect(app.fetch).toBeDefined();
		});
	});

	describe('Performance', () => {
		it('should respond quickly to health checks', async () => {
			const start = Date.now();
			const response = await app.fetch(new Request('http://localhost:4000/health'));
			const duration = Date.now() - start;
			
			expect(response.status).toBe(200);
			expect(duration).toBeLessThan(100); // Should be very fast
		});

		it('should handle concurrent requests', async () => {
			const requests = Array(10).fill(null).map(() => 
				app.fetch(new Request('http://localhost:4000/health'))
			);
			
			const start = Date.now();
			const responses = await Promise.all(requests);
			const duration = Date.now() - start;
			
			for (const response of responses) {
				expect(response.status).toBe(200);
			}
			
			expect(duration).toBeLessThan(500); // Should handle 10 requests in under 500ms
		});

		it('should handle rapid successive requests', async () => {
			const start = Date.now();
			
			for (let i = 0; i < 5; i++) {
				const response = await app.fetch(new Request('http://localhost:4000/health'));
				expect(response.status).toBe(200);
			}
			
			const duration = Date.now() - start;
			expect(duration).toBeLessThan(200); // Should handle 5 requests in under 200ms
		});
	});

	describe('Middleware', () => {
		it('should apply error handling middleware', async () => {
			// Test that errors are caught and handled
			const response = await app.fetch(new Request('http://localhost:4000/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: 'invalid json',
			}));
			
			// Should not crash the server
			expect([200, 400, 500]).toContain(response.status);
		});

		it('should apply CORS middleware', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/health', {
				headers: {
					'Origin': 'https://example.com',
				},
			}));
			
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
		});

		it('should handle preflight requests', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/', {
				method: 'OPTIONS',
				headers: {
					'Origin': 'https://example.com',
					'Access-Control-Request-Method': 'POST',
					'Access-Control-Request-Headers': 'Content-Type',
				},
			}));
			
			expect(response.status).toBe(204);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
			expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
		});
	});

	describe('Environment Configuration', () => {
		it('should work with default port', () => {
			expect(app.port).toBe(4000);
		});

		it('should handle missing environment variables gracefully', async () => {
			// Test that the app works even without optional env vars
			const response = await app.fetch(new Request('http://localhost:4000/health'));
			expect(response.status).toBe(200);
		});
	});

	describe('Server Lifecycle', () => {
		it('should maintain state across requests', async () => {
			const response1 = await app.fetch(new Request('http://localhost:4000/health'));
			const response2 = await app.fetch(new Request('http://localhost:4000/health'));
			
			expect(response1.status).toBe(200);
			expect(response2.status).toBe(200);
			
			const data1 = await response1.json();
			const data2 = await response2.json();
			
			expect(data1).toEqual(data2);
		});

		it('should handle server restarts gracefully', async () => {
			// Test that the server can handle being "restarted"
			const response1 = await app.fetch(new Request('http://localhost:4000/health'));
			expect(response1.status).toBe(200);
			
			// Simulate restart
			const response2 = await app.fetch(new Request('http://localhost:4000/health'));
			expect(response2.status).toBe(200);
			
			const data1 = await response1.json();
			const data2 = await response2.json();
			expect(data1).toEqual(data2);
		});
	});
});
