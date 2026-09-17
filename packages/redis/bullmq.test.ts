import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	getBullMQConnectionOptions,
	getBullMQWorkerConnectionOptions,
} from "./bullmq";

const originalEnv = process.env;

beforeEach(() => {
	process.env = {
		...originalEnv,
		SELFHOST: "false",
		REDIS_URL: "rediss://shared:secret@shared.test:6380/2",
		BULLMQ_REDIS_URL: "",
		INSIGHTS_BULLMQ_REDIS_URL: "",
	};
});

afterEach(() => {
	process.env = originalEnv;
});

describe("BullMQ connection options", () => {
	it("requires BULLMQ_REDIS_URL", () => {
		delete process.env.BULLMQ_REDIS_URL;

		expect(() => getBullMQConnectionOptions()).toThrow(
			"BULLMQ_REDIS_URL environment variable is required"
		);
		expect(() => getBullMQWorkerConnectionOptions()).toThrow(
			"BULLMQ_REDIS_URL environment variable is required"
		);
	});

	it("uses the shared Redis URL for self-hosted producers and workers", () => {
		process.env.SELFHOST = " TRUE ";

		const connection = {
			host: "shared.test",
			port: 6380,
			username: "shared",
			password: "secret",
			db: 2,
			tls: {},
		};
		expect(getBullMQConnectionOptions({ envPrefix: "INSIGHTS" })).toEqual({
			...connection,
			maxRetriesPerRequest: 1,
		});
		expect(getBullMQWorkerConnectionOptions()).toEqual({
			...connection,
			maxRetriesPerRequest: null,
		});
	});

	it("still requires a Redis URL when self-hosting", () => {
		process.env.SELFHOST = "true";
		process.env.REDIS_URL = " ";

		expect(() => getBullMQConnectionOptions()).toThrow();
	});

	it("parses redis URLs for queue producers", () => {
		process.env.BULLMQ_REDIS_URL = "redis://user:pass@example.test:6380/3";

		expect(getBullMQConnectionOptions()).toEqual({
			host: "example.test",
			port: 6380,
			username: "user",
			password: "pass",
			db: 3,
			maxRetriesPerRequest: 1,
		});
	});

	it("defaults to Redis port 6379 and omits empty auth fields", () => {
		process.env.BULLMQ_REDIS_URL = "redis://localhost";

		expect(getBullMQConnectionOptions()).toEqual({
			host: "localhost",
			port: 6379,
			username: undefined,
			password: undefined,
			db: undefined,
			maxRetriesPerRequest: 1,
		});
	});

	it("enables TLS for rediss URLs", () => {
		process.env.BULLMQ_REDIS_URL = "rediss://default:secret@redis.test:6379/2";

		expect(getBullMQConnectionOptions()).toEqual({
			host: "redis.test",
			port: 6379,
			username: "default",
			password: "secret",
			db: 2,
			tls: {},
			maxRetriesPerRequest: 1,
		});
	});

	it("uses persistent retry semantics for worker connections", () => {
		process.env.BULLMQ_REDIS_URL = "redis://localhost:6379";

		expect(getBullMQWorkerConnectionOptions()).toEqual({
			host: "localhost",
			port: 6379,
			username: undefined,
			password: undefined,
			db: undefined,
			maxRetriesPerRequest: null,
		});
	});

	it("prefers a queue-specific Redis URL when an env prefix is provided", () => {
		process.env.SELFHOST = "true";
		process.env.BULLMQ_REDIS_URL = "redis://default.test:6379/0";
		process.env.INSIGHTS_BULLMQ_REDIS_URL =
			"redis://insights:secret@insights.test:6380/5";

		expect(getBullMQConnectionOptions({ envPrefix: "INSIGHTS" })).toEqual({
			host: "insights.test",
			port: 6380,
			username: "insights",
			password: "secret",
			db: 5,
			maxRetriesPerRequest: 1,
		});
	});

	it("falls back to the default Redis URL when a prefixed URL is blank", () => {
		process.env.SELFHOST = "true";
		process.env.BULLMQ_REDIS_URL = "redis://default.test:6379/4";
		process.env.INSIGHTS_BULLMQ_REDIS_URL = "";

		expect(getBullMQConnectionOptions({ envPrefix: "INSIGHTS" })).toEqual({
			host: "default.test",
			port: 6379,
			username: undefined,
			password: undefined,
			db: 4,
			maxRetriesPerRequest: 1,
		});
	});
});
