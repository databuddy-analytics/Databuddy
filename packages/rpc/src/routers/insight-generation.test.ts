import { describe, expect, it } from "bun:test";

process.env.REDIS_URL ??= "redis://localhost:6379/1";
process.env.BULLMQ_REDIS_URL ??= process.env.REDIS_URL;
process.env.BETTER_AUTH_SECRET ??= "test-auth-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";

const { assertSingleActiveSlackBinding } = await import("./insight-generation");

describe("assertSingleActiveSlackBinding", () => {
	it("accepts exactly one binding", () => {
		expect(() => assertSingleActiveSlackBinding(1)).not.toThrow();
	});

	it("rejects missing and ambiguous bindings", () => {
		expect(() => assertSingleActiveSlackBinding(0)).toThrow(
			"Connect or use the Databuddy Slack app in this channel first"
		);
		expect(() => assertSingleActiveSlackBinding(2)).toThrow(
			"Multiple active Slack connections match this channel"
		);
	});
});
