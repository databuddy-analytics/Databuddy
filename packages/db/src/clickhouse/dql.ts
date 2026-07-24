/**
 * DQL is a thin, read-only ClickHouse surface.
 *
 * Tenant isolation is enforced by the dedicated ClickHouse user, its exact
 * column grant, and a restrictive row policy. The small SQL guard only keeps
 * unpublished ClickHouse namespaces and dynamic sources out of the public API.
 */
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import {
	ClickHouseError,
	createClient,
	type ClickHouseClient,
	type ResponseJSON,
	type ResultSet,
} from "@clickhouse/client";
import { clickHouse, CLICKHOUSE_OPTIONS } from "./client";
import { hasCommaJoinInFrom } from "./sql-validation";

export const DQL_DEFAULT_USER = "dql_user";
export const DQL_TENANT_SETTING = "SQL_databuddy_website_id";

export const DQL_INPUT_LIMITS = {
	maxArrayItems: 10_000,
	maxParameterBytes: 256 * 1024,
	maxParameters: 100,
	maxSqlBytes: 50 * 1024,
	maxStringLength: 64 * 1024,
} as const;

export const DQL_RESOURCE_LIMITS = {
	maxBytesToRead: 2_000_000_000,
	maxConcurrentQueries: 4,
	maxExecutionTimeSeconds: 20,
	maxMemoryUsage: 1_000_000_000,
	maxMemoryUsageForUser: 2_000_000_000,
	maxResultBytes: 20_000_000,
	maxResultRows: 10_000,
	maxRowsToRead: 50_000_000,
	maxThreads: 4,
} as const;

const DQL_EVENTS_TABLE = "analytics.events";
const DQL_EVENTS_TENANT_COLUMN = "client_id";
const DQL_EVENTS_COLUMNS = [
	{ name: "time", type: "DateTime64(3, 'UTC')" },
	{ name: "path", type: "String" },
	{ name: "event_name", type: "String" },
	{ name: "anonymous_id", type: "String" },
	{ name: "profile_id", type: "String" },
	{ name: "session_id", type: "String" },
	{ name: "referrer", type: "Nullable(String)" },
	{ name: "browser_name", type: "Nullable(String)" },
	{ name: "os_name", type: "Nullable(String)" },
	{ name: "device_type", type: "Nullable(String)" },
	{ name: "country", type: "Nullable(String)" },
	{ name: "region", type: "Nullable(String)" },
	{ name: "city", type: "Nullable(String)" },
	{ name: "utm_source", type: "Nullable(String)" },
	{ name: "utm_medium", type: "Nullable(String)" },
	{ name: "utm_campaign", type: "Nullable(String)" },
	{ name: "utm_term", type: "Nullable(String)" },
	{ name: "utm_content", type: "Nullable(String)" },
	{ name: "time_on_page", type: "Nullable(Float32)" },
	{ name: "scroll_depth", type: "Nullable(Float32)" },
] as const;

export const DQL_SCHEMA = [
	{
		name: DQL_EVENTS_TABLE,
		columns: DQL_EVENTS_COLUMNS,
	},
] as const;

type DqlParameterScalar = boolean | null | number | string;
export type DqlParameterValue =
	| DqlParameterScalar
	| readonly DqlParameterScalar[];

export class DqlQueryRejectedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DqlQueryRejectedError";
	}
}

export interface DqlQueryInput {
	params?: Readonly<Record<string, DqlParameterValue>>;
	sql: string;
	websiteId: string;
}

export interface DqlQueryResult<T extends Record<string, unknown>> {
	columns: Array<{ name: string; type: string }>;
	rows: T[];
	stats: {
		bytesRead: number;
		elapsedMs: number;
		queryId: string;
		rowCount: number;
		rowsRead: number;
	};
}

export interface DqlQueryClient {
	query: (options: {
		clickhouse_settings: Record<string, number | string>;
		format: "JSON";
		query: string;
		query_params?: Record<string, DqlParameterValue>;
	}) => Promise<ResultSet<"JSON">>;
}

