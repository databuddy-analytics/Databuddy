import { password as bunPassword, randomUUIDv7 } from "bun";
import {
	ClickHouseError,
	createClient,
	type ClickHouseClient,
	type ResultSet,
} from "@clickhouse/client";
import { describe, expect, test } from "bun:test";
import {
	applyDqlAccess,
	buildDqlAccessStatements,
	createDqlClient,
	DQL_SCHEMA,
	DQL_TENANT_SETTING,
	dqlSettingsForWebsite,
	type DqlQueryClient,
	executeDqlQuery,
} from "./dql";
import { TABLE_COLUMNS } from "./schema/tables.generated";

describe("DQL ClickHouse access", () => {
	test("provisions one restricted user, role, policy, and column grant", () => {
		const statements = buildDqlAccessStatements({
			password: "local-test-password",
		});
		const sql = statements.join("\n");

		expect(sql).toContain("CREATE ROLE IF NOT EXISTS `dql_role`");
		expect(sql).toContain(
			"ALTER ROLE `dql_role` DROP ALL PROFILES DROP ALL SETTINGS"
		);
		const passwordHash = sql.match(
			/IDENTIFIED WITH bcrypt_hash BY '([^']+)'/
		)?.[1];
		expect(passwordHash).toStartWith("$2b$12$");
		expect(
			bunPassword.verifySync("local-test-password", passwordHash ?? "")
		).toBe(true);
		expect(sql).not.toContain("local-test-password");
		expect(sql).toContain(
			"GRANT `dql_role` TO `dql_user` WITH REPLACE OPTION"
		);
		expect(sql).toContain("REVOKE ALL FROM `dql_user`");
		expect(sql).toContain("REVOKE ALL FROM `dql_role`");
		expect(sql).toContain(
			"SETTINGS readonly = 0 MAX 1, allow_ddl = 0 READONLY"
		);
		expect(sql).toContain("allow_get_client_http_header = 0 READONLY");
		expect(sql).toContain("max_threads = 4 MIN 1 MAX 4");
		expect(sql).toContain(
			"max_concurrent_queries_for_user = 4 MIN 1 MAX 4"
		);
		expect(sql).toContain(
			`USING client_id = getSetting('${DQL_TENANT_SETTING}') AS RESTRICTIVE`
		);
		expect(sql).toContain("GRANT SELECT(");
		expect(sql).toContain("ON analytics.events TO `dql_role`");
		expect(sql).not.toContain("GRANT SELECT ON analytics.*");

		for (const column of DQL_SCHEMA[0].columns) {
			expect(sql).toContain(`\`${column.name}\``);
		}
		for (const hidden of [
			"client_id",
			"id",
			"ip",
			"properties",
			"url",
			"user_agent",
		]) {
			expect(sql).not.toContain(`\`${hidden}\``);
		}
	});

	test("keeps the catalog physical and rejects unsafe provisioning input", () => {
		const physicalColumns = new Set(TABLE_COLUMNS["analytics.events"]);
		expect(
			DQL_SCHEMA[0].columns.every((column) =>
				physicalColumns.has(column.name)
			)
		).toBe(true);
		expect(() =>
			buildDqlAccessStatements({
				hosts: ["0.0.0.0/0"],
				password: "test-password",
			})
		).toThrow("Invalid DQL host");
		expect(() =>
			buildDqlAccessStatements({
				hosts: ["api.internal"],
				password: "test-password",
			})
		).toThrow("Invalid DQL host");
		expect(() =>
			buildDqlAccessStatements({
				hosts: ["10.0.0.1/0"],
				password: "test-password",
			})
		).toThrow("Invalid DQL host");
	});

	test("reconciles access on the configured ClickHouse cluster", () => {
		const sql = buildDqlAccessStatements({
			cluster: "production",
			password: "test-password",
		}).join("\n");

		expect(sql).toContain(
			"CREATE ROLE IF NOT EXISTS `dql_role` ON CLUSTER `production`"
		);
		expect(sql).toContain(
			"GRANT ON CLUSTER `production` `dql_role` TO `dql_user`"
		);
		expect(sql).toContain(
			"CREATE ROW POLICY OR REPLACE `dql_events_website` ON CLUSTER `production` ON analytics.events"
		);
		expect(() =>
			buildDqlAccessStatements({
				cluster: "production; DROP USER default",
				password: "test-password",
			})
		).toThrow("Invalid DQL cluster");
	});
});

