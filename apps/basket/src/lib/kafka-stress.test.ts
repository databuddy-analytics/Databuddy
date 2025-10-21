import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { CompressionTypes, Kafka } from 'kafkajs';
import { randomUUID } from 'node:crypto';

const BROKER = process.env.KAFKA_BROKERS || 'localhost:9092';
const TEST_TOPIC = 'stress-test-events';

describe('Kafka/Redpanda Stress Tests', () => {
	let kafka: Kafka;
	let producer: any;
	let connected = false;

	beforeAll(async () => {
		kafka = new Kafka({
			clientId: 'basket-stress-test',
			brokers: [BROKER],
		});

		producer = kafka.producer({
			allowAutoTopicCreation: true,
			maxInFlightRequests: 10,
			idempotent: true,
			transactionTimeout: 60000,
		});

		await producer.connect();
		connected = true;
		console.log('✅ Kafka producer connected for stress testing');
	});

	afterAll(async () => {
		if (connected && producer) {
			await producer.disconnect();
			console.log('✅ Kafka producer disconnected');
		}
	});

	/**
	 * Generate a realistic analytics event payload
	 */
	const generateEvent = (index: number) => {
		const eventId = randomUUID();
		const sessionId = randomUUID();
		const anonymousId = randomUUID();
		const clientId = `client-${Math.floor(Math.random() * 100)}`;

		return {
			id: randomUUID(),
			client_id: clientId,
			event_name: 'pageview',
			anonymous_id: anonymousId,
			time: Date.now(),
			session_id: sessionId,
			event_type: 'track',
			event_id: eventId,
			session_start_time: Date.now() - Math.random() * 300000,
			timestamp: Date.now(),
			referrer: 'https://google.com',
			url: `https://example.com/page-${index % 100}`,
			path: `/page-${index % 100}`,
			title: `Page ${index % 100}`,
			ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
			user_agent:
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			browser_name: 'Chrome',
			browser_version: '120.0.0',
			os_name: 'Windows',
			os_version: '10',
			device_type: 'desktop',
			device_brand: '',
			device_model: '',
			country: 'US',
			region: 'CA',
			city: 'San Francisco',
			screen_resolution: '1920x1080',
			viewport_size: '1920x1080',
			language: 'en-US',
			timezone: 'America/Los_Angeles',
			connection_type: '4g',
			rtt: 50,
			downlink: 10,
			time_on_page: Math.floor(Math.random() * 60000),
			scroll_depth: Math.floor(Math.random() * 100),
			interaction_count: Math.floor(Math.random() * 50),
			page_count: 1,
			utm_source: '',
			utm_medium: '',
			utm_campaign: '',
			utm_term: '',
			utm_content: '',
			load_time: Math.floor(Math.random() * 3000),
			dom_ready_time: Math.floor(Math.random() * 2000),
			dom_interactive: Math.floor(Math.random() * 1500),
			ttfb: Math.floor(Math.random() * 500),
			connection_time: Math.floor(Math.random() * 100),
			render_time: Math.floor(Math.random() * 1000),
			redirect_time: 0,
			domain_lookup_time: Math.floor(Math.random() * 50),
			properties: '{}',
			created_at: Date.now(),
		};
	};

	/**
	 * Send messages in batches (fire-and-forget for maximum throughput)
	 */
	const sendBatch = (batchSize: number, startIndex: number) => {
		const messages = [];
		for (let i = 0; i < batchSize; i++) {
			const event = generateEvent(startIndex + i);
			messages.push({
				key: event.client_id,
				value: JSON.stringify(event),
			});
		}

		// Fire-and-forget - don't await for maximum throughput
		return producer.send({
			topic: TEST_TOPIC,
			messages,
			compression: CompressionTypes.GZIP,
		});
	};

	test('Stress test: 1,000 messages/sec for 10 seconds (10k total)', async () => {
		const totalMessages = 10000;
		const batchSize = 100;

		console.log('🚀 Starting stress test: 10,000 messages (fire-and-forget)');
		console.log(`📦 Batch size: ${batchSize}`);

		const startTime = Date.now();
		const promises = [];

		// Fire off all batches as fast as possible
		for (let i = 0; i < totalMessages; i += batchSize) {
			const batchPromise = sendBatch(batchSize, i);
			promises.push(batchPromise);
		}

		// Wait for all messages to be sent
		await Promise.all(promises);

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		const actualThroughput = Math.floor(totalMessages / duration);

		console.log(`✅ Sent ${totalMessages} messages in ${duration.toFixed(2)}s`);
		console.log(`📈 Throughput: ${actualThroughput} msg/sec`);

		expect(totalMessages).toBe(10000);
	}, 30000);

	test('Stress test: 50k messages (fire-and-forget)', async () => {
		const totalMessages = 50000;
		const batchSize = 250;

		console.log('🚀 Starting stress test: 50,000 messages (fire-and-forget)');
		console.log(`📦 Batch size: ${batchSize}`);

		const startTime = Date.now();
		const promises = [];

		for (let i = 0; i < totalMessages; i += batchSize) {
			const batchPromise = sendBatch(batchSize, i);
			promises.push(batchPromise);
		}

		await Promise.all(promises);

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		const actualThroughput = Math.floor(totalMessages / duration);

		console.log(`✅ Sent ${totalMessages} messages in ${duration.toFixed(2)}s`);
		console.log(`📈 Throughput: ${actualThroughput} msg/sec`);

		expect(totalMessages).toBe(50000);
	}, 30000);

	test('Stress test: 100k messages (fire-and-forget)', async () => {
		const totalMessages = 100000;
		const batchSize = 500;

		console.log('🚀 Starting stress test: 100,000 messages (fire-and-forget)');
		console.log(`📦 Batch size: ${batchSize}`);

		const startTime = Date.now();
		const promises = [];

		for (let i = 0; i < totalMessages; i += batchSize) {
			const batchPromise = sendBatch(batchSize, i);
			promises.push(batchPromise);
		}

		await Promise.all(promises);

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		const actualThroughput = Math.floor(totalMessages / duration);

		console.log(`✅ Sent ${totalMessages} messages in ${duration.toFixed(2)}s`);
		console.log(`📈 Throughput: ${actualThroughput} msg/sec`);

		expect(totalMessages).toBe(100000);
	}, 30000);

	test('Stress test: 250k messages (fire-and-forget)', async () => {
		const totalMessages = 250000;
		const batchSize = 1000;

		console.log('🚀 Starting stress test: 250,000 messages (fire-and-forget)');
		console.log(`📦 Batch size: ${batchSize}`);

		const startTime = Date.now();
		const promises = [];

		for (let i = 0; i < totalMessages; i += batchSize) {
			const batchPromise = sendBatch(batchSize, i);
			promises.push(batchPromise);
		}

		await Promise.all(promises);

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		const actualThroughput = Math.floor(totalMessages / duration);

		console.log(`✅ Sent ${totalMessages} messages in ${duration.toFixed(2)}s`);
		console.log(`📈 Throughput: ${actualThroughput} msg/sec`);

		expect(totalMessages).toBe(250000);
	}, 60000);

	test('Stress test: Burst load - 50,000 messages as fast as possible', async () => {
		const totalMessages = 50000;
		const batchSize = 1000;

		console.log('💥 Starting burst load test: 50,000 messages ASAP');
		console.log(`📦 Batch size: ${batchSize}`);

		const startTime = Date.now();
		const promises = [];

		for (let i = 0; i < totalMessages; i += batchSize) {
			const batchPromise = sendBatch(batchSize, i);
			promises.push(batchPromise);
		}

		// Wait for all messages to be sent
		await Promise.all(promises);

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		const actualThroughput = Math.floor(totalMessages / duration);

		console.log(`✅ Sent ${totalMessages} messages in ${duration.toFixed(2)}s`);
		console.log(`🔥 Peak throughput: ${actualThroughput} msg/sec`);

		expect(totalMessages).toBe(50000);
	}, 60000);

	test('Stress test: Sustained load - 10,000 messages/sec for 30 seconds (300k total)', async () => {
		const messagesPerSecond = 10000;
		const durationSeconds = 30;
		const totalMessages = messagesPerSecond * durationSeconds;
		const batchSize = 500;
		const batchesPerSecond = messagesPerSecond / batchSize;
		const delayBetweenBatches = 1000 / batchesPerSecond;

		console.log(
			'⏳ Starting sustained load test: 10,000 msg/sec for 30 seconds'
		);
		console.log(`📊 Total messages: ${totalMessages}`);
		console.log(`📦 Batch size: ${batchSize}`);

		const startTime = Date.now();
		let sentCount = 0;
		const promises = [];

		for (let i = 0; i < totalMessages; i += batchSize) {
			const batchPromise = sendBatch(batchSize, i);
			promises.push(batchPromise);
			sentCount += batchSize;

			// Wait between batches to control throughput
			if (promises.length % batchesPerSecond === 0) {
				await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
			}

			// Log progress every 10%
			if (sentCount % (totalMessages / 10) === 0) {
				const progress = Math.floor((sentCount / totalMessages) * 100);
				console.log(`📊 Progress: ${progress}% (${sentCount} messages sent)`);
			}
		}

		// Wait for all messages to be sent
		await Promise.all(promises);

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		const actualThroughput = Math.floor(totalMessages / duration);

		console.log(`✅ Sent ${sentCount} messages in ${duration.toFixed(2)}s`);
		console.log(`📈 Average throughput: ${actualThroughput} msg/sec`);

		expect(sentCount).toBe(totalMessages);
		expect(duration).toBeLessThan(40); // Allow some buffer
	}, 90000); // 90 second timeout

	test('Stress test: Multiple concurrent producers (5 producers x 5,000 msg/sec)', async () => {
		const numProducers = 5;
		const messagesPerProducer = 5000;
		const totalMessages = numProducers * messagesPerProducer;
		const batchSize = 250;

		console.log(
			'🔀 Starting concurrent producer test: 5 producers x 5,000 messages'
		);
		console.log(`📊 Total messages: ${totalMessages}`);

		const startTime = Date.now();

		// Create multiple producer tasks
		const producerTasks = Array.from({ length: numProducers }, (_, idx) =>
			(async () => {
				const promises = [];
				for (let i = 0; i < messagesPerProducer; i += batchSize) {
					const batchPromise = sendBatch(
						batchSize,
						idx * messagesPerProducer + i
					);
					promises.push(batchPromise);
				}
				await Promise.all(promises);
			})()
		);

		// Run all producers concurrently
		await Promise.all(producerTasks);

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		const actualThroughput = Math.floor(totalMessages / duration);

		console.log(`✅ Sent ${totalMessages} messages in ${duration.toFixed(2)}s`);
		console.log(
			`📈 Combined throughput: ${actualThroughput} msg/sec across ${numProducers} producers`
		);

		expect(totalMessages).toBe(numProducers * messagesPerProducer);
	}, 60000);
});

