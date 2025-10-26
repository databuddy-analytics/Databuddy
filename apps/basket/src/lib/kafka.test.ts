import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Kafka, type Consumer, type Producer } from 'kafkajs';

const KAFKA_BROKERS = process.env.KAFKA_BROKERS as string;
console.log('KAFKA_BROKERS', KAFKA_BROKERS);
const TEST_TOPIC = 'test';
const TEST_GROUP_ID = 'test-consumer-group';

describe('Kafka Producer and Consumer', () => {
	let kafka: Kafka;
	let producer: Producer;
	let consumer: Consumer;
	let receivedMessages: Array<{ value: string; key: string | null }> = [];

	beforeAll(async () => {
		kafka = new Kafka({
			clientId: 'basket-test',
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

		producer = kafka.producer();
		consumer = kafka.consumer({ 
			groupId: TEST_GROUP_ID,
			sessionTimeout: 10000,
			allowAutoTopicCreation: true,
			heartbeatInterval: 3000,
		});

		console.log('Connecting to Kafka...');
		await producer.connect();
		console.log('Producer connected');
		
		await consumer.connect();
		console.log('Consumer connected');
		
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

		console.log('Consumer subscribed and running');
		await new Promise(resolve => setTimeout(resolve, 2000));
	});

	afterAll(async () => {
		console.log('Disconnecting from Kafka...');
		await consumer.disconnect();
		await producer.disconnect();
		console.log('Disconnected');
	});

	describe('Connection', () => {
		it('should connect to Kafka brokers', () => {
			expect(producer).toBeDefined();
			expect(consumer).toBeDefined();
		});

		it('should be able to send and receive admin commands', async () => {
			const admin = kafka.admin();
			await admin.connect();
			
			const topics = await admin.listTopics();
			console.log('topics', topics);
			expect(Array.isArray(topics)).toBe(true);
			
			await admin.disconnect();
		});
	});

	describe('Producer', () => {
		it('should send a simple message to test topic', async () => {
			const testMessage = JSON.stringify({
				type: 'test',
				timestamp: new Date().toISOString(),
				data: { test: true },
			});

			await producer.send({
				topic: TEST_TOPIC,
				messages: [{ value: testMessage }],
			});

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.some(msg => msg.value === testMessage);
			expect(found).toBe(true);
		});

		it('should send message with key', async () => {
			const testKey = 'test-key-123';
			const testMessage = JSON.stringify({
				type: 'test-with-key',
				timestamp: new Date().toISOString(),
			});

			await producer.send({
				topic: TEST_TOPIC,
				messages: [{ 
					key: testKey,
					value: testMessage,
				}],
			});

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.some(
				msg => msg.key === testKey && msg.value === testMessage
			);
			expect(found).toBe(true);
		});

		it('should send multiple messages in batch', async () => {
			const messages = Array.from({ length: 5 }, (_, i) => ({
				value: JSON.stringify({
					type: 'batch-test',
					index: i,
					timestamp: new Date().toISOString(),
				}),
			}));

			const initialCount = receivedMessages.length;

			await producer.send({
				topic: TEST_TOPIC,
				messages,
			});

			await new Promise(resolve => setTimeout(resolve, 2000));
			
			const newMessages = receivedMessages.slice(initialCount);
			const batchMessages = newMessages.filter(msg => {
				try {
					const parsed = JSON.parse(msg.value);
					return parsed.type === 'batch-test';
				} catch {
					return false;
				}
			});

			expect(batchMessages.length).toBeGreaterThanOrEqual(5);
		});

		it('should handle large messages', async () => {
			const largeData = {
				type: 'large-test',
				data: Array.from({ length: 100 }, (_, i) => ({
					id: i,
					value: `value-${i}`,
					nested: {
						field1: `field1-${i}`,
						field2: `field2-${i}`,
						array: Array.from({ length: 10 }, (_, j) => j),
					},
				})),
			};

			const testMessage = JSON.stringify(largeData);
			const initialCount = receivedMessages.length;

			await producer.send({
				topic: TEST_TOPIC,
				messages: [{ value: testMessage }],
			});

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.slice(initialCount).some(
				msg => msg.value === testMessage
			);
			expect(found).toBe(true);
		});

		it('should send analytics event format', async () => {
			const analyticsEvent = {
				type: 'track',
				event: 'page_view',
				client_id: 'test-client-123',
				timestamp: new Date().toISOString(),
				properties: {
					url: 'https://example.com/test',
					title: 'Test Page',
					referrer: 'https://google.com',
				},
				context: {
					user_agent: 'Mozilla/5.0',
					ip: '127.0.0.1',
				},
			};

			const testMessage = JSON.stringify(analyticsEvent);
			const initialCount = receivedMessages.length;

			await producer.send({
				topic: TEST_TOPIC,
				messages: [{ 
					key: analyticsEvent.client_id,
					value: testMessage,
				}],
			});

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.slice(initialCount).some(
				msg => msg.key === analyticsEvent.client_id && msg.value === testMessage
			);
			expect(found).toBe(true);
		});
	});

	describe('Consumer', () => {
		it('should receive messages from test topic', async () => {
			const messagesBefore = receivedMessages.length;
			
			const testMessage = JSON.stringify({
				type: 'consumer-test',
				timestamp: new Date().toISOString(),
			});

			await producer.send({
				topic: TEST_TOPIC,
				messages: [{ value: testMessage }],
			});

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			expect(receivedMessages.length).toBeGreaterThan(messagesBefore);
		});

		it('should parse JSON messages correctly', async () => {
			const testData = {
				type: 'json-parse-test',
				timestamp: new Date().toISOString(),
				nested: {
					field: 'value',
					number: 123,
				},
			};

			await producer.send({
				topic: TEST_TOPIC,
				messages: [{ value: JSON.stringify(testData) }],
			});

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const lastMessage = receivedMessages[receivedMessages.length - 1];
			const parsed = JSON.parse(lastMessage.value);
			
			expect(parsed.type).toBe('json-parse-test');
			expect(parsed.nested.field).toBe('value');
			expect(parsed.nested.number).toBe(123);
		});

		it('should handle messages with keys', async () => {
			const testKey = 'consumer-key-test';
			const testMessage = JSON.stringify({
				type: 'consumer-key-test',
				timestamp: new Date().toISOString(),
			});

			await producer.send({
				topic: TEST_TOPIC,
				messages: [{ 
					key: testKey,
					value: testMessage,
				}],
			});

			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const found = receivedMessages.some(
				msg => msg.key === testKey
			);
			expect(found).toBe(true);
		});
	});

	describe('Performance', () => {
		it('should handle rapid message sending', async () => {
			const start = Date.now();
			const messageCount = 20;
			
			const promises = Array.from({ length: messageCount }, (_, i) => 
				producer.send({
					topic: TEST_TOPIC,
					messages: [{
						value: JSON.stringify({
							type: 'performance-test',
							index: i,
							timestamp: new Date().toISOString(),
						}),
					}],
				})
			);

			await Promise.all(promises);
			const duration = Date.now() - start;
			
			expect(duration).toBeLessThan(5000);
		});

		it('should maintain order within partition', async () => {
			const testKey = 'order-test-key';
			const messages = Array.from({ length: 10 }, (_, i) => ({
				key: testKey,
				value: JSON.stringify({
					type: 'order-test',
					sequence: i,
					timestamp: new Date().toISOString(),
				}),
			}));

			const initialCount = receivedMessages.length;

			await producer.send({
				topic: TEST_TOPIC,
				messages,
			});

			await new Promise(resolve => setTimeout(resolve, 2000));
			
			const orderMessages = receivedMessages
				.slice(initialCount)
				.filter(msg => {
					try {
						const parsed = JSON.parse(msg.value);
						return parsed.type === 'order-test' && msg.key === testKey;
					} catch {
						return false;
					}
				})
				.map(msg => {
					const parsed = JSON.parse(msg.value);
					return parsed.sequence;
				});

			expect(orderMessages.length).toBeGreaterThanOrEqual(10);
			
			for (let i = 1; i < orderMessages.length; i++) {
				expect(orderMessages[i]).toBeGreaterThan(orderMessages[i - 1]);
			}
		});
	});

	describe('Error Handling', () => {
		it('should handle connection errors gracefully', async () => {
			const badKafka = new Kafka({
				clientId: 'bad-client',
				brokers: ['non-existent:9092'],
				retry: {
					initialRetryTime: 100,
					retries: 3,
				},
				connectionTimeout: 1000,
				requestTimeout: 1000,
			});

			const badProducer = badKafka.producer();
			
			await expect(
				badProducer.connect()
			).rejects.toThrow();
		});
	});

	describe('Topic Management', () => {
		it('should verify test topic exists', async () => {
			const admin = kafka.admin();
			await admin.connect();
			
			const topics = await admin.listTopics();
			expect(topics).toContain(TEST_TOPIC);
			
			await admin.disconnect();
		});

		it('should get topic metadata', async () => {
			const admin = kafka.admin();
			await admin.connect();
			
			const metadata = await admin.fetchTopicMetadata({ 
				topics: [TEST_TOPIC],
			});
			
			expect(metadata.topics).toHaveLength(1);
			expect(metadata.topics[0].name).toBe(TEST_TOPIC);
			
			await admin.disconnect();
		});
	});
});

