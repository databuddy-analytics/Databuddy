import { describe, expect, test } from "bun:test";
import {
	AUDIT_REDACTED_VALUE,
	redactAuditChanges,
	redactAuditMetadata,
} from "./audit";

describe("audit write-time redaction", () => {
	const sensitiveFields = [
		"password",
		"secret",
		"token",
		"key",
		"apiKey",
		"api_key",
		"api-key",
		"accessToken",
		"access_token",
		"clientSecret",
		"webhook_secret",
		"authorization",
		"cookie",
		"passwordHash",
		"PASSWORD",
		"API_KEY",
		"APIKey",
	];

	const plainFields = [
		"name",
		"monkey",
		"keyboard",
		"keystone",
		"tokenizer",
		"secretary",
		"broken",
		"cookies",
		"donkey",
		"turkey_count",
	];

	for (const field of sensitiveFields) {
		test(`redacts change values for "${field}"`, () => {
			expect(
				redactAuditChanges({ [field]: { before: "old", after: "new" } })
			).toEqual({
				[field]: {
					before: AUDIT_REDACTED_VALUE,
					after: AUDIT_REDACTED_VALUE,
				},
			});
		});
	}

	for (const field of plainFields) {
		test(`keeps change values for "${field}"`, () => {
			expect(redactAuditChanges({ [field]: { after: "visible" } })).toEqual({
				[field]: { after: "visible" },
			});
		});
	}

	test("redacts only the sensitive fields in a mixed change set", () => {
		expect(
			redactAuditChanges({
				apiKey: { after: "secret-value" },
				name: { after: "Production" },
				password: { before: "old-password", after: "new-password" },
			})
		).toEqual({
			apiKey: { after: AUDIT_REDACTED_VALUE },
			name: { after: "Production" },
			password: {
				before: AUDIT_REDACTED_VALUE,
				after: AUDIT_REDACTED_VALUE,
			},
		});
	});

	test("omits undefined sides instead of inventing redacted values", () => {
		expect(
			redactAuditChanges({
				password: { after: "new-password" },
				token: { before: "old-token" },
			})
		).toEqual({
			password: { after: AUDIT_REDACTED_VALUE },
			token: { before: AUDIT_REDACTED_VALUE },
		});
	});

	test("redacts whole array values on sensitive fields", () => {
		expect(
			redactAuditChanges({ token: { after: ["a", "b"] } })
		).toEqual({ token: { after: AUDIT_REDACTED_VALUE } });
	});

	test("preserves non-string values on plain fields", () => {
		expect(
			redactAuditChanges({
				enabled: { before: false, after: true },
				limit: { after: 100 },
				scopes: { after: ["read", "write"] },
				removed: { after: null },
			})
		).toEqual({
			enabled: { before: false, after: true },
			limit: { after: 100 },
			scopes: { after: ["read", "write"] },
			removed: { after: null },
		});
	});

	test("returns empty objects for missing input", () => {
		expect(redactAuditChanges()).toEqual({});
		expect(redactAuditChanges(undefined)).toEqual({});
		expect(redactAuditMetadata()).toEqual({});
	});

	test("redacts sensitive metadata before persistence", () => {
		expect(
			redactAuditMetadata({
				requestId: "request_123",
				accessToken: "secret-token",
				ip: "203.0.113.10",
			})
		).toEqual({
			requestId: "request_123",
			accessToken: AUDIT_REDACTED_VALUE,
			ip: "203.0.113.10",
		});
	});
});
