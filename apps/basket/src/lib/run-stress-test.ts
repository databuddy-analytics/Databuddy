#!/usr/bin/env bun

/**
 * Complete stress test runner with monitoring
 * This script demonstrates how to run a stress test while monitoring results
 */

import { spawn } from 'node:child_process';

const STRESS_TESTS = {
	light: { msg: 1000, duration: 10, batch: 100, producers: 1 },
	medium: { msg: 5000, duration: 10, batch: 250, producers: 1 },
	heavy: { msg: 10000, duration: 10, batch: 500, producers: 1 },
	extreme: { msg: 25000, duration: 10, batch: 1000, producers: 1 },
	burst: { msg: 50000, duration: 1, batch: 1000, producers: 1 },
	sustained: { msg: 10000, duration: 30, batch: 500, producers: 1 },
	concurrent: { msg: 5000, duration: 10, batch: 250, producers: 5 },
};

const args = process.argv.slice(2);
const testName = args[0] || 'medium';

if (!STRESS_TESTS[testName as keyof typeof STRESS_TESTS]) {
	console.error(`❌ Unknown test: ${testName}`);
	console.log('\nAvailable tests:');
	for (const [name, config] of Object.entries(STRESS_TESTS)) {
		console.log(
			`  ${name.padEnd(12)} - ${config.msg * config.producers} msg/sec for ${config.duration}s`
		);
	}
	process.exit(1);
}

const test = STRESS_TESTS[testName as keyof typeof STRESS_TESTS];

console.log('🚀 Kafka/Redpanda Stress Test Runner\n');
console.log(`Test: ${testName}`);
console.log(`Configuration:`);
console.log(`  Messages/sec:  ${test.msg * test.producers}`);
console.log(`  Duration:      ${test.duration}s`);
console.log(`  Batch size:    ${test.batch}`);
console.log(`  Producers:     ${test.producers}`);
console.log(`  Total msgs:    ${test.msg * test.duration * test.producers}`);
console.log('');

console.log('📊 Starting monitor in 2 seconds...');

// Wait for user to see the config
await new Promise((resolve) => setTimeout(resolve, 2000));

// Start the monitor
console.log('🔍 Starting monitor...');
const monitor = spawn(
	'bun',
	['run', 'src/lib/kafka-monitor.ts'],
	{
		stdio: 'inherit',
		cwd: import.meta.dir + '/../..',
	}
);

// Wait for monitor to initialize
await new Promise((resolve) => setTimeout(resolve, 3000));

// Run the stress test
console.log('💥 Starting stress test...\n');
const stressTest = spawn(
	'bun',
	[
		'run',
		'src/lib/kafka-stress-cli.ts',
		test.msg.toString(),
		test.duration.toString(),
		test.batch.toString(),
		test.producers.toString(),
	],
	{
		stdio: 'inherit',
		cwd: import.meta.dir + '/../..',
	}
);

// Handle stress test completion
stressTest.on('close', (code) => {
	console.log(`\n✅ Stress test completed with code: ${code}`);
	console.log('📊 Monitor is still running. Press Ctrl+C to stop.\n');
});

// Handle cleanup
process.on('SIGINT', () => {
	console.log('\n\n⚠️  Shutting down...');
	monitor.kill();
	stressTest.kill();
	process.exit(0);
});

process.on('SIGTERM', () => {
	console.log('\n\n⚠️  Terminating...');
	monitor.kill();
	stressTest.kill();
	process.exit(0);
});

