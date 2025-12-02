/**
 * Quick test script for @databuddy/server-sdk
 * Run with: bun packages/server-sdk/test.ts
 */

import { Databuddy } from "./src";

const client = new Databuddy({
	clientId: "test-client-id",
	debug: true,
	// Disable features for quick testing
	retry: false,
	circuitBreaker: false,
	rateLimit: false,
	compression: false,
});

// Test 1: Track event
console.log("\n--- Test 1: Track event ---");
client.track("test_event", { foo: "bar", timestamp: Date.now() });

// Test 2: Track with object form
console.log("\n--- Test 2: Track with object ---");
client.track({
	name: "user_signup",
	properties: { plan: "pro", source: "test" },
});

// Test 3: Middleware
console.log("\n--- Test 3: Middleware ---");
client.use((event) => {
	console.log("Middleware saw event:", event.name);
	return { ...event, properties: { ...event.properties, enriched: true } };
});
client.track("middleware_test", {});

// Test 4: Global properties
console.log("\n--- Test 4: Global properties ---");
client.setGlobalProperties({ env: "test", version: "1.0.0" });
console.log("Global props:", client.getGlobalProperties());

// Test 5: Metrics
console.log("\n--- Test 5: Metrics ---");
console.log("Metrics:", client.getMetrics());

// Test 6: Flush (will fail without real API, but tests the flow)
console.log("\n--- Test 6: Flush ---");
client
	.flush()
	.then((result) => {
		console.log("Flush result:", result);
	})
	.catch((err) => {
		console.log("Flush error (expected without real API):", err.message);
	})
	.finally(async () => {
		// Test 7: Shutdown
		console.log("\n--- Test 7: Shutdown ---");
		await client.shutdown();
		console.log("Shutdown complete");

		console.log("\n✓ All tests completed");
	});
