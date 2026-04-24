import { describe, expect, it } from "bun:test";
import {
	AGENT_SQL_VALIDATION_ERROR,
	requiresTenantFilter,
	validateAgentSQL,
} from "./sql-validation";

describe("validateAgentSQL", () => {
	it("allows queries against analytics tables", () => {
		const result = validateAgentSQL(
			"SELECT count() FROM analytics.events WHERE client_id = {websiteId:String}"
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("allows queries with multiple analytics tables (JOIN)", () => {
		const result = validateAgentSQL(
			"SELECT e.path, v.metric_value FROM analytics.events e JOIN analytics.web_vitals_spans v ON e.session_id = v.session_id"
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("allows analytics.custom_events", () => {
		const result = validateAgentSQL(
			"SELECT event_name, count() FROM analytics.custom_events WHERE owner_id = {websiteId:String}"
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("rejects queries against non-analytics tables", () => {
		const result = validateAgentSQL(
			"SELECT * FROM public.users WHERE id = 1"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("public.users");
	});

	it("rejects when any table is outside analytics", () => {
		const result = validateAgentSQL(
			"SELECT * FROM analytics.events e JOIN system.tables t ON 1=1"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("system.tables");
	});

	it("handles backtick-quoted table names", () => {
		const result = validateAgentSQL(
			"SELECT * FROM `analytics.events` WHERE client_id = {websiteId:String}"
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("handles double-quoted table names", () => {
		const result = validateAgentSQL(
			'SELECT * FROM "analytics.events" WHERE client_id = {websiteId:String}'
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("is case-insensitive for FROM/JOIN keywords", () => {
		const result = validateAgentSQL(
			"select count() from analytics.events where client_id = {websiteId:String}"
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("rejects case-varied non-analytics tables", () => {
		const result = validateAgentSQL("SELECT * FROM System.Tables");
		expect(result.valid).toBe(false);
	});

	it("rejects queries with no table references", () => {
		const result = validateAgentSQL("SELECT 1 + 1");
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("allowed analytics table");
	});

	it("validates WITH/CTE queries", () => {
		const result = validateAgentSQL(
			"WITH cte AS (SELECT * FROM analytics.events) SELECT * FROM cte"
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("rejects ClickHouse table functions", () => {
		const result = validateAgentSQL(
			"SELECT * FROM url({endpoint:String}, CSV, 'client_id String') WHERE client_id = {websiteId:String}"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("Table function");
	});

	it("rejects unqualified tables", () => {
		const result = validateAgentSQL(
			"SELECT * FROM events WHERE client_id = {websiteId:String}"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("explicit database prefix");
	});

	it("rejects non-read statements", () => {
		const result = validateAgentSQL(
			"INSERT INTO analytics.events SELECT * FROM analytics.events"
		);
		expect(result.valid).toBe(false);
	});

	it("rejects multiple statements", () => {
		const result = validateAgentSQL(
			"SELECT * FROM analytics.events WHERE client_id = {websiteId:String}; SELECT * FROM analytics.events"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("Multiple statements");
	});

	it("exports the validation error constant", () => {
		expect(AGENT_SQL_VALIDATION_ERROR).toContain("security validation");
	});
});

describe("requiresTenantFilter", () => {
	it("returns true for standard tenant filter", () => {
		expect(
			requiresTenantFilter(
				"SELECT * FROM analytics.events WHERE client_id = {websiteId:String}"
			)
		).toBe(true);
	});

	it("allows natural whitespace variations", () => {
		expect(
			requiresTenantFilter("WHERE client_id = {websiteId: String}")
		).toBe(true);
	});

	it("is case-insensitive", () => {
		expect(
			requiresTenantFilter("WHERE CLIENT_ID = {websiteId:string}")
		).toBe(true);
	});

	it("returns false when tenant filter is missing", () => {
		expect(
			requiresTenantFilter("SELECT * FROM analytics.events WHERE time > now()")
		).toBe(false);
	});

	it("returns false for wrong parameter name", () => {
		expect(
			requiresTenantFilter("WHERE client_id = {siteId:String}")
		).toBe(false);
	});

	it("returns false for wrong column name", () => {
		expect(
			requiresTenantFilter("WHERE user_id = {websiteId:String}")
		).toBe(false);
	});

	it("ignores tenant markers inside comments", () => {
		expect(
			requiresTenantFilter(
				"SELECT * FROM analytics.events /* client_id = {websiteId:String} */"
			)
		).toBe(false);
	});

	it("ignores tenant markers inside string literals", () => {
		expect(
			requiresTenantFilter(
				"SELECT 'client_id = {websiteId:String}' FROM analytics.events"
			)
		).toBe(false);
	});
});