const SAFE_QUERY_ERRORS: Readonly<Record<string, string>> = {
	ACCESS_DENIED: "DQL references an unknown or unavailable identifier.",
	AMBIGUOUS_IDENTIFIER: "DQL references an unknown or ambiguous identifier.",
	BAD_ARGUMENTS: "DQL contains incompatible values or function arguments.",
	CANNOT_CONVERT_TYPE: "DQL contains incompatible values or types.",
	CANNOT_PARSE_TEXT: "DQL contains a value that cannot be parsed.",
	ILLEGAL_AGGREGATION: "DQL contains an invalid aggregation.",
	ILLEGAL_COLUMN: "DQL contains an incompatible column.",
	ILLEGAL_TYPE_OF_ARGUMENT: "DQL contains an incompatible function argument.",
	INVALID_JOIN_ON_EXPRESSION: "DQL contains an invalid join.",
	NO_COMMON_TYPE: "DQL contains incompatible values or types.",
	NOT_AN_AGGREGATE: "DQL contains an invalid aggregation.",
	NUMBER_OF_ARGUMENTS_DOESNT_MATCH:
		"DQL contains an incorrect number of function arguments.",
	SYNTAX_ERROR: "DQL syntax is invalid.",
	TYPE_MISMATCH: "DQL contains incompatible values or types.",
	UNKNOWN_AGGREGATE_FUNCTION: "DQL references an unknown function.",
	UNKNOWN_FUNCTION: "DQL references an unknown function.",
	UNKNOWN_IDENTIFIER: "DQL references an unknown or unavailable identifier.",
	UNKNOWN_QUERY_PARAMETER: "DQL is missing or misusing a typed parameter.",
	UNKNOWN_TABLE: "DQL references an unknown or unavailable identifier.",
	UNKNOWN_TYPE: "DQL references an unknown type.",
	UNSUPPORTED_JOIN_KEYS: "DQL contains unsupported join keys.",
};

const DQL_READ_QUERY_PATTERN = /^(?:SELECT|WITH)\b/i;
const DQL_UNSUPPORTED_SYNTAX_PATTERN = /--|\/\*|#|\\/;
const DQL_UNPUBLISHED_SQL_PATTERN =
	/\b(?:getClientHTTPHeader|Identifier|information_schema|SQL_databuddy_website_id|system)\b/i;
const DQL_TABLE_FUNCTION_SOURCE_PATTERN =
	/\b(?:FROM|JOIN)\s+(?:["`]?[A-Za-z_][A-Za-z0-9_]*["`]?\s*\.\s*)?["`]?[A-Za-z_][A-Za-z0-9_]*["`]?\s*\(/i;

function isLoopbackHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	return ["localhost", "127.0.0.1", "::1"].includes(normalized);
}

function parseDqlUrl(rawUrl: string | undefined): {
	password: string;
	rawUrl: string;
	url: URL;
	user: string;
} {
	if (!rawUrl) {
		throw new Error("CLICKHOUSE_DQL_URL is required.");
	}

	let url: URL;
	let password: string;
	let user: string;
	try {
		url = new URL(rawUrl);
		user = decodeURIComponent(url.username);
		password = decodeURIComponent(url.password);
	} catch {
		throw new Error("CLICKHOUSE_DQL_URL must be a valid URL.");
	}

	if (
		!["http:", "https:"].includes(url.protocol) ||
		user !== DQL_DEFAULT_USER ||
		!password ||
		url.search ||
		url.hash
	) {
		throw new Error(
			`CLICKHOUSE_DQL_URL must authenticate directly as "${DQL_DEFAULT_USER}".`
		);
	}
	if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
		throw new Error("CLICKHOUSE_DQL_URL must use HTTPS outside loopback.");
	}

	return { password, rawUrl, url, user };
}

export function dqlSettingsForWebsite(
	websiteId: string
): Record<string, number | string> {
	if (!websiteId.trim()) {
		throw new Error("DQL requires an authorized website identifier.");
	}

	return {
		[DQL_TENANT_SETTING]: websiteId,
		readonly: 1,
	};
}

export function createDqlClient(rawUrl: string | undefined): DqlQueryClient {
	const parsed = parseDqlUrl(rawUrl);

	return createClient({
		...CLICKHOUSE_OPTIONS,
		compression: { request: true, response: false },
		max_open_connections: DQL_RESOURCE_LIMITS.maxConcurrentQueries,
		url: parsed.rawUrl,
	}) as DqlQueryClient;
}

let defaultDqlClient: DqlQueryClient | undefined;

function getDqlClient(): DqlQueryClient {
	defaultDqlClient ??= createDqlClient(process.env.CLICKHOUSE_DQL_URL);
	return defaultDqlClient;
}

