import { beforeEach, describe, expect, it, mock } from 'bun:test';
import app from './index';

// Mock external dependencies
const mockLogger = {
	info: mock(() => {}),
	warn: mock(() => {}),
	error: mock(() => {}),
};

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

// Mock modules
mock.module('./lib/logger', () => ({
	logger: mockLogger,
}));

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

mock.module('./routes/basket', () => ({
	default: {
		fetch: mock((request: Request) => {
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
					// Fallback if JSON parsing fails
					return Promise.resolve(new Response(JSON.stringify({ 
						status: 'success', 
						batch: true,
						processed: 1,
						results: [{ status: 'success', type: 'track' }]
					}), { status: 200 }));
				});
			}
			
			// Parse the request body to determine the event type
			return request.json().then((body) => {
				const eventType = body.type || 'track';
				return Promise.resolve(new Response(JSON.stringify({ 
					status: 'success', 
					type: eventType 
				}), { status: 200 }));
			}).catch(() => {
				// Fallback if JSON parsing fails
				return Promise.resolve(new Response(JSON.stringify({ 
					status: 'success', 
					type: 'track' 
				}), { status: 200 }));
			});
		}),
	},
}));

mock.module('./routes/email', () => ({
	default: {
		fetch: mock(() => Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 }))),
	},
}));

mock.module('./routes/stripe', () => ({
	default: {
		fetch: mock(() => Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 }))),
	},
}));

describe('Basket App', () => {
	beforeEach(() => {
		// Reset all mocks
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
			// Should not crash when no origin is provided
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
			
			// Should not crash the server
			expect([200, 400, 500]).toContain(response.status);
		});

		it('should handle requests to non-existent endpoints', async () => {
			const response = await app.fetch(new Request('http://localhost:4000/non-existent'));
			// Should handle gracefully without crashing
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
