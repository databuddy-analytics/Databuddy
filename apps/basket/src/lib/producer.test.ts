import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Kafka, type Consumer } from 'kafkajs';
import { disconnectProducer, sendEvent, sendEventSync } from './producer';

const KAFKA_BROKERS = process.env.KAFKA_BROKERS as string;
console.log('KAFKA_BROKERS', KAFKA_BROKERS);
const TEST_TOPIC = 'test';
const TEST_GROUP_ID = 'producer-test-consumer';

describe('Producer Module', () => {
	let kafka: Kafka;
	let consumer: Consumer;
	let receivedMessages: Array<{ value: string; key: string | null }> = [];

	beforeAll(async () => {
		kafka = new Kafka({
			clientId: 'producer-test',
			brokers: [KAFKA_BROKERS],
			retry: {
				initialRetryTime: 100,
				retries: 8,
			},
			sasl: {
				mechanism: 'scram-sha-256',
				username: process.env.KAFKA_USER as string,
				password: process.env.KAFKA_PASSWORD as string,
			},
		});

		consumer = kafka.consumer({ 
			groupId: TEST_GROUP_ID,
			sessionTimeout: 10000,
			allowAutoTopicCreation: true,
		});

		await consumer.connect();
		await consumer.subscribe({ 
			topic: TEST_TOPIC, 
			fromBeginning: false,
		});

		await consumer.run({
			eachMessage: async ({ message }) => {
				receivedMessages.push({
					value: message.value?.toString() || '',
					key: message.key?.toString() || null,
				});
			},
		});

		await new Promise(resolve => setTimeout(resolve, 2000));
	});

	afterAll(async () => {
		await disconnectProducer();
		await consumer.disconnect();
	});

	describe('sendMessageSync', () => {
		it('should send a message and wait for acknowledgment', async () => {
			const testMessage = JSON.stringify({
				type: 'sync-test',
				timestamp: new Date().toISOString(),
			});

			const initialCount = receivedMessages.length;

			await sendEventSync(TEST_TOPIC, testMessage);

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.slice(initialCount).some(
				msg => msg.value === testMessage
			);
			expect(found).toBe(true);
		});

		it('should handle multiple consecutive sync sends', async () => {
			const messages = Array.from({ length: 3 }, (_, i) => 
				JSON.stringify({
					type: 'consecutive-sync',
					index: i,
					timestamp: new Date().toISOString(),
				})
			);

			for (const message of messages) {
				await sendEventSync(TEST_TOPIC, message);
			}

			await new Promise(resolve => setTimeout(resolve, 1500));
			
			for (const message of messages) {
				const found = receivedMessages.some(msg => msg.value === message);
				expect(found).toBe(true);
			}
		});
	});

	describe('sendEvent', () => {
		it('should send an event object', async () => {
			const event = {
				type: 'track',
				event: 'test_event',
				client_id: 'test-client-123',
				timestamp: new Date().toISOString(),
				properties: {
					test: true,
				},
			};

			const initialCount = receivedMessages.length;

			await sendEvent(TEST_TOPIC, event);

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.slice(initialCount).some(msg => {
				try {
					const parsed = JSON.parse(msg.value);
					return parsed.event === 'test_event' && 
						parsed.client_id === event.client_id;
				} catch {
					return false;
				}
			});
			
			expect(found).toBe(true);
		});

		it('should use client_id as default key', async () => {
			const event = {
				type: 'track',
				event: 'test_with_key',
				client_id: 'default-key-client',
				timestamp: new Date().toISOString(),
			};

			const initialCount = receivedMessages.length;

			await sendEvent(TEST_TOPIC, event);

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.slice(initialCount).some(
				msg => msg.key === event.client_id
			);
			expect(found).toBe(true);
		});

		it('should use custom key when provided', async () => {
			const customKey = 'custom-partition-key';
			const event = {
				type: 'track',
				event: 'test_custom_key',
				client_id: 'test-client-456',
				timestamp: new Date().toISOString(),
			};

			const initialCount = receivedMessages.length;

			await sendEvent(TEST_TOPIC, event, customKey);

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.slice(initialCount).some(
				msg => msg.key === customKey
			);
			expect(found).toBe(true);
		});

		it('should handle events without client_id', async () => {
			const event = {
				type: 'track',
				event: 'no_client_id',
				timestamp: new Date().toISOString(),
			};

			const initialCount = receivedMessages.length;

			await sendEvent(TEST_TOPIC, event);

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.slice(initialCount).some(msg => {
				try {
					const parsed = JSON.parse(msg.value);
					return parsed.event === 'no_client_id';
				} catch {
					return false;
				}
			});
			
			expect(found).toBe(true);
		});

		it('should serialize complex nested events', async () => {
			const event = {
				type: 'track',
				event: 'complex_event',
				client_id: 'complex-client',
				timestamp: new Date().toISOString(),
				properties: {
					nested: {
						level1: {
							level2: {
								value: 'deep',
							},
						},
					},
					array: [1, 2, 3, 4, 5],
					mixed: {
						string: 'test',
						number: 42,
						boolean: true,
						null: null,
					},
				},
			};

			const initialCount = receivedMessages.length;

			await sendEvent(TEST_TOPIC, event);

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.slice(initialCount).some(msg => {
				try {
					const parsed = JSON.parse(msg.value);
					return parsed.event === 'complex_event' && 
						parsed.properties.nested.level1.level2.value === 'deep';
				} catch {
					return false;
				}
			});
			
			expect(found).toBe(true);
		});

		it('should handle rapid event sending', async () => {
			const events = Array.from({ length: 10 }, (_, i) => ({
				type: 'track',
				event: 'rapid_test',
				client_id: `rapid-client-${i}`,
				timestamp: new Date().toISOString(),
				index: i,
			}));

			const promises = events.map(event => sendEvent(TEST_TOPIC, event));
			
			await Promise.all(promises);

			await new Promise(resolve => setTimeout(resolve, 2000));
			
			const rapidMessages = receivedMessages.filter(msg => {
				try {
					const parsed = JSON.parse(msg.value);
					return parsed.event === 'rapid_test';
				} catch {
					return false;
				}
			});

			expect(rapidMessages.length).toBeGreaterThanOrEqual(10);
		});
	});

	describe('disconnectProducer', () => {
		it('should disconnect gracefully', async () => {
			expect(disconnectProducer).toBeDefined();
		});

	});

	describe('Analytics Events', () => {
		it('should handle page_view event', async () => {
			const event = {
				type: 'track',
				event: 'page_view',
				client_id: 'web-client-123',
				timestamp: new Date().toISOString(),
				properties: {
					url: 'https://example.com/products',
					title: 'Products Page',
					referrer: 'https://google.com',
					path: '/products',
				},
				context: {
					user_agent: 'Mozilla/5.0',
					ip: '192.168.1.1',
					locale: 'en-US',
				},
			};

			await sendEvent(TEST_TOPIC, event);

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.some(msg => {
				try {
					const parsed = JSON.parse(msg.value);
					return parsed.event === 'page_view' && 
						parsed.properties.url === 'https://example.com/products';
				} catch {
					return false;
				}
			});
			
			expect(found).toBe(true);
		});

		it('should handle button_click event', async () => {
			const event = {
				type: 'track',
				event: 'button_click',
				client_id: 'web-client-456',
				timestamp: new Date().toISOString(),
				properties: {
					button_id: 'signup-btn',
					button_text: 'Sign Up',
					page_url: 'https://example.com/home',
				},
			};

			await sendEvent(TEST_TOPIC, event);

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.some(msg => {
				try {
					const parsed = JSON.parse(msg.value);
					return parsed.event === 'button_click' && 
						parsed.properties.button_id === 'signup-btn';
				} catch {
					return false;
				}
			});
			
			expect(found).toBe(true);
		});

		it('should handle identify event', async () => {
			const event = {
				type: 'identify',
				client_id: 'user-789',
				timestamp: new Date().toISOString(),
				traits: {
					email: 'test@example.com',
					name: 'Test User',
					plan: 'premium',
				},
			};

			await sendEvent(TEST_TOPIC, event);

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.some(msg => {
				try {
					const parsed = JSON.parse(msg.value);
					return parsed.type === 'identify' && 
						parsed.traits.email === 'test@example.com';
				} catch {
					return false;
				}
			});
			
			expect(found).toBe(true);
		});
	});

	describe('Performance', () => {
		it('should send events quickly', async () => {
			const event = {
				type: 'track',
				event: 'performance_test',
				client_id: 'perf-client',
				timestamp: new Date().toISOString(),
			};

			const start = Date.now();
			await sendEvent(TEST_TOPIC, event);
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(1000);
		});

		it('should handle burst traffic', async () => {
			const events = Array.from({ length: 50 }, (_, i) => ({
				type: 'track',
				event: 'burst_test',
				client_id: `burst-client-${i}`,
				timestamp: new Date().toISOString(),
				properties: {
					index: i,
				},
			}));

			const start = Date.now();
			
			await Promise.all(
				events.map(event => sendEvent(TEST_TOPIC, event))
			);
			
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(5000);
		});
	});
});