export async function executeDqlQuery<T extends Record<string, unknown>>(
	input: DqlQueryInput,
	client = getDqlClient()
): Promise<DqlQueryResult<T>> {
	const sql = input.sql.trim();
	if (
		!DQL_READ_QUERY_PATTERN.test(sql) ||
		DQL_UNSUPPORTED_SYNTAX_PATTERN.test(sql) ||
		DQL_UNPUBLISHED_SQL_PATTERN.test(sql) ||
		DQL_TABLE_FUNCTION_SOURCE_PATTERN.test(sql) ||
		hasCommaJoinInFrom(sql)
	) {
		throw new DqlQueryRejectedError(
			"DQL may only read the published analytics surface."
		);
	}
	if (new TextEncoder().encode(sql).byteLength > DQL_INPUT_LIMITS.maxSqlBytes) {
		throw new DqlQueryRejectedError("DQL query is too large.");
	}

	let result: ResultSet<"JSON">;
	let response: ResponseJSON<T>;
	try {
		result = await client.query({
			query: sql,
			query_params: { ...(input.params ?? {}) },
			format: "JSON",
			clickhouse_settings: dqlSettingsForWebsite(input.websiteId),
		});
		response = (await result.json<T>()) as ResponseJSON<T>;
	} catch (error) {
		if (error instanceof ClickHouseError && error.type) {
			const message = SAFE_QUERY_ERRORS[error.type];
			if (message) {
				throw new DqlQueryRejectedError(message);
			}
		}
		throw error;
	}

	return {
		columns: response.meta ?? [],
		rows: response.data,
		stats: {
			bytesRead: response.statistics?.bytes_read ?? 0,
			elapsedMs: Math.round((response.statistics?.elapsed ?? 0) * 1000),
			queryId: response.query_id ?? result.query_id,
			rowCount: response.data.length,
			rowsRead: response.statistics?.rows_read ?? 0,
		},
	};
}

const DQL_DEFAULT_ROLE = "dql_role";
const DQL_DEFAULT_POLICY_PREFIX = "dql";
const DQL_DEFAULT_CLUSTER = "databuddy_cluster";
const DQL_DEFAULT_HOSTS = ["127.0.0.1", "::1"] as const;
const ACCESS_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface DqlAccessOptions {
	cluster?: string;
	hosts?: readonly string[];
	password: string;
	policyPrefix?: string;
	role?: string;
	user?: string;
}

function accessIdentifier(value: string, label: string): string {
	if (!ACCESS_IDENTIFIER_PATTERN.test(value)) {
		throw new Error(`Invalid DQL ${label}: ${value}`);
	}
	return `\`${value}\``;
}

function hostClause(configuredHosts: readonly string[] | undefined): string {
	const hosts = configuredHosts ?? DQL_DEFAULT_HOSTS;
	if (hosts.length === 0) {
		throw new Error("At least one DQL host IP is required.");
	}

	const literals = [...new Set(hosts)].map((rawHost) => {
		const host = rawHost.trim();
		if (isIP(host) === 0 || host === "0.0.0.0" || host === "::") {
			throw new Error(`Invalid DQL host IP: ${rawHost}`);
		}
		return `IP '${host}'`;
	});

	return ` HOST ${literals.join(", ")}`;
}

