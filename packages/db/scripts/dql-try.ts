import { createClient } from "@clickhouse/client";
import {
	applyDqlAccess,
	createDqlClient,
	executeDqlQuery,
	type DqlParameterValue,
} from "../src/clickhouse/dql";

const ADMIN_URL =
	process.env.DQL_ADMIN_URL ?? "http://default:@localhost:8123/analytics";
const DQL_URL =
	process.env.CLICKHOUSE_DQL_URL ??
	"http://dql_user:databuddy_dql_dev_password@localhost:8123/analytics";
const DQL_PASSWORD = new URL(DQL_URL).password;
const IPV4_MAPPED_PREFIX = /^::ffff:/;

const args = process.argv.slice(2);
const flags = new Set<string>();
const positional: string[] = [];
let websiteArg = "";
let cursor = 0;
while (cursor < args.length) {
	const a = args[cursor];
	if (a === "--website") {
		cursor += 1;
		websiteArg = args[cursor] ?? "";
	} else if (a.startsWith("--")) {
		flags.add(a);
	} else {
		positional.push(a);
	}
	cursor += 1;
}

function websiteFromArgs(fallback: string): string {
	return websiteArg || fallback;
}

async function provision(): Promise<void> {
	const admin = createClient({ url: ADMIN_URL });
	const rs = await admin.query({
		query:
			"SELECT toString(address) FROM system.processes WHERE query_id = currentQueryID()",
		format: "TabSeparatedRaw",
	});
	const rawAddress = (await rs.text()).trim().replace(IPV4_MAPPED_PREFIX, "");
	const hosts = ["127.0.0.1", "::1"];
	if (rawAddress && !hosts.includes(rawAddress)) {
		hosts.push(rawAddress);
	}
	await applyDqlAccess(admin, { password: DQL_PASSWORD, hosts });
	await admin.close();
	console.info(
		`Provisioned dql_user on local ClickHouse (hosts: ${hosts.join(", ")}).`
	);
}

async function pickWebsite(): Promise<string> {
	const admin = createClient({ url: ADMIN_URL });
	const rs = await admin.query({
		query:
			"SELECT client_id FROM analytics.events GROUP BY client_id ORDER BY count() DESC LIMIT 1",
		format: "JSON",
	});
	const json = (await rs.json()) as { data: Array<{ client_id: string }> };
	await admin.close();
	return json.data[0]?.client_id ?? "";
}

const dqlClient = createDqlClient(DQL_URL);

interface RunResult {
	error?: string;
	label: string;
	ok: boolean;
	rows?: number;
	sample?: unknown;
	sql: string;
	stats?: unknown;
}

async function run(
	label: string,
	sql: string,
	website: string,
	params?: Record<string, DqlParameterValue>
): Promise<RunResult> {
	try {
		const res = await executeDqlQuery(
			{ sql, websiteId: website, params },
			dqlClient
		);
		return {
			label,
			sql,
			ok: true,
			rows: res.rows.length,
			sample: res.rows.slice(0, 2),
			stats: res.stats,
		};
	} catch (error) {
		return {
			label,
			sql,
			ok: false,
			error:
				error instanceof Error
					? `${error.name}: ${error.message}`
					: String(error),
		};
	}
}

async function single(website: string): Promise<void> {
	const sql = positional.join(" ");
	const res = await run("adhoc", sql, website);
	console.log(JSON.stringify(res, null, 2));
}

