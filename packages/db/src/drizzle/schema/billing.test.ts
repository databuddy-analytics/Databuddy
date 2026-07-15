import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
	autumnWebhookEvents,
	autumnWebhookStatusValues,
	usageAlertLog,
} from "./billing";

describe("Autumn webhook inbox schema", () => {
	test("stores leases, retry scheduling, and retained dead letters", () => {
		const config = getTableConfig(autumnWebhookEvents);
		expect(config.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining([
				"lease_token",
				"lease_expires_at",
				"next_attempt_at",
				"dead_lettered_at",
				"alerted_at",
			])
		);
		expect(autumnWebhookStatusValues).toEqual([
			"pending",
			"processing",
			"deferred",
			"completed",
			"dead_letter",
		]);
		expect(config.indexes.map((index) => index.config.name)).toEqual(
			expect.arrayContaining([
				"autumn_webhook_events_status_next_attempt_idx",
				"autumn_webhook_events_status_lease_idx",
				"autumn_webhook_events_status_dead_letter_idx",
			])
		);
	});
});

describe("usage alert log schema", () => {
	test("scopes cooldown history to an organization", () => {
		const config = getTableConfig(usageAlertLog);
		expect(config.columns.map((column) => column.name)).toContain(
			"organization_id"
		);
		expect(config.indexes.map((index) => index.config.name)).toContain(
			"usage_alert_log_org_user_feature_idx"
		);
		expect(config.foreignKeys.map((key) => key.getName())).toContain(
			"usage_alert_log_organization_id_fkey"
		);
	});
});
