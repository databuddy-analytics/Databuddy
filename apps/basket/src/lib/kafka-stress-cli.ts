#!/usr/bin/env bun

import { CompressionTypes, Kafka } from 'kafkajs';
import { randomUUID } from 'node:crypto';

const BROKER = process.env.KAFKA_BROKERS || 'localhost:9092';
const TEST_TOPIC = process.env.KAFKA_TEST_TOPIC || 'stress-test-events';

// CLI arguments
const args = process.argv.slice(2);
const config = {
	messagesPerSecond: Number.parseInt(args[0]) || 10000,
	durationSeconds: Number.parseInt(args[1]) || 10,
	batchSize: Number.parseInt(args[2]) || 500,
	numProducers: Number.parseInt(args[3]) || 1,
};

console.log('🔧 Configuration:');
console.log(`   Broker: ${BROKER}`);
console.log(`   Topic: ${TEST_TOPIC}`);
console.log(`   Messages/sec: ${config.messagesPerSecond}`);
console.log(`   Duration: ${config.durationSeconds}s`);
console.log(`   Batch size: ${config.batchSize}`);
console.log(`   Concurrent producers: ${config.numProducers}`);
console.log('');

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
 * Create a Kafka producer optimized for maximum throughput
 */
const createProducer = async () => {
	const kafka = new Kafka({
		clientId: `basket-stress-test-${randomUUID()}`,
		brokers: [BROKER],
	});

	const producer = kafka.producer({
		allowAutoTopicCreation: true,
		maxInFlightRequests: 5,
		idempotent: false,
	});

	await producer.connect();
	return producer;
};

/**
 * Send a batch of messages (fire-and-forget for maximum throughput)
 */
const sendBatch = (producer: any, batchSize: number, startIndex: number) => {
	const messages = [];
	for (let i = 0; i < batchSize; i++) {
		const event = generateEvent(startIndex + i);
		messages.push({
			key: event.client_id,
			value: JSON.stringify(event),
		});
	}

	return producer.send({
		topic: TEST_TOPIC,
		messages,
		compression: CompressionTypes.GZIP,
	});
};

/**
 * Run stress test for a single producer (fire-and-forget for max throughput)
 */
const runProducerStressTest = async (
	producerId: number,
	messagesPerProducer: number,
	targetMessagesPerSecond: number,
	durationSeconds: number
) => {
	const producer = await createProducer();
	console.log(`✅ Producer ${producerId} connected`);

	const batchSize = config.batchSize;
	const promises = [];

	// Fire off all batches as fast as possible (fire-and-forget)
	// No rate limiting - let Kafka handle the backpressure
	for (let i = 0; i < messagesPerProducer; i += batchSize) {
		const batchPromise = sendBatch(producer, batchSize, i);
		promises.push(batchPromise);
	}

	// Wait for all messages to be sent
	await Promise.all(promises);
	await producer.disconnect();

	return messagesPerProducer;
};

/**
 * Main stress test execution
 */
const runStressTest = async () => {
	const totalMessages =
		config.messagesPerSecond * config.durationSeconds * config.numProducers;
	const messagesPerProducer = Math.floor(totalMessages / config.numProducers);

	console.log('🚀 Starting Kafka/Redpanda stress test...');
	console.log(`📊 Total messages: ${totalMessages.toLocaleString()}`);
	console.log(`📦 Messages per producer: ${messagesPerProducer.toLocaleString()}`);
	console.log('');

	const startTime = Date.now();

	// Create progress tracker
	const progressInterval = setInterval(() => {
		const elapsed = (Date.now() - startTime) / 1000;
		console.log(`⏱️  Elapsed time: ${elapsed.toFixed(1)}s`);
	}, 2000);

	// Run all producers concurrently
	const producerTasks = Array.from({ length: config.numProducers }, (_, idx) =>
		runProducerStressTest(
			idx + 1,
			messagesPerProducer,
			config.messagesPerSecond,
			config.durationSeconds
		)
	);

	const results = await Promise.all(producerTasks);
	clearInterval(progressInterval);

	const endTime = Date.now();
	const duration = (endTime - startTime) / 1000;
	const totalSent = results.reduce((sum, count) => sum + count, 0);
	const actualThroughput = Math.floor(totalSent / duration);

	console.log('');
	console.log('📈 Results:');
	console.log(`   Total messages sent: ${totalSent.toLocaleString()}`);
	console.log(`   Duration: ${duration.toFixed(2)}s`);
	console.log(`   Throughput: ${actualThroughput.toLocaleString()} msg/sec`);
	console.log(
		`   Avg per producer: ${Math.floor(actualThroughput / config.numProducers).toLocaleString()} msg/sec`
	);
	console.log('');
	console.log('✅ Stress test completed successfully!');
};

// Handle graceful shutdown
process.on('SIGINT', () => {
	console.log('\n⚠️  Interrupted, shutting down...');
	process.exit(0);
});

process.on('SIGTERM', () => {
	console.log('\n⚠️  Terminated, shutting down...');
	process.exit(0);
});

// Run the stress test
runStressTest()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error('❌ Stress test failed:', error);
		process.exit(1);
	});

