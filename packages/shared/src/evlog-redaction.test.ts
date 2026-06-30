import { describe, expect, it } from "bun:test";
import {
	databuddyEvlogRedactConfig,
	databuddyEvlogRedaction,
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
