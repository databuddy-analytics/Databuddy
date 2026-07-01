import { describe, expect, it } from "bun:test";
import {
	areSecuritySettingsEqual,
	createSecuritySettingsPayload,
	normalizeSecurityTag,
	readSecuritySettings,
} from "./security-settings";

describe("security settings helpers", () => {
	it("keeps empty arrays in the mutation payload so removals serialize", () => {
		expect(
			createSecuritySettingsPayload({
				allowedIps: [],
				allowedOrigins: [],
				ignoredTrackingOrigins: [],
				trackingIssueWarningsDisabled: false,
			})
		).toEqual({
			allowedIps: [],
			allowedOrigins: [],
			ignoredTrackingOrigins: [],
			trackingIssueWarningsDisabled: false,
		});
	});

	it("reads only string lists from stored website settings", () => {
		expect(
			readSecuritySettings({
				allowedIps: ["10.0.0.1", 42],
				allowedOrigins: ["cal.com", null],
				ignoredTrackingOrigins: ["staging.cal.com", false],
				trackingIssueWarningsDisabled: true,
			})
		).toEqual({
			allowedIps: ["10.0.0.1"],
			allowedOrigins: ["cal.com"],
			ignoredTrackingOrigins: ["staging.cal.com"],
			trackingIssueWarningsDisabled: true,
		});
	});

	it("detects exact draft changes", () => {
		expect(
			areSecuritySettingsEqual(
				{
					allowedIps: [],
					allowedOrigins: ["cal.com"],
					ignoredTrackingOrigins: [],
					trackingIssueWarningsDisabled: false,
				},
				{
					allowedIps: [],
					allowedOrigins: ["cal.com"],
					ignoredTrackingOrigins: [],
					trackingIssueWarningsDisabled: false,
				}
			)
		).toBe(true);

		expect(
			areSecuritySettingsEqual(
				{
					allowedIps: [],
					allowedOrigins: ["cal.com"],
					ignoredTrackingOrigins: [],
					trackingIssueWarningsDisabled: false,
				},
				{
					allowedIps: [],
					allowedOrigins: [],
					ignoredTrackingOrigins: [],
					trackingIssueWarningsDisabled: false,
				}
			)
		).toBe(false);
	});

	it("normalizes tags before validation and duplicate checks", () => {
		expect(normalizeSecurityTag("  *.Cal.COM  ")).toBe("*.cal.com");
	});
});
