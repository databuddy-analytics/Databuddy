import { describe, expect, it } from "bun:test";
import { mergeWebsiteSecuritySettings } from "./website-settings";

describe("mergeWebsiteSecuritySettings", () => {
	it("preserves current settings when the patch is empty", () => {
		const current = {
			allowedOrigins: ["test.databuddy.cc"],
			allowedIps: ["10.0.0.1"],
		};
		const result = mergeWebsiteSecuritySettings(current, {});
		expect(result).toEqual(current);
	});

	it("returns null when current is null and patch is empty", () => {
		expect(mergeWebsiteSecuritySettings(null, {})).toBeNull();
	});

	it("returns null when current is undefined and patch is empty", () => {
		expect(mergeWebsiteSecuritySettings(undefined, {})).toBeNull();
	});

	it("preserves IPs when only origins are updated", () => {
		expect(
			mergeWebsiteSecuritySettings(
				{ allowedIps: ["10.0.0.1"] },
				{ allowedOrigins: ["cal.com"] }
			)
		).toEqual({ allowedIps: ["10.0.0.1"], allowedOrigins: ["cal.com"] });
	});

	it("preserves origins when only IPs are updated", () => {
		expect(
			mergeWebsiteSecuritySettings(
				{ allowedOrigins: ["cal.com"] },
				{ allowedIps: ["10.0.0.1"] }
			)
		).toEqual({ allowedOrigins: ["cal.com"], allowedIps: ["10.0.0.1"] });
	});

	it("replaces a list when the patch supplies a new value", () => {
		expect(
			mergeWebsiteSecuritySettings(
				{ allowedOrigins: ["old.databuddy.cc"] },
				{ allowedOrigins: ["new.databuddy.cc"] }
			)
		).toEqual({ allowedOrigins: ["new.databuddy.cc"] });
	});

	it("clears a list when the patch sends an explicit empty array", () => {
		expect(
			mergeWebsiteSecuritySettings(
				{
					allowedIps: ["10.0.0.1"],
					allowedOrigins: ["test.databuddy.cc"],
				},
				{ allowedOrigins: [] }
			)
		).toEqual({ allowedIps: ["10.0.0.1"] });
	});

	it("returns null when both lists are cleared", () => {
		expect(
			mergeWebsiteSecuritySettings(
				{
					allowedIps: ["10.0.0.1"],
					allowedOrigins: ["test.databuddy.cc"],
				},
				{ allowedIps: [], allowedOrigins: [] }
			)
		).toBeNull();
	});

	it("treats explicit undefined fields as absent (no-op)", () => {
		const current = { allowedOrigins: ["cal.com"], allowedIps: ["10.0.0.1"] };
		expect(
			mergeWebsiteSecuritySettings(current, {
				allowedOrigins: undefined,
				allowedIps: undefined,
			})
		).toEqual(current);
	});

	it("updates one field while preserving the other across multiple merges", () => {
		const start = { allowedOrigins: ["cal.com"], allowedIps: ["10.0.0.1"] };
		const afterOrigins = mergeWebsiteSecuritySettings(start, {
			allowedOrigins: ["cal.com", "vercel.com"],
		});
		expect(afterOrigins).toEqual({
			allowedOrigins: ["cal.com", "vercel.com"],
			allowedIps: ["10.0.0.1"],
		});
		const afterIps = mergeWebsiteSecuritySettings(afterOrigins, {
			allowedIps: ["10.0.0.1", "10.0.0.2"],
		});
		expect(afterIps).toEqual({
			allowedOrigins: ["cal.com", "vercel.com"],
			allowedIps: ["10.0.0.1", "10.0.0.2"],
		});
	});

	it("preserves security settings when ignored tracking origins are updated", () => {
		expect(
			mergeWebsiteSecuritySettings(
				{ allowedOrigins: ["app.example.com"] },
				{ ignoredTrackingOrigins: ["staging.example.com"] }
			)
		).toEqual({
			allowedOrigins: ["app.example.com"],
			ignoredTrackingOrigins: ["staging.example.com"],
		});
	});

	it("stores disabled tracking issue warnings and clears false values", () => {
		expect(
			mergeWebsiteSecuritySettings(null, {
				trackingIssueWarningsDisabled: true,
			})
		).toEqual({ trackingIssueWarningsDisabled: true });

		expect(
			mergeWebsiteSecuritySettings(
				{ trackingIssueWarningsDisabled: true },
				{ trackingIssueWarningsDisabled: false }
			)
		).toBeNull();
	});
});
