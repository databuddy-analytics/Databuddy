#!/usr/bin/env bun

import { Kafka } from 'kafkajs';

const BROKER = process.env.KAFKA_BROKERS || 'localhost:9092';
const TOPIC = process.env.KAFKA_TEST_TOPIC || 'stress-test-events';
const GROUP_ID = `monitor-${Date.now()}`;

console.log('📊 Kafka/Redpanda Stress Test Monitor');
console.log(`   Broker: ${BROKER}`);
console.log(`   Topic: ${TOPIC}`);
console.log('');

const kafka = new Kafka({
	clientId: 'basket-stress-monitor',
	brokers: [BROKER],
});

const consumer = kafka.consumer({
	groupId: GROUP_ID,
	sessionTimeout: 60000,
});

let messageCount = 0;
let startTime: number | null = null;
let lastUpdateTime = Date.now();
let lastCount = 0;
let minLatency = Number.POSITIVE_INFINITY;
let maxLatency = 0;
let totalLatency = 0;
let latencyCount = 0;

const printStats = () => {
	if (!startTime) return;

	const now = Date.now();
	const elapsed = (now - startTime) / 1000;
	const throughput = Math.floor(messageCount / elapsed);

	// Calculate current throughput (last second)
	const currentThroughput = messageCount - lastCount;
	lastCount = messageCount;
	lastUpdateTime = now;

	// Calculate average latency
	const avgLatency =
		latencyCount > 0 ? Math.floor(totalLatency / latencyCount) : 0;

	console.clear();
	console.log('📊 Real-time Kafka/Redpanda Monitor\n');
	console.log('┌─────────────────────────────────────────┐');
	console.log('│           Message Statistics            │');
	console.log('├─────────────────────────────────────────┤');
	console.log(`│ Total Messages:    ${messageCount.toString().padStart(16)} │`);
	console.log(`│ Duration:          ${elapsed.toFixed(1).padStart(11)}s │`);
	console.log(
		`│ Avg Throughput:    ${throughput.toString().padStart(10)} msg/s │`
	);
	console.log(
		`│ Current Rate:      ${currentThroughput.toString().padStart(10)} msg/s │`
	);
	console.log('├─────────────────────────────────────────┤');
	console.log('│            Latency Stats                │');
	console.log('├─────────────────────────────────────────┤');
	console.log(
		`│ Avg Latency:       ${avgLatency.toString().padStart(12)}ms │`
	);
	console.log(
		`│ Min Latency:       ${minLatency === Number.POSITIVE_INFINITY ? 'N/A'.padStart(12) : `${minLatency}ms`.padStart(12)} │`
	);
	console.log(`│ Max Latency:       ${maxLatency.toString().padStart(12)}ms │`);
	console.log('└─────────────────────────────────────────┘\n');

	// Progress bar
	const barWidth = 40;
	const progress = Math.min(messageCount / 1000, 100);
	const filled = Math.floor((progress / 100) * barWidth);
	const empty = barWidth - filled;
	const bar = '█'.repeat(filled) + '░'.repeat(empty);
	console.log(`Progress: [${bar}] ${Math.floor(progress)}%\n`);

	console.log('Press Ctrl+C to stop monitoring');
};

const run = async () => {
	await consumer.connect();
	console.log('✅ Connected to Kafka/Redpanda');

	await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
	console.log(`✅ Subscribed to topic: ${TOPIC}`);
	console.log('⏳ Waiting for messages...\n');

	// Update stats every second
	const statsInterval = setInterval(printStats, 1000);

	await consumer.run({
		eachMessage: async ({ message }) => {
			if (!startTime) {
				startTime = Date.now();
			}

			messageCount++;

			// Calculate latency (time from message creation to consumption)
			if (message.value) {
				try {
					const event = JSON.parse(message.value.toString());
					if (event.timestamp) {
						const latency = Date.now() - event.timestamp;
						if (latency < 10000) {
							// Ignore outliers > 10s
							minLatency = Math.min(minLatency, latency);
							maxLatency = Math.max(maxLatency, latency);
							totalLatency += latency;
							latencyCount++;
						}
					}
				} catch {
					// Ignore parse errors
				}
			}
		},
	});

	// Cleanup on exit
	process.on('SIGINT', async () => {
		console.log('\n\n⚠️  Stopping monitor...');
		clearInterval(statsInterval);
		await consumer.disconnect();
		console.log('✅ Disconnected');
		process.exit(0);
	});
};

run().catch((error) => {
	console.error('❌ Monitor error:', error);
	process.exit(1);
});

