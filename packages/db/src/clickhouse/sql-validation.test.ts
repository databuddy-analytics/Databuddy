import { describe, expect, it } from "bun:test";
import {
	AGENT_SQL_VALIDATION_ERROR,
	AGENT_TENANT_COLUMN_BY_TABLE,
	buildAdditionalTableFilters,
	extractAllowlistedTables,
	validateAgentSQL,
} from "./sql-validation";

const TENANT = "WHERE client_id = {websiteId:String}";

describe("validateAgentSQL", () => {
	it("allows queries against analytics tables", () => {
		const result = validateAgentSQL(
			`SELECT count() FROM analytics.events ${TENANT}`
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("allows explicit JOINs with per-alias tenant filter", () => {
		const result = validateAgentSQL(
			"SELECT e.path FROM analytics.events e JOIN analytics.web_vitals_spans v ON e.session_id = v.session_id WHERE e.client_id = {websiteId:String} AND v.client_id = {websiteId:String}"
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("rejects JOIN where one alias is missing the tenant filter", () => {
		const result = validateAgentSQL(
			`SELECT e.path FROM analytics.events e JOIN analytics.web_vitals_spans v ON e.session_id = v.session_id ${TENANT}`
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("alias");
	});

	it("accepts custom_events with owner_id tenant filter", () => {
		const result = validateAgentSQL(
			"SELECT event_name, count() FROM analytics.custom_events WHERE owner_id = {websiteId:String} GROUP BY event_name"
		);
		expect(result.valid).toBe(true);
	});

	it("rejects analytics.revenue filtered with client_id (silent-empty footgun)", () => {
		const result = validateAgentSQL(
			"SELECT provider, sum(amount) FROM analytics.revenue WHERE client_id = {websiteId:String} GROUP BY provider"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("owner_id");
		expect(result.reason).toContain("zero rows");
	});

	it("rejects analytics.custom_events filtered with client_id", () => {
		const result = validateAgentSQL(
			"SELECT event_name, count() FROM analytics.custom_events WHERE client_id = {websiteId:String} GROUP BY event_name"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("owner_id");
	});

	it("rejects analytics.events filtered with owner_id (wrong direction)", () => {
		const result = validateAgentSQL(
			"SELECT count() FROM analytics.events WHERE owner_id = {websiteId:String}"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("client_id");
	});

	it("accepts mixed-table JOIN when each alias uses its required tenant column", () => {
		const result = validateAgentSQL(
			"SELECT r.provider, count() FROM analytics.revenue r JOIN analytics.events e ON r.transaction_id = e.session_id WHERE r.owner_id = {websiteId:String} AND e.client_id = {websiteId:String} GROUP BY r.provider"
		);
		expect(result.valid).toBe(true);
	});

	it("rejects mixed-table JOIN when revenue alias uses client_id", () => {
		const result = validateAgentSQL(
			"SELECT r.provider, count() FROM analytics.revenue r JOIN analytics.events e ON r.transaction_id = e.session_id WHERE r.client_id = {websiteId:String} AND e.client_id = {websiteId:String} GROUP BY r.provider"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("owner_id");
	});

	it("rejects inline SETTINGS that could override server-side tenant filter", () => {
		const result = validateAgentSQL(
			`SELECT count() FROM analytics.events ${TENANT} SETTINGS additional_table_filters = {}`
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("blocked SQL keyword");
	});

	it("rejects inline SETTINGS even at the very end", () => {
		const result = validateAgentSQL(
			`WITH x AS (SELECT path FROM analytics.events ${TENANT}) SELECT * FROM x ${TENANT} SETTINGS max_threads = 1`
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("blocked SQL keyword");
	});

	it("buildAdditionalTableFilters emits a valid ClickHouse map literal", () => {
		const out = buildAdditionalTableFilters(
			["analytics.events", "analytics.error_spans"],
			"abc-123"
		);
		expect(out).toBe(
			"{'analytics.events':'client_id=''abc-123''','analytics.error_spans':'client_id=''abc-123'''}"
		);
	});

	it("buildAdditionalTableFilters escapes single quotes in websiteId", () => {
		const out = buildAdditionalTableFilters(["analytics.events"], "O'Brien");
		// each ' in the id becomes '''' (2-level escape: outer string + inner SQL)
		expect(out).toBe("{'analytics.events':'client_id=''O''''Brien'''}");
	});

	it("buildAdditionalTableFilters maps correct tenant columns and drops unknown tables", () => {
		const out = buildAdditionalTableFilters(
			["analytics.events", "analytics.custom_events", "analytics.unknown"],
			"abc"
		);
		expect(out).toBe(
			"{'analytics.events':'client_id=''abc''','analytics.custom_events':'owner_id=''abc'''}"
		);
	});

	it("extractAllowlistedTables returns only allowlisted analytics tables", () => {
		const out = extractAllowlistedTables(
			`WITH x AS (SELECT path FROM analytics.events ${TENANT}) SELECT * FROM x JOIN analytics.error_spans es ON 1=1 WHERE es.client_id = {websiteId:String} AND es.client_id = {websiteId:String}`
		);
		expect([...out].sort()).toEqual([
			"analytics.error_spans",
			"analytics.events",
		]);
	});

	it("AGENT_TENANT_COLUMN_BY_TABLE only covers vetted tables", () => {
		expect(AGENT_TENANT_COLUMN_BY_TABLE).toEqual({
			"analytics.events": "client_id",
			"analytics.error_spans": "client_id",
			"analytics.web_vitals_spans": "client_id",
			"analytics.outgoing_links": "client_id",
			"analytics.custom_events": "owner_id",
			"analytics.revenue": "owner_id",
			"analytics.blocked_traffic": "client_id",
		});
	});

	it("rejects queries against non-analytics tables", () => {
		const result = validateAgentSQL(
			`SELECT * FROM public.users ${TENANT}`
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("public.users");
	});

	it("rejects when any joined table is outside analytics", () => {
		const result = validateAgentSQL(
			`SELECT * FROM analytics.events e JOIN system.tables t ON 1=1 ${TENANT}`
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("system.tables");
	});

	it("handles backtick-quoted table names", () => {
		const result = validateAgentSQL(
			`SELECT * FROM \`analytics.events\` ${TENANT}`
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("handles double-quoted table names", () => {
		const result = validateAgentSQL(
			`SELECT * FROM "analytics.events" ${TENANT}`
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("is case-insensitive for FROM/JOIN keywords", () => {
		const result = validateAgentSQL(
			`select count() from analytics.events where client_id = {websiteId:String}`
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("rejects case-varied non-analytics tables", () => {
		const result = validateAgentSQL(`SELECT * FROM System.Tables ${TENANT}`);
		expect(result.valid).toBe(false);
	});

	it("rejects queries with no table references", () => {
		const result = validateAgentSQL("SELECT 1 + 1");
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("allowed analytics table");
	});

	it("validates WITH/CTE queries", () => {
		const result = validateAgentSQL(
			`WITH cte AS (SELECT path FROM analytics.events ${TENANT}) SELECT * FROM cte ${TENANT}`
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("rejects ClickHouse table functions", () => {
		const result = validateAgentSQL(
			`SELECT * FROM url({endpoint:String}, CSV, 'client_id String') ${TENANT}`
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("Table function");
	});

	it("rejects unqualified tables", () => {
		const result = validateAgentSQL(`SELECT * FROM events ${TENANT}`);
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
			`SELECT * FROM analytics.events ${TENANT}; SELECT * FROM analytics.events`
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("Multiple statements");
	});

	it("rejects qualified columns that don't exist on the aliased table", () => {
		const result = validateAgentSQL(
			"SELECT es.browser_name FROM analytics.error_spans es WHERE es.client_id = {websiteId:String}"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("browser_name");
		expect(result.reason).toContain("does not exist");
	});

	it("allows valid qualified columns", () => {
		const result = validateAgentSQL(
			"SELECT es.message, es.path FROM analytics.error_spans es WHERE es.client_id = {websiteId:String}"
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("allows columns from the correct table in a JOIN", () => {
		const result = validateAgentSQL(
			"SELECT e.browser_name, es.message FROM analytics.events e JOIN analytics.error_spans es ON e.session_id = es.session_id WHERE e.client_id = {websiteId:String} AND es.client_id = {websiteId:String}"
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("rejects cross-table column misuse in a JOIN", () => {
		const result = validateAgentSQL(
			"SELECT es.browser_name FROM analytics.events e JOIN analytics.error_spans es ON e.session_id = es.session_id WHERE e.client_id = {websiteId:String} AND es.client_id = {websiteId:String}"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("browser_name");
	});

	it("rejects the nonexistent pageview event name", () => {
		const result = validateAgentSQL(
			`SELECT count() FROM analytics.events WHERE client_id = {websiteId:String} AND event_name = 'pageview'`
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("screen_view");
	});

	it("exports the validation error constant", () => {
		expect(AGENT_SQL_VALIDATION_ERROR).toContain("security validation");
	});

	describe("tenant isolation", () => {
		it("rejects queries with no WHERE clause", () => {
			const result = validateAgentSQL(
				"SELECT path FROM analytics.events LIMIT 10"
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("WHERE clause");
		});

		it("rejects WHERE without tenant filter", () => {
			const result = validateAgentSQL(
				"SELECT * FROM analytics.events WHERE time > now()"
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("client_id");
		});

		it("rejects tenant filter nested in parentheses", () => {
			const result = validateAgentSQL(
				"SELECT * FROM analytics.events WHERE (client_id = {websiteId:String} OR 1=1)"
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("top level");
		});

		it("rejects top-level OR alongside tenant filter", () => {
			const result = validateAgentSQL(
				`SELECT * FROM analytics.events ${TENANT} OR 1=1`
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("OR");
		});

		it("allows OR nested inside parentheses", () => {
			const result = validateAgentSQL(
				`SELECT * FROM analytics.events ${TENANT} AND (path = '/' OR path = '/home')`
			);
			expect(result).toEqual({ valid: true, reason: null });
		});

		it("rejects every CTE missing the tenant filter", () => {
			const result = validateAgentSQL(
				`WITH a AS (SELECT path FROM analytics.events ${TENANT}), b AS (SELECT path FROM analytics.events WHERE 1=1) SELECT * FROM a ${TENANT}`
			);
			expect(result.valid).toBe(false);
		});

		it("ignores tenant markers inside comments", () => {
			const result = validateAgentSQL(
				"SELECT * FROM analytics.events /* client_id = {websiteId:String} */ WHERE time > now()"
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("client_id");
		});

		it("ignores tenant markers inside string literals", () => {
			const result = validateAgentSQL(
				"SELECT 'client_id = {websiteId:String}' FROM analytics.events WHERE time > now()"
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("client_id");
		});
	});

	describe("structural bypasses", () => {
		it("rejects UNION", () => {
			const result = validateAgentSQL(
				`SELECT path FROM analytics.events ${TENANT} UNION ALL SELECT path FROM analytics.events WHERE 1=1`
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("blocked");
		});

		it("rejects INTERSECT", () => {
			const result = validateAgentSQL(
				`SELECT path FROM analytics.events ${TENANT} INTERSECT SELECT path FROM analytics.events ${TENANT}`
			);
			expect(result.valid).toBe(false);
		});

		it("rejects INTO OUTFILE", () => {
			const result = validateAgentSQL(
				`SELECT * INTO OUTFILE '/tmp/x' FROM analytics.events ${TENANT}`
			);
			expect(result.valid).toBe(false);
		});

		it("rejects FORMAT", () => {
			const result = validateAgentSQL(
				`SELECT * FROM analytics.events ${TENANT} FORMAT CSV`
			);
			expect(result.valid).toBe(false);
		});

		it("rejects subqueries", () => {
			const result = validateAgentSQL(
				`SELECT path, (SELECT count() FROM analytics.events) AS total FROM analytics.events ${TENANT}`
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Subqueries");
		});

		it("rejects comma-separated joins", () => {
			const result = validateAgentSQL(
				`SELECT a.path FROM analytics.events a, analytics.error_spans b WHERE a.client_id = {websiteId:String}`
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Comma");
		});
	});
});