describe("DQL ClickHouse client", () => {
	test("requires a direct dedicated-user connection", async () => {
		for (const url of [
			undefined,
			"not-a-url",
			"http://default:admin@localhost:8123/databuddy_analytics",
			"http://dql_user:@localhost:8123/databuddy_analytics",
			"http://dql_user:password@localhost:8123/databuddy_analytics?user=default",
			"http://dql_user:password@clickhouse:8123/databuddy_analytics",
		]) {
			expect(() => createDqlClient(url)).toThrow();
		}

		const clients = [
			createDqlClient(
				"http://dql_user:password@localhost:8123/databuddy_analytics"
			),
			createDqlClient(
				"https://dql_user:password@clickhouse.example.com:8443/databuddy_analytics"
			),
		] as Array<DqlQueryClient & { close: () => Promise<void> }>;

		for (const client of clients) {
			await client.close();
		}
	});

	test("binds the tenant and readonly mode", () => {
		expect(dqlSettingsForWebsite("website-a")).toEqual({
			[DQL_TENANT_SETTING]: "website-a",
			readonly: 1,
		});
		expect(() => dqlSettingsForWebsite(" ")).toThrow(
			"authorized website identifier"
		);
	});

	test("passes SQL and typed parameters through and returns metadata", async () => {
		let captured: Parameters<DqlQueryClient["query"]>[0] | undefined;
		const client: DqlQueryClient = {
			query: async (options) => {
				captured = options;
				return {
					query_id: "transport-query-id",
					json: async () => ({
						data: [{ path: "/", views: "12" }],
						meta: [
							{ name: "path", type: "String" },
							{ name: "views", type: "UInt64" },
						],
						query_id: "response-query-id",
						statistics: {
							bytes_read: 2048,
							elapsed: 0.0124,
							rows_read: 99,
						},
					}),
				} as ResultSet<"JSON">;
			},
		};
		const sql =
			"SELECT path, count() AS views FROM analytics.events WHERE time >= {from:DateTime64(3)} GROUP BY path";

		const result = await executeDqlQuery(
			{
				sql,
				params: { from: "2026-07-01 00:00:00" },
				websiteId: "website-a",
			},
			client
		);

		expect(captured).toMatchObject({
			query: sql,
			query_params: { from: "2026-07-01 00:00:00" },
			format: "JSON",
			clickhouse_settings: {
				[DQL_TENANT_SETTING]: "website-a",
				readonly: 1,
			},
		});
		expect(result).toEqual({
			columns: [
				{ name: "path", type: "String" },
				{ name: "views", type: "UInt64" },
			],
			rows: [{ path: "/", views: "12" }],
			stats: {
				bytesRead: 2048,
				elapsedMs: 12,
				queryId: "response-query-id",
				rowCount: 1,
				rowsRead: 99,
			},
		});
	});

	test("sanitizes ClickHouse analysis errors", async () => {
		const client: DqlQueryClient = {
			query: async () => {
				throw new ClickHouseError({
					code: "47",
					message: "Internal schema and host details.",
					type: "UNKNOWN_IDENTIFIER",
				});
			},
		};

		await expect(
			executeDqlQuery(
				{
					sql: "SELECT missing_column FROM analytics.events",
					websiteId: "website-a",
				},
				client
			)
		).rejects.toThrow("DQL references an unknown or unavailable identifier.");
	});

	test("normalizes access failures without exposing hidden identifiers", async () => {
		const accessDenied = new ClickHouseError({
			code: "497",
			message: "Not enough privileges.",
			type: "ACCESS_DENIED",
		});
		const client: DqlQueryClient = {
			query: async () => {
				throw accessDenied;
			},
		};

		await expect(
			executeDqlQuery(
				{
					sql: "SELECT path FROM analytics.events",
					websiteId: "website-a",
				},
				client
			)
		).rejects.toThrow("unknown or unavailable identifier");
	});

	test("rejects writes and unpublished ClickHouse surfaces before execution", async () => {
		let calls = 0;
		const client: DqlQueryClient = {
			query: async () => {
				calls += 1;
				throw new Error("query should not execute");
			},
		};
		const rejected = [
			"INSERT INTO analytics.events (path) VALUES ('/')",
			"SELECT total_rows FROM system.tables",
			"SELECT * FROM {source:Identifier}",
			"SELECT * FROM merge({database:String}, {tables:String})",
			"SELECT * FROM mergeTreeIndex(analytics, events)",
			"SELECT getClientHTTPHeader('Authorization')",
			"SELECT path FROM analytics.events SETTINGS SQL_databuddy_website_id = 'other'",
			"SELECT total_rows FROM `syste\\x6d`.tables",
			'SELECT total_rows FROM "syste\\x6d".tables',
			"SELECT * FROM `numbe\\x72s`(1)",
			'SELECT * FROM "numbers"(1)',
			"SELECT count() FROM analytics.events AS e, numbers(10) AS n",
			"SELECT * FROM (SELECT path FROM analytics.events, numbers(10))",
		];

		for (const sql of rejected) {
			await expect(
				executeDqlQuery({ sql, websiteId: "website-a" }, client)
			).rejects.toThrow("published analytics surface");
		}
		expect(calls).toBe(0);
	});
});

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const LOCAL_CLICKHOUSE_URL =
	process.env.CLICKHOUSE_URL ??
	"http://default:@localhost:8123/databuddy_analytics";