async function suite(website: string): Promise<void> {
	const secondSite = await (async () => {
		const admin = createClient({ url: ADMIN_URL });
		const rs = await admin.query({
			query:
				"SELECT client_id FROM analytics.events WHERE client_id != {w:String} GROUP BY client_id ORDER BY count() DESC LIMIT 1",
			format: "JSON",
			query_params: { w: website },
		});
		const j = (await rs.json()) as { data: Array<{ client_id: string }> };
		await admin.close();
		return j.data[0]?.client_id ?? "";
	})();

	const cases: [string, string, Record<string, DqlParameterValue>?][] = [
		[
			"basic select",
			"SELECT path, time FROM analytics.events ORDER BY time DESC LIMIT 3",
		],
		["count", "SELECT count() AS total FROM analytics.events"],
		[
			"uniq visitors",
			"SELECT uniq(anonymous_id) AS visitors FROM analytics.events",
		],
		[
			"group by path",
			"SELECT path, count() AS views FROM analytics.events GROUP BY path ORDER BY views DESC LIMIT 5",
		],
		[
			"having",
			"SELECT path, count() AS c FROM analytics.events GROUP BY path HAVING c > 1 ORDER BY c DESC LIMIT 5",
		],
		["distinct", "SELECT DISTINCT country FROM analytics.events LIMIT 10"],
		[
			"scalar param",
			"SELECT count() AS c FROM analytics.events WHERE country = {c:String}",
			{ c: "US" },
		],
		[
			"array param IN",
			"SELECT path, count() FROM analytics.events WHERE device_type IN {d:Array(String)} GROUP BY path LIMIT 5",
			{ d: ["desktop", "mobile"] },
		],
		[
			"date fns",
			"SELECT toStartOfHour(time) AS h, count() FROM analytics.events GROUP BY h ORDER BY h LIMIT 5",
		],
		[
			"datediff/now",
			"SELECT max(time) AS latest, now() AS server_now FROM analytics.events",
		],
		[
			"window fn",
			"SELECT path, count() AS c, row_number() OVER (ORDER BY count() DESC) AS rn FROM analytics.events GROUP BY path LIMIT 5",
		],
		[
			"cte",
			"WITH top AS (SELECT path, count() c FROM analytics.events GROUP BY path) SELECT * FROM top ORDER BY c DESC LIMIT 3",
		],
		[
			"subquery",
			"SELECT count() FROM (SELECT path FROM analytics.events GROUP BY path)",
		],
		[
			"self join",
			"SELECT a.path, count() FROM analytics.events a JOIN analytics.events b ON a.session_id = b.session_id GROUP BY a.path LIMIT 3",
		],
		[
			"all exposed cols",
			"SELECT time, path, event_name, anonymous_id, profile_id, session_id, referrer, browser_name, os_name, device_type, country, region, city, utm_source, utm_medium, utm_campaign, utm_term, utm_content, time_on_page, scroll_depth FROM analytics.events LIMIT 1",
		],
		[
			"string fn domain()",
			"SELECT domain(referrer) AS d, count() FROM analytics.events WHERE referrer IS NOT NULL GROUP BY d LIMIT 5",
		],
		[
			"sessions/bounce",
			"SELECT session_id, count() AS pages FROM analytics.events GROUP BY session_id ORDER BY pages DESC LIMIT 5",
		],
		[
			"avg time_on_page",
			"SELECT round(avg(time_on_page), 1) AS avg_tp FROM analytics.events WHERE time_on_page > 0",
		],
		[
			"quantile",
			"SELECT quantile(0.5)(scroll_depth) AS median_scroll FROM analytics.events WHERE scroll_depth > 0",
		],
		// --- multi-table surface (grants must exist; 0 rows is fine) ---
		[
			"custom_events + properties",
			"SELECT event_name, properties FROM analytics.custom_events LIMIT 2",
		],
		["revenue", "SELECT count() AS c FROM analytics.revenue"],
		["error_spans", "SELECT count() AS c FROM analytics.error_spans"],
		["web_vitals_spans", "SELECT count() AS c FROM analytics.web_vitals_spans"],
		["outgoing_links", "SELECT count() AS c FROM analytics.outgoing_links"],
		["blocked_traffic", "SELECT count() AS c FROM analytics.blocked_traffic"],
		// --- expected rejections / failures (probe the guardrails) ---
		[
			"REJECT: ungranted table daily_pageviews",
			"SELECT count() FROM analytics.daily_pageviews",
		],
		["REJECT: non-exposed col url", "SELECT url FROM analytics.events LIMIT 1"],
		[
			"REJECT: non-exposed col properties",
			"SELECT properties FROM analytics.events LIMIT 1",
		],
		["REJECT: system table", "SELECT name FROM system.tables LIMIT 1"],
		["REJECT: comment", "SELECT count() FROM analytics.events -- sneaky"],
		["REJECT: DDL", "INSERT INTO analytics.events (path) VALUES ('x')"],
		[
			"REJECT: getSetting tenant leak",
			"SELECT getSetting('SQL_databuddy_website_id')",
		],
		["REJECT: numbers() table fn", "SELECT * FROM numbers(5)"],
		[
			"tenant isolation (other site as param filter)",
			"SELECT count() AS c FROM analytics.events WHERE client_id = {other:String}",
			secondSite ? { other: secondSite } : { other: "none" },
		],
	];

	const results: RunResult[] = [];
	for (const [label, sql, params] of cases) {
		results.push(await run(label, sql, website, params));
	}

	console.log(`\nWebsite under test: ${website}`);
	console.log(`Second website (isolation probe): ${secondSite}\n`);
	for (const r of results) {
		const status = r.ok ? "OK " : "ERR";
		const detail = r.ok
			? `rows=${r.rows} read=${(r.stats as { rowsRead: number }).rowsRead}`
			: r.error;
		console.log(`[${status}] ${r.label} :: ${detail}`);
	}
	console.log("\n=== FULL JSON ===");
	console.log(JSON.stringify(results, null, 2));
}

async function main(): Promise<void> {
	if (flags.has("--provision")) {
		await provision();
	}
	const website = websiteFromArgs(await pickWebsite());
	if (!website) {
		throw new Error("No website with events found.");
	}
	if (flags.has("--suite")) {
		await suite(website);
	} else if (positional.length > 0) {
		await single(website);
	} else {
		console.log(
			"Usage: bun scripts/dql-try.ts [--provision] [--suite] [--website <id>] ['<SQL>']"
		);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
