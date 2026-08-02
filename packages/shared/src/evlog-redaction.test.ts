import { describe, expect, it } from "bun:test";
import {
	createDatabuddyEvlogEnv,
	databuddyEvlogRedactConfig,
	databuddyEvlogRedaction,
	resolveEvlogEnvironment,
	shouldRedactEvlog,
} from "./evlog-redaction";

function matchesSecretPattern(value: string) {
	return databuddyEvlogRedactConfig.patterns?.some((pattern) =>
		new RegExp(pattern.source, pattern.flags).test(value)
	);
}

describe("databuddy evlog redaction", () => {
	it("keeps local and test logs unredacted by default", () => {
		expect(databuddyEvlogRedaction).toBe(false);
	});

	it("redacts unless the runtime is explicitly local or test", () => {
		expect(shouldRedactEvlog({ NODE_ENV: "development" })).toBe(false);
		expect(shouldRedactEvlog({ NODE_ENV: "test" })).toBe(false);
		expect(shouldRedactEvlog({ NODE_ENV: "production" })).toBe(true);
		expect(shouldRedactEvlog({ RAILWAY_ENVIRONMENT_NAME: "staging" })).toBe(
			true
		);
		expect(shouldRedactEvlog({})).toBe(true);
	});

	it("resolves an explicit app environment before platform defaults", () => {
		expect(
			resolveEvlogEnvironment({
				APP_ENV: "staging",
				NODE_ENV: "production",
				RAILWAY_ENVIRONMENT_NAME: "production",
			})
		).toBe("staging");
		expect(resolveEvlogEnvironment({ NODE_ENV: "test" })).toBe("test");
		expect(resolveEvlogEnvironment({})).toBe("production");
	});

	it("preserves established platform precedence over Unkey", () => {
		expect(
			resolveEvlogEnvironment({
				RAILWAY_ENVIRONMENT_NAME: "staging",
				UNKEY_ENVIRONMENT_SLUG: "unkey-preview",
				VERCEL_ENV: "preview",
			})
		).toBe("staging");
		expect(
			resolveEvlogEnvironment({
				UNKEY_ENVIRONMENT_SLUG: "unkey-preview",
				VERCEL_ENV: "preview",
			})
		).toBe("preview");
	});

	it("adds deployment metadata to every service environment", () => {
		expect(
			createDatabuddyEvlogEnv("api", {
				APP_ENV: "staging",
				RAILWAY_GIT_COMMIT_SHA: "abc123",
				RAILWAY_REPLICA_REGION: "eu-central-1",
			})
		).toEqual({
			service: "api",
			environment: "staging",
			region: "eu-central-1",
			commitHash: "abc123",
		});
	});

	it("uses Unkey deployment context outside Railway", () => {
		expect(
			createDatabuddyEvlogEnv("links", {
				NODE_ENV: "production",
				UNKEY_ENVIRONMENT_SLUG: "preview",
				UNKEY_GIT_COMMIT_SHA: "def456",
				UNKEY_REGION: "aws::eu-central-1",
			})
		).toEqual({
			service: "links",
			environment: "preview",
			region: "aws::eu-central-1",
			commitHash: "def456",
		});
	});

	it("covers sensitive field names used across services", () => {
		expect(databuddyEvlogRedactConfig.paths).toContain("headers.authorization");
		expect(databuddyEvlogRedactConfig.paths).toContain("headers.cookie");
		expect(databuddyEvlogRedactConfig.paths).toContain("api_key");
		expect(databuddyEvlogRedactConfig.paths).toContain("keyHash");
		expect(databuddyEvlogRedactConfig.replacement).toBe("[REDACTED]");
	});

	it("matches Databuddy and common provider secrets in string values", () => {
		expect(
			matchesSecretPattern("Authorization: Bearer dbdy_123456789012345678901234")
		).toBe(true);
		expect(matchesSecretPattern("OPENAI_API_KEY=sk-svcacct-1234567890123456"))
			.toBe(true);
		expect(matchesSecretPattern("not-a-secret")).toBe(false);
	});
});