function assertLocalTestTarget(rawUrl: string): void {
	const url = new URL(rawUrl);
	const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (
		url.protocol !== "http:" ||
		!["localhost", "127.0.0.1", "::1"].includes(hostname)
	) {
		throw new Error(
			"DQL security integration tests only run against loopback ClickHouse."
		);
	}
}

function eventFixture(websiteId: string, path: string) {
	const id = randomUUIDv7();
	const time = "2026-07-23 12:00:00.000";
	return {
		anonymous_id: `anonymous-${id}`,
		client_id: websiteId,
		created_at: time,
		event_name: "screen_view",
		id,
		ip: "127.0.0.1",
		path,
		properties: "{}",
		referrer: null,
		session_id: `session-${id}`,
		time,
		url: `https://dql.test${path}`,
		user_agent: "DQL integration test",
	};
}

async function currentClientAddress(admin: ClickHouseClient): Promise<string> {
	const result = await admin.query({
		format: "TabSeparatedRaw",
		query:
			"SELECT toString(address) FROM system.processes WHERE query_id = currentQueryID()",
	});
	const address = (await result.text()).trim();
	if (!address) {
		throw new Error("ClickHouse did not report the integration client address.");
	}
	return address;
}

describeIntegration("DQL database boundary", () => {
	test(
		"isolates tenants and denies bypasses",
		{ timeout: 30_000 },
		async () => {
			assertLocalTestTarget(LOCAL_CLICKHOUSE_URL);
			const suffix = randomUUIDv7().replaceAll("-", "");
			const websiteA = `dql-site-a-${suffix}`;
			const websiteB = `dql-site-b-${suffix}`;
			const pathA = `/dql-a-${suffix}`;
			const pathB = `/dql-b-${suffix}`;
			const user = `dql_test_user_${suffix}`;
			const role = `dql_test_role_${suffix}`;
			const backdoorRole = `dql_test_backdoor_${suffix}`;
			const policyPrefix = `dql_test_${suffix}`;
			const policy = `${policyPrefix}_events_website`;
			const password = `dql-test-${suffix}`;
			const admin = createClient({ url: LOCAL_CLICKHOUSE_URL });
			const allowedHost = await currentClientAddress(admin);
			const dqlUrl = new URL(LOCAL_CLICKHOUSE_URL);
			dqlUrl.username = user;
			dqlUrl.password = password;
			const rawDqlClient = createClient({
				compression: { request: true, response: false },
				url: dqlUrl.toString(),
			});
			const dqlClient = rawDqlClient as unknown as DqlQueryClient;

			try {
				await admin.insert({
					columns: [
						"id",
						"client_id",
						"event_name",
						"anonymous_id",
						"time",
						"session_id",
						"referrer",
						"url",
						"path",
						"ip",
						"user_agent",
						"properties",
						"created_at",
					],
					format: "JSONEachRow",
					table: "analytics.events",
					values: [
						eventFixture(websiteA, pathA),
						eventFixture(websiteB, pathB),
					],
				});
				await applyDqlAccess(admin, {
					hosts: [allowedHost],
					password,
					policyPrefix,
					role,
					user,
				});

				await admin.command({ query: `CREATE ROLE \`${backdoorRole}\`` });
				await admin.command({
					query: `GRANT SELECT(query) ON system.query_log TO \`${backdoorRole}\``,
				});
				await admin.command({
					query: `GRANT \`${backdoorRole}\` TO \`${user}\``,
				});
				await admin.command({
					query: `GRANT SELECT(client_id) ON analytics.events TO \`${user}\``,
				});
				await admin.command({
					query: `GRANT FILE, INSERT, CREATE TEMPORARY TABLE ON *.* TO \`${role}\``,
				});
				await admin.command({
					query: `ALTER ROLE \`${role}\` SETTINGS allow_get_client_http_header = 1`,
				});
				await applyDqlAccess(admin, {
					hosts: [allowedHost],
					password,
					policyPrefix,
					role,
					user,
				});

				const result = await executeDqlQuery<{ path: string }>(
					{
						params: { paths: [pathA, pathB] },
						sql: "SELECT path FROM analytics.events WHERE path IN {paths:Array(String)} ORDER BY path",
						websiteId: websiteA,
					},
					dqlClient
				);
				expect(result.rows).toEqual([{ path: pathA }]);

				const nested = await executeDqlQuery<{ path: string }>(
					{
						sql: `WITH scoped AS (
						SELECT path FROM analytics.events
					)
					SELECT path FROM scoped
					UNION ALL
					SELECT path FROM analytics.events
					ORDER BY path`,
						websiteId: websiteA,
					},
					dqlClient
				);
				expect(nested.rows).toEqual([{ path: pathA }, { path: pathA }]);

				await expect(
					executeDqlQuery(
						{
							sql: "SELECT * FROM mergeTreeIndex(analytics, events)",
							websiteId: websiteA,
						},
						dqlClient
					)
				).rejects.toThrow("published analytics surface");
				await expect(
					dqlClient.query({
						clickhouse_settings: { readonly: 1 },
						format: "JSON",
						query: "SELECT path FROM analytics.events LIMIT 1",
					})
				).rejects.toThrow();
				await expect(
					dqlClient.query({
						clickhouse_settings: dqlSettingsForWebsite(websiteA),
						format: "JSON",
						query: "SELECT client_id FROM analytics.events LIMIT 1",
					})
				).rejects.toThrow();
				await expect(
					dqlClient.query({
						clickhouse_settings: dqlSettingsForWebsite(websiteA),
						format: "JSON",
						query: "SELECT query FROM system.query_log LIMIT 1",
					})
				).rejects.toThrow();
				await expect(
					dqlClient.query({
						clickhouse_settings: dqlSettingsForWebsite(websiteA),
						format: "JSON",
						query: "SELECT getClientHTTPHeader('Authorization')",
					})
				).rejects.toThrow();
				await expect(
					dqlClient.query({
						clickhouse_settings: dqlSettingsForWebsite(websiteA),
						format: "JSON",
						query: "SELECT * FROM file('/etc/passwd', LineAsString)",
					})
				).rejects.toThrow();
				await expect(
					dqlClient.query({
						clickhouse_settings: dqlSettingsForWebsite(websiteA),
						format: "JSON",
						query: `SELECT path FROM analytics.events SETTINGS ${DQL_TENANT_SETTING} = '${websiteB}'`,
					})
				).rejects.toThrow();
				await expect(
					rawDqlClient.command({
						query:
							"INSERT INTO analytics.events (client_id) VALUES ({websiteId:String})",
						query_params: { websiteId: websiteA },
					})
				).rejects.toThrow();
				await expect(
					rawDqlClient.command({
						query:
							"CREATE TEMPORARY TABLE dql_privilege_escape (value String)",
					})
				).rejects.toThrow();
			} finally {
				await admin.command({
					query: `DROP ROW POLICY IF EXISTS \`${policy}\` ON analytics.events`,
				});
				await admin.command({ query: `DROP USER IF EXISTS \`${user}\`` });
				await admin.command({ query: `DROP ROLE IF EXISTS \`${role}\`` });
				await admin.command({
					query: `DROP ROLE IF EXISTS \`${backdoorRole}\``,
				});
				await admin.command({
					query: `ALTER TABLE analytics.events DELETE WHERE client_id IN ({websiteA:String}, {websiteB:String}) SETTINGS mutations_sync = 1`,
					query_params: { websiteA, websiteB },
				});
				await rawDqlClient.close();
				await admin.close();
			}
		}
	);
});
