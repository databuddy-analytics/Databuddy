import { describe, expect, test } from "bun:test";
import { DATABUNNY_USAGE } from "@databuddy/shared/billing";
import { render } from "react-email";
import { UsageAlertEmail } from "./usage-alert-email";
import {
	formatResetDate,
	formatUsageNumber,
	formatUsagePercentage,
} from "./usage-email-utils";
import { UsageLimitEmail } from "./usage-limit-email";

const FEATURE_COPY = {
	featureDescription: DATABUNNY_USAGE.description,
	featureName: DATABUNNY_USAGE.name,
	limitAmount: 350,
	nextResetAt: Date.UTC(2026, 7, 1),
	organizationName: "Acme",
	overageAllowed: false,
	pausedActivity: DATABUNNY_USAGE.pausedActivity,
	remainingAmount: 62,
	usageAmount: 288,
	usageUnit: DATABUNNY_USAGE.unit,
} as const;

describe("billing usage email copy", () => {
	test("rejects malformed usage values and invalid millisecond timestamps", () => {
		expect(formatUsageNumber(Number.NaN)).toBe("—");
		expect(formatUsageNumber(Number.POSITIVE_INFINITY)).toBe("—");
		expect(formatUsagePercentage(Number.NaN, 100)).toBe("—");
		expect(formatResetDate(Number.MAX_VALUE)).toBeUndefined();
		expect(formatResetDate(Date.UTC(2026, 7, 1))).toContain("2026");
		expect(formatResetDate(1_782_864_000)).toContain("1970");
	});

	test("explains Databunny usage with real values and no owner greeting", async () => {
		const text = await render(UsageAlertEmail(FEATURE_COPY), {
			plainText: true,
		});

		expect(text).toContain("288 of 350 usage units");
		expect(text).toContain("62 remain");
		expect(text).toContain("powers Databunny questions and AI analysis");
		expect(text).toContain("More complex work uses more of it");
		expect(text).not.toContain("agent credits");
		expect(text).not.toContain("Hi ");
	});

	test("hard-limit copy reflects the supplied availability instead of inventing grace", async () => {
		const text = await render(
			UsageLimitEmail({
				...FEATURE_COPY,
				isAvailable: false,
				limitType: "spend_limit",
				remainingAmount: 0,
				usageAmount: 350,
			}),
			{ plainText: true }
		);

		expect(text).toContain(
			"Access to Databunny questions and AI analysis is currently paused"
		);
		expect(text).toContain("350 of 350 usage units");
		expect(text).not.toContain("1.5x");
		expect(text).not.toContain("10,000");
	});
});
