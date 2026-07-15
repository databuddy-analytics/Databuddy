import "@databuddy/test/env";
import { afterEach, describe, expect, it } from "bun:test";
import {
	isScheduledDispatchActive,
	isScheduledDispatchEnabled,
	scheduledDispatchOrganizations,
} from "./scheduler";

const original = process.env.INSIGHTS_SCHEDULED_DISPATCH_ENABLED;
const originalOrganizations =
	process.env.INSIGHTS_SCHEDULED_ORGANIZATION_IDS;

afterEach(() => {
	if (original === undefined) {
		delete process.env.INSIGHTS_SCHEDULED_DISPATCH_ENABLED;
	} else {
		process.env.INSIGHTS_SCHEDULED_DISPATCH_ENABLED = original;
	}
	if (originalOrganizations === undefined) {
		delete process.env.INSIGHTS_SCHEDULED_ORGANIZATION_IDS;
	} else {
		process.env.INSIGHTS_SCHEDULED_ORGANIZATION_IDS = originalOrganizations;
	}
});

describe("scheduled insights dispatch rollout", () => {
	it("reports the effective flag and canary state", () => {
		delete process.env.INSIGHTS_SCHEDULED_DISPATCH_ENABLED;
		delete process.env.INSIGHTS_SCHEDULED_ORGANIZATION_IDS;
		expect(isScheduledDispatchEnabled()).toBe(false);

		process.env.INSIGHTS_SCHEDULED_DISPATCH_ENABLED = "false";
		expect(isScheduledDispatchEnabled()).toBe(false);

		process.env.INSIGHTS_SCHEDULED_DISPATCH_ENABLED = "true";
		expect(isScheduledDispatchEnabled()).toBe(false);

		process.env.INSIGHTS_SCHEDULED_ORGANIZATION_IDS = "org-a, org-b, org-a";
		expect(isScheduledDispatchEnabled()).toBe(true);
		expect(scheduledDispatchOrganizations()).toEqual(["org-a", "org-b"]);

		process.env.INSIGHTS_SCHEDULED_ORGANIZATION_IDS = "*";
		expect(isScheduledDispatchEnabled()).toBe(true);
		expect(scheduledDispatchOrganizations()).toBeNull();
	});

	it("is inactive when the worker is disabled", () => {
		process.env.INSIGHTS_SCHEDULED_DISPATCH_ENABLED = "true";
		process.env.INSIGHTS_SCHEDULED_ORGANIZATION_IDS = "*";

		expect(isScheduledDispatchActive(false)).toBe(false);
		expect(isScheduledDispatchActive(true)).toBe(true);
	});
});