export function buildDqlAccessStatements(
	options: DqlAccessOptions
): readonly string[] {
	if (!options.password) {
		throw new Error("DQL user password is required.");
	}

	const user = accessIdentifier(options.user ?? DQL_DEFAULT_USER, "user");
	const role = accessIdentifier(options.role ?? DQL_DEFAULT_ROLE, "role");
	const onCluster = options.cluster
		? ` ON CLUSTER ${accessIdentifier(options.cluster, "cluster")}`
		: "";
	const policyPrefix = options.policyPrefix ?? DQL_DEFAULT_POLICY_PREFIX;
	accessIdentifier(policyPrefix, "policy prefix");
	const hosts = hostClause(options.hosts);
	const passwordHash = createHash("sha256")
		.update(options.password)
		.digest("hex");
	const columns = DQL_EVENTS_COLUMNS.map((column) =>
		accessIdentifier(column.name, "column")
	).join(", ");
	const policy = accessIdentifier(`${policyPrefix}_events_website`, "policy");
	const settings = DQL_RESOURCE_LIMITS;

	return [
		`CREATE ROLE IF NOT EXISTS ${role}${onCluster}`,
		`ALTER ROLE ${role}${onCluster} DROP ALL PROFILES DROP ALL SETTINGS`,
		`CREATE USER IF NOT EXISTS ${user}${onCluster} IDENTIFIED WITH sha256_hash BY '${passwordHash}'${hosts}`,
		`ALTER USER ${user}${onCluster} IDENTIFIED WITH sha256_hash BY '${passwordHash}'${hosts} GRANTEES NONE`,
		`REVOKE${onCluster} ALL FROM ${user}`,
		`REVOKE${onCluster} ALL ON *.* FROM ${user}`,
		`REVOKE${onCluster} ALL FROM ${role}`,
		`REVOKE${onCluster} ALL ON *.* FROM ${role}`,
		`GRANT${onCluster} ${role} TO ${user} WITH REPLACE OPTION`,
		`ALTER USER ${user}${onCluster} DEFAULT ROLE ${role}`,
		`ALTER USER ${user}${onCluster} SETTINGS readonly = 0 MAX 1, allow_ddl = 0 READONLY, allow_get_client_http_header = 0 READONLY, max_execution_time = ${settings.maxExecutionTimeSeconds} MIN 1 MAX ${settings.maxExecutionTimeSeconds}, max_memory_usage = ${settings.maxMemoryUsage} MIN 1 MAX ${settings.maxMemoryUsage}, max_memory_usage_for_user = ${settings.maxMemoryUsageForUser} MIN 1 MAX ${settings.maxMemoryUsageForUser}, max_rows_to_read = ${settings.maxRowsToRead} MIN 1 MAX ${settings.maxRowsToRead}, max_bytes_to_read = ${settings.maxBytesToRead} MIN 1 MAX ${settings.maxBytesToRead}, max_result_rows = ${settings.maxResultRows} MIN 1 MAX ${settings.maxResultRows}, max_result_bytes = ${settings.maxResultBytes} MIN 1 MAX ${settings.maxResultBytes}, max_threads = ${settings.maxThreads} MIN 1 MAX ${settings.maxThreads}, max_concurrent_queries_for_user = ${settings.maxConcurrentQueries} MIN 1 MAX ${settings.maxConcurrentQueries}, read_overflow_mode = 'throw' READONLY, result_overflow_mode = 'throw' READONLY, use_query_cache = 0 READONLY`,
		`CREATE ROW POLICY OR REPLACE ${policy}${onCluster} ON ${DQL_EVENTS_TABLE} FOR SELECT USING ${DQL_EVENTS_TENANT_COLUMN} = getSetting('${DQL_TENANT_SETTING}') AS RESTRICTIVE TO ${role}`,
		`GRANT${onCluster} SELECT(${columns}) ON ${DQL_EVENTS_TABLE} TO ${role}`,
	];
}

export async function applyDqlAccess(
	client: Pick<ClickHouseClient, "command">,
	options: DqlAccessOptions
): Promise<void> {
	for (const query of buildDqlAccessStatements(options)) {
		await client.command({ query });
	}
}

async function provisionDql(): Promise<void> {
	const credentials = parseDqlUrl(process.env.CLICKHOUSE_DQL_URL);
	const clusterName =
		process.env.CLICKHOUSE_CLUSTER_NAME?.trim() || DQL_DEFAULT_CLUSTER;
	const [addressResult, clusterResult] = await Promise.all([
		clickHouse.query({
			format: "TabSeparatedRaw",
			query:
				"SELECT toString(address) FROM system.processes WHERE query_id = currentQueryID()",
		}),
		clickHouse.query({
			format: "TabSeparatedRaw",
			query:
				"SELECT count() FROM system.clusters WHERE cluster = {cluster:String}",
			query_params: { cluster: clusterName },
		}),
	]);
	const address = (await addressResult.text()).trim();
	if (!address) {
		throw new Error("ClickHouse did not report the provisioning client IP.");
	}
	const cluster =
		Number.parseInt((await clusterResult.text()).trim(), 10) > 1
			? clusterName
			: undefined;

	await applyDqlAccess(clickHouse, {
		cluster,
		password: credentials.password,
		user: credentials.user,
		hosts: [...new Set([...DQL_DEFAULT_HOSTS, address])],
	});

	console.info("Provisioned the DQL ClickHouse user, grant, and row policy.");
}

if (import.meta.main) {
	provisionDql().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
