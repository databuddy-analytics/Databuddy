import { describe, expect, test } from "bun:test";
import {
	AUDIT_REDACTED_VALUE,
	auditTechnicalActionNames,
	getAuditActionLabel,
	getAuditTargetLabel,
	redactAuditChanges,
	redactAuditMetadata,
} from "./audit";

describe("audit display vocabulary", () => {
	test("uses human-readable labels for known actions", () => {
		expect(getAuditActionLabel("api_key.deleted")).toBe("Deleted API key");
		expect(getAuditActionLabel("website.settings_updated")).toBe(
			"Updated website settings"
		);
	});

	test("has a deterministic fallback for new action names", () => {
		expect(getAuditActionLabel("monitor.paused")).toBe("Paused Monitor");
	});

	test("keeps technical actions available for an explicit forensic view", () => {
		expect(auditTechnicalActionNames).toContain("rpc.mutation");
		expect(getAuditTargetLabel("api_key")).toBe("API key");
	});
});

describe("audit write-time redaction", () => {
	test("redacts credential-shaped change fields, including camelCase names", () => {
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

	test("redacts sensitive metadata before persistence", () => {
		expect(
			redactAuditMetadata({
				requestId: "request_123",
				accessToken: "secret-token",
			})
		).toEqual({
			requestId: "request_123",
			accessToken: AUDIT_REDACTED_VALUE,
		});
	});
});
