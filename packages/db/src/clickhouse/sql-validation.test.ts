import { describe, expect, it } from "bun:test";
import {
	buildAdditionalTableFilters,
	extractAllowlistedTables,
	validateAgentSQL,
} from "./sql-validation";

const TENANT = "WHERE client_id = {websiteId:String}";
const ORG_TENANT =
	"(owner_id = {websiteId:String} OR website_id = {websiteId:String})";

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

	it("accepts custom_events with the builders' owner_id or website_id filter", () => {
		const result = validateAgentSQL(
			`SELECT event_name, count() FROM analytics.custom_events WHERE ${ORG_TENANT} GROUP BY event_name`
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("rejects analytics.revenue filtered with client_id", () => {
		const result = validateAgentSQL(
			"SELECT provider, sum(amount) FROM analytics.revenue WHERE client_id = {websiteId:String} GROUP BY provider"
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain(ORG_TENANT);
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

	it("accepts mixed-table JOIN when each alias uses its required tenant filter", () => {
		const result = validateAgentSQL(
			"SELECT r.provider, count() FROM analytics.revenue r JOIN analytics.events e ON r.transaction_id = e.session_id WHERE (r.website_id = {websiteId:String} OR r.owner_id = {websiteId:String}) AND e.client_id = {websiteId:String} GROUP BY r.provider"
		);
		expect(result).toEqual({ valid: true, reason: null });
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
			"{'analytics.events':'client_id = ''abc-123''','analytics.error_spans':'client_id = ''abc-123'''}"
		);
	});

	it("buildAdditionalTableFilters escapes single quotes in websiteId", () => {
		const out = buildAdditionalTableFilters(["analytics.events"], "O'Brien");
		expect(out).toBe("{'analytics.events':'client_id = ''O''''Brien'''}");
	});

	it("buildAdditionalTableFilters maps correct tenant columns and drops unknown tables", () => {
		const out = buildAdditionalTableFilters(
			[
				"analytics.events",
				"analytics.custom_events",
				"analytics.revenue",
				"analytics.unknown",
			],
			"abc"
		);
		expect(out).toBe(
			"{'analytics.events':'client_id = ''abc''','analytics.custom_events':'(owner_id = ''abc'' OR website_id = ''abc'')','analytics.revenue':'(owner_id = ''abc'' OR website_id = ''abc'')'}"
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

	it("rejects queries against non-analytics tables", () => {
		const result = validateAgentSQL(`SELECT * FROM public.users ${TENANT}`);
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
			`SELECT path FROM \`analytics.events\` ${TENANT}`
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("handles double-quoted table names", () => {
		const result = validateAgentSQL(
			`SELECT path FROM "analytics.events" ${TENANT}`
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	it("rejects a # comment that hides a second query from the validator", () => {
		const result = validateAgentSQL(
			`SELECT 'filtered' AS src, count() AS c FROM analytics.events
WHERE client_id = {websiteId:String} AND 1 = 1 # '
UNION ALL SELECT 'all_revenue' AS src, count() AS c FROM analytics.revenue -- '`
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("Comments are not allowed");
	});

	it("rejects every comment form ClickHouse accepts", () => {
		for (const comment of ["# note", "#! note", "-- note", "/* note */"]) {
			const result = validateAgentSQL(
				`SELECT count() FROM analytics.events ${TENANT} ${comment}`
			);
			expect(result.valid).toBe(false);
		}
	});

	it("rejects settings hidden behind a comment and quote", () => {
		const result = validateAgentSQL(
			`SELECT count() FROM analytics.events ${TENANT} # '
SETTINGS additional_table_filters = {} -- '`
		);
		expect(result.valid).toBe(false);
	});

	it("rejects quoted identifiers that could hide a quote", () => {
		for (const sql of [
			`SELECT count() AS \`a'b\` FROM analytics.events ${TENANT}`,
			`SELECT count() AS "a'b" FROM analytics.events ${TENANT}`,
			`SELECT count() AS \`unclosed FROM analytics.events ${TENANT}`,
		]) {
			expect(validateAgentSQL(sql).valid).toBe(false);
		}
	});

	it("rejects dollar-quoted strings and unterminated literals", () => {
		expect(
			validateAgentSQL(`SELECT $$x$$ FROM analytics.events ${TENANT}`).valid
		).toBe(false);
		expect(
			validateAgentSQL(
				`SELECT count() FROM analytics.events ${TENANT} AND path = '/a`
			).valid
		).toBe(false);
	});

	it("keeps comment and quote characters inside string literals", () => {
		const result = validateAgentSQL(
			`SELECT count() FROM analytics.events ${TENANT} AND path = '/a#b--c/*d$e"f''g\\'h'`
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
			`WITH cte AS (SELECT path FROM analytics.events ${TENANT}) SELECT path FROM cte ${TENANT}`
		);
		expect(result).toEqual({ valid: true, reason: null });
	});

	describe("projection safety", () => {
		it("rejects SELECT *", () => {
			const result = validateAgentSQL(
				`SELECT * FROM analytics.events ${TENANT}`
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Wildcard projections");
		});

		it("rejects SELECT DISTINCT *", () => {
			const result = validateAgentSQL(
				`SELECT DISTINCT * FROM analytics.events ${TENANT}`
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Wildcard projections");
		});

		it("rejects ClickHouse wildcard modifiers", () => {
			const result = validateAgentSQL(
				`SELECT * APPLY(toString) FROM analytics.events ${TENANT}`
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Wildcard projections");
		});

		it("rejects alias.*", () => {
			const result = validateAgentSQL(
				"SELECT e.* FROM analytics.events e WHERE e.client_id = {websiteId:String}"
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Wildcard projections");
		});

		for (const column of ["ip", "user_agent", "url"] as const) {
			it(`rejects unqualified ${column} projections`, () => {
				const result = validateAgentSQL(
					`SELECT ${column} FROM analytics.events ${TENANT}`
				);
				expect(result.valid).toBe(false);
				expect(result.reason).toContain(column);
			});
		}

		it.each([
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY url AS u`,
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY url u`,
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY "url" "u"`,
			`SELECT u, count() FROM analytics.events e ${TENANT} GROUP BY "e".\`url\` u`,
			"SELECT u FROM analytics.ai_traffic_spans a WHERE a.client_id = {websiteId:String} GROUP BY a.user_agent u",
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY toString(url) u`,
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY CAST(url AS String) u`,
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY CAST(url AS u AS String)`,
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY CAST(url AS u, 'String')`,
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY (url) u`,
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY url || '' u`,
			`SELECT u FROM analytics.events ${TENANT} AND notEmpty(url AS u)`,
			`SELECT u FROM analytics.events ${TENANT} AND notEmpty(url u)`,
			`SELECT u FROM analytics.events ${TENANT} AND notEmpty(CAST((url AS u) AS String))`,
			`SELECT u FROM analytics.events ${TENANT} AND notEmpty(CAST([url AS u] AS String))`,
			`SELECT u FROM analytics.events ${TENANT} ORDER BY user_agent AS u`,
			`SELECT u FROM analytics.events ${TENANT} ORDER BY concat(user_agent, '') u`,
			`SELECT m, count() FROM analytics.revenue WHERE ${ORG_TENANT} GROUP BY metadata AS m`,
			`SELECT m, count() FROM analytics.revenue WHERE ${ORG_TENANT} GROUP BY metadata m`,
			`SELECT p, count() FROM analytics.custom_events WHERE ${ORG_TENANT} GROUP BY properties p`,
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY ip u`,
			`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY url \`DESC\``,
			`SELECT \`END\`, count() FROM analytics.events ${TENANT} GROUP BY url END`,
			`SELECT \`CASE\`, count() FROM analytics.events ${TENANT} GROUP BY url CASE`,
			`SELECT \`WHEN\`, count() FROM analytics.events ${TENANT} GROUP BY url WHEN`,
			`SELECT \`THEN\`, count() FROM analytics.events ${TENANT} GROUP BY url THEN`,
			`SELECT \`BY\`, count() FROM analytics.events ${TENANT} GROUP BY url BY`,
			`SELECT \`OVER\`, count() FROM analytics.events ${TENANT} GROUP BY url OVER`,
			`SELECT u FROM analytics.events ${TENANT} ORDER BY row_number() OVER (PARTITION BY notEmpty(url u))`,
			`SELECT \`BY\` FROM analytics.events ${TENANT} ORDER BY row_number() OVER (PARTITION BY notEmpty(url BY))`,
			`SELECT u FROM analytics.events ${TENANT} WINDOW w AS (PARTITION BY notEmpty(url AS u)) ORDER BY row_number() OVER w`,
			`SELECT \`DISTINCT\` FROM analytics.events ${TENANT} GROUP BY (url DISTINCT)`,
			`SELECT \`IS\`, count() FROM analytics.events ${TENANT} GROUP BY url IS`,
			`SELECT \`END\` FROM analytics.events ${TENANT} AND CASE WHEN notEmpty(url END) THEN true ELSE false END`,
			`SELECT COLUMNS('^prop') FROM analytics.custom_events WHERE ${ORG_TENANT}`,
			`SELECT toJSONString(tuple(*)) FROM analytics.events ${TENANT}`,
		])("rejects protected columns reached through aliases or matchers: %s", (sql) => {
			expect(validateAgentSQL(sql).valid).toBe(false);
		});

		it.each([
			`SELECT count(*) FROM analytics.events ${TENANT} AND url LIKE '%pricing%'`,
			`SELECT path FROM analytics.events ${TENANT} AND toString(CAST(time AS Date)) = '2026-10-01'`,
			`SELECT path FROM analytics.events ${TENANT} AND CAST(time AS Nullable(Date)) IS NOT NULL`,
			`SELECT path FROM analytics.events ${TENANT} AND CAST((path, path) AS Tuple(first String, second String)).first = '/pricing'`,
			`SELECT path FROM analytics.events ${TENANT} AND path IS NOT DISTINCT FROM '/pricing'`,
			`SELECT path FROM analytics.events ${TENANT} AND path IN ('url', 'AS') AND time BETWEEN now() - INTERVAL 1 DAY AND now()`,
			`SELECT path FROM analytics.events ${TENANT} AND url REGEXP '^https:' AND time_on_page DIV 2 MOD 3 = 0`,
			`SELECT path FROM analytics.events ${TENANT} AND CASE WHEN url IS NULL THEN false ELSE notEmpty(url) END`,
			`SELECT path FROM analytics.events ${TENANT} AND CASE path WHEN '' THEN CASE WHEN url IS NULL THEN false ELSE notEmpty(url) END ELSE true END`,
			`SELECT count() FROM analytics.events ${TENANT} ORDER BY url DESC NULLS LAST`,
			`SELECT count() FROM analytics.events ${TENANT} ORDER BY url ASC NULLS FIRST, path COLLATE 'en'`,
			`SELECT path, count() FROM analytics.events ${TENANT} GROUP BY path WITH TOTALS ORDER BY path WITH FILL`,
			`SELECT path, count() FROM analytics.events ${TENANT} GROUP BY path HAVING count(DISTINCT path) > 1`,
			`SELECT path FROM analytics.events ${TENANT} ORDER BY row_number() OVER (PARTITION BY path ORDER BY time)`,
			`SELECT path FROM analytics.events ${TENANT} ORDER BY sum(time_on_page) OVER (PARTITION BY path ORDER BY time DESC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW)`,
			`SELECT path FROM analytics.events ${TENANT} WINDOW w AS (PARTITION BY path ORDER BY time RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) ORDER BY row_number() OVER w`,
			`WITH s AS (SELECT session_id AS sid FROM analytics.events ${TENANT}) SELECT e.path FROM analytics.events AS e JOIN s ON e.session_id = s.sid WHERE e.client_id = {websiteId:String}`,
			`WITH s AS (SELECT session_id sid FROM analytics.events ${TENANT}) SELECT e.path FROM analytics.events e JOIN s ON e.session_id = s.sid WHERE e.client_id = {websiteId:String}`,
		])("keeps filters, casts, table aliases and CTE aliases working: %s", (sql) => {
			expect(validateAgentSQL(sql)).toEqual({ valid: true, reason: null });
		});

		it("preserves wildcard guards with long whitespace", () => {
			const whitespace = "\t".repeat(12_000);
			for (const expression of [
				`count${whitespace}(*)`,
				`COUNT(${whitespace}*)`,
				`count(*${whitespace})`,
				"tuple(2 * 3)",
			]) {
				expect(
					validateAgentSQL(
						`SELECT ${expression} FROM analytics.events ${TENANT}`
					)
				).toEqual({ valid: true, reason: null });
			}
			for (const expression of [
				`tuple${whitespace}(*)`,
				`tuple(*${whitespace})`,
				`tuple(e.${whitespace}*)`,
				`count(e.${whitespace}*)`,
			]) {
				expect(
					validateAgentSQL(
						`SELECT ${expression} FROM analytics.events e WHERE e.client_id = {websiteId:String}`
					)
				).toEqual({
					valid: false,
					reason: "Wildcard arguments are not allowed; pass explicit columns.",
				});
			}
			expect(
				validateAgentSQL(
					`SELECT count() AS views ${whitespace} FROM analytics.events ${TENANT}`
				)
			).toEqual({ valid: true, reason: null });
			expect(
				validateAgentSQL(
					`SELECT u, count() FROM analytics.events ${TENANT} GROUP BY url${whitespace}u`
				).valid
			).toBe(false);
		});

		it("rejects raw custom-event properties projections", () => {
			const result = validateAgentSQL(
				`SELECT properties FROM analytics.custom_events WHERE ${ORG_TENANT}`
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("properties");
			expect(result.reason).toContain("sensitive");
		});

		it("rejects raw revenue metadata projections", () => {
			const result = validateAgentSQL(
				`SELECT transaction_id, metadata FROM analytics.revenue WHERE ${ORG_TENANT}`
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("metadata");
		});

		it("rejects scalar WITH aliases that hide protected columns", () => {
			for (const query of [
				`WITH metadata AS m SELECT m FROM analytics.revenue WHERE ${ORG_TENANT}`,
				`WITH url AS u SELECT u FROM analytics.events ${TENANT}`,
				`WITH properties AS p SELECT p FROM analytics.custom_events WHERE ${ORG_TENANT}`,
				`WITH safe AS (SELECT path FROM analytics.events ${TENANT}), url AS u SELECT u FROM analytics.events ${TENANT}`,
				`WITH hidden AS (WITH metadata AS m SELECT m FROM analytics.revenue WHERE ${ORG_TENANT}) SELECT m FROM hidden`,
				`WITH totals AS (SELECT path FROM analytics.events ${TENANT}), url AS u SELECT u FROM analytics.events ${TENANT}`,
				"WITH ties.properties AS p SELECT p FROM analytics.custom_events ties WHERE (ties.owner_id = {websiteId:String} OR ties.website_id = {websiteId:String})",
			]) {
				const result = validateAgentSQL(query);
				expect(result.valid).toBe(false);
				expect(result.reason).toContain("CTEs only");
			}
		});

		it("accepts WITH FILL, TOTALS, ROLLUP, CUBE and TIES modifiers", () => {
			for (const query of [
				`SELECT toDate(time) AS day, count() AS views FROM analytics.events ${TENANT} GROUP BY day ORDER BY day WITH FILL`,
				`SELECT path, count() AS views FROM analytics.events ${TENANT} GROUP BY path WITH TOTALS ORDER BY views DESC`,
				`WITH rolled AS (SELECT path, count() AS views FROM analytics.events ${TENANT} GROUP BY path WITH ROLLUP) SELECT path, views FROM rolled`,
				`SELECT path, browser_name, count() AS views FROM analytics.events ${TENANT} GROUP BY path, browser_name WITH CUBE`,
				`SELECT path, count() AS views FROM analytics.events ${TENANT} GROUP BY path ORDER BY views DESC LIMIT 10 WITH TIES`,
			]) {
				expect(validateAgentSQL(query)).toEqual({ valid: true, reason: null });
			}
		});

		it("keeps aggregate and JSON-field expressions in CTE SELECTs", () => {
			for (const query of [
				`WITH daily AS (SELECT JSONExtractString(path, 'section') AS section, count(*) AS views FROM analytics.events ${TENANT} GROUP BY section) SELECT section, sum(views) FROM daily GROUP BY section`,
				`WITH daily AS (WITH grouped AS (SELECT path, count(*) AS views FROM analytics.events ${TENANT} GROUP BY path) SELECT path, sum(views) AS views FROM grouped GROUP BY path) SELECT path, views FROM daily`,
			]) {
				expect(validateAgentSQL(query)).toEqual({ valid: true, reason: null });
			}
		});

		it("allows unqualified allowlisted columns and aggregates", () => {
			const result = validateAgentSQL(
				`SELECT path, browser_name, count(*) events FROM analytics.events ${TENANT} GROUP BY path, browser_name`
			);
			expect(result).toEqual({ valid: true, reason: null });
		});

		it("allows aggregate CTE projections", () => {
			const result = validateAgentSQL(
				`WITH daily AS (SELECT toDate(time) AS day, count(*) AS views FROM analytics.events ${TENANT} GROUP BY day) SELECT day, views FROM daily ${TENANT}`
			);
			expect(result).toEqual({ valid: true, reason: null });
		});
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
				`SELECT path FROM analytics.events ${TENANT} AND (path = '/' OR path = '/home')`
			);
			expect(result).toEqual({ valid: true, reason: null });
		});

		it("rejects every CTE missing the tenant filter", () => {
			const result = validateAgentSQL(
				`WITH a AS (SELECT path FROM analytics.events ${TENANT}), b AS (SELECT path FROM analytics.events WHERE 1=1) SELECT * FROM a ${TENANT}`
			);
			expect(result.valid).toBe(false);
		});

		it("rejects tenant markers inside comments", () => {
			const result = validateAgentSQL(
				"SELECT * FROM analytics.events /* client_id = {websiteId:String} */ WHERE time > now()"
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Comments are not allowed");
		});

		it("ignores tenant markers inside string literals", () => {
			const result = validateAgentSQL(
				"SELECT 'client_id = {websiteId:String}' FROM analytics.events WHERE time > now()"
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("client_id");
		});

		it("checks each CTE's tables against its own WHERE", () => {
			const result = validateAgentSQL(
				"WITH ev AS (SELECT event_name FROM analytics.custom_events WHERE owner_id = {websiteId:String}) SELECT event_name, count() FROM ev GROUP BY event_name"
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain(ORG_TENANT);
		});

		it("rejects a CTE that reads a table without a WHERE", () => {
			const result = validateAgentSQL(
				`WITH x AS (SELECT path FROM analytics.events) SELECT path FROM x ${TENANT}`
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("WHERE clause");
		});

		it("lets a WHERE that only reads CTEs skip the tenant filter", () => {
			const result = validateAgentSQL(
				`WITH daily AS (SELECT toDate(time) AS day, count() AS views FROM analytics.events ${TENANT} GROUP BY day) SELECT day, views FROM daily WHERE views > 10`
			);
			expect(result).toEqual({ valid: true, reason: null });
		});

		it("accepts a revenue CTE joined to events", () => {
			const result = validateAgentSQL(
				`WITH paid AS (SELECT anonymous_id FROM analytics.revenue WHERE ${ORG_TENANT} AND type != 'refund') SELECT e.path, count() FROM analytics.events e JOIN paid p ON e.anonymous_id = p.anonymous_id WHERE e.client_id = {websiteId:String} GROUP BY e.path`
			);
			expect(result).toEqual({ valid: true, reason: null });
		});
	});

	describe("org-keyed tables", () => {
		it("rejects tenant groups used as negated or computed expressions", () => {
			for (const where of [
				`NOT ${ORG_TENANT}`,
				`${ORG_TENANT} = 0`,
				`CASE WHEN ${ORG_TENANT} THEN 0 ELSE 1 END`,
				`type = 'sale' AND NOT ${ORG_TENANT}`,
				`type = 'sale' AND ${ORG_TENANT} = 0`,
			]) {
				const result = validateAgentSQL(
					`SELECT count() FROM analytics.revenue WHERE ${where}`
				);
				expect(result.valid).toBe(false);
				expect(result.reason).toContain("tenant filter");
			}
		});

		it("accepts positive tenant groups before or after other AND terms", () => {
			for (const where of [
				`${ORG_TENANT} AND type = 'sale'`,
				`type = 'sale' AND ${ORG_TENANT}`,
				`type = 'sale' AND ${ORG_TENANT} AND amount > 0`,
			]) {
				expect(
					validateAgentSQL(
						`SELECT count() FROM analytics.revenue WHERE ${where}`
					)
				).toEqual({ valid: true, reason: null });
			}
		});

		for (const table of ["analytics.custom_events", "analytics.revenue"]) {
			for (const column of ["owner_id", "website_id"]) {
				it(`rejects ${table} filtered on ${column} alone`, () => {
					const result = validateAgentSQL(
						`SELECT count() FROM ${table} WHERE ${column} = {websiteId:String}`
					);
					expect(result.valid).toBe(false);
					expect(result.reason).toContain(ORG_TENANT);
				});
			}
		}

		it("rejects a tenant group that is widened, nested, or split across aliases", () => {
			for (const where of [
				"(owner_id = {websiteId:String} OR website_id = {websiteId:String} OR 1=1)",
				"((owner_id = {websiteId:String} OR website_id = {websiteId:String}) OR 1=1)",
				"(owner_id = {websiteId:String} OR website_id = {otherSite:String})",
				"(c.owner_id = {websiteId:String} OR website_id = {websiteId:String})",
			]) {
				const result = validateAgentSQL(
					`SELECT count() FROM analytics.custom_events c WHERE ${where}`
				);
				expect(result.valid).toBe(false);
			}
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
				"SELECT a.path FROM analytics.events a, analytics.error_spans b WHERE a.client_id = {websiteId:String}"
			);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain("Comma");
		});
	});
});
