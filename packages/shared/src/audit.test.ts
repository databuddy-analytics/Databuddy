import { describe, expect, test } from "bun:test";
import {
	auditTechnicalActionNames,
	getAuditActionLabel,
	getAuditTargetLabel,
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
