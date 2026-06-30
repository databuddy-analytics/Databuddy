import { Client } from "pg";

const LOCAL_DATABASE_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"::1",
	"[::1]",
]);
const DEFAULT_E2E_DB_PREFIX = "databuddy_e2e";
const INVALID_DB_IDENTIFIER_PARTS = /[^A-Za-z0-9_]+/g;
const LEADING_UNDERSCORES = /^_+/;
const TRAILING_UNDERSCORES = /_+$/;
const REPEATED_UNDERSCORES = /_+/g;

export type LifecycleCommand = "create" | "drop";

export interface ParsedLifecycleArgs {
	allowNonLocal: boolean;
	baseDsn: string;
	command: LifecycleCommand;
	dbName?: string;
	dbPrefix: string;
	runId?: string;
}

export interface ResolvedLifecycleConfig {
	adminDsn: string;
	dbDsn: string;
	dbName: string;
}

export interface LifecycleCommandResult {
	dbDsn: string;
	dbName: string;
}

export function parseLifecycleArgs(
	argv: readonly string[]
): ParsedLifecycleArgs {
	const [command, ...flags] = argv;
	if (command !== "create" && command !== "drop") {
		throw new Error(
			`Expected command to be 'create' or 'drop'; received '${command ?? ""}'`
		);
	}

	const parsed: ParsedLifecycleArgs = {
		allowNonLocal: false,
		baseDsn: "",
		command,
		dbPrefix: DEFAULT_E2E_DB_PREFIX,
	};

	for (let i = 0; i < flags.length; i += 1) {
		const flag = flags[i];
		const readValue = () => {
			const value = flags[i + 1];
			if (!(value && !value.startsWith("--"))) {
				throw new Error(`Flag '${flag}' requires a value`);
			}
			i += 1;
			return value;
		};

		switch (flag) {
			case "--allow-non-local":
				parsed.allowNonLocal = true;
				break;
			case "--base-dsn":
				parsed.baseDsn = readValue();
				break;
			case "--db-name":
				parsed.dbName = readValue();
				break;
			case "--db-prefix":
				parsed.dbPrefix = readValue();
				break;
			case "--run-id":
				parsed.runId = readValue();
				break;
			default:
				throw new Error(`Unknown flag '${flag ?? ""}'`);
		}
	}

	if (!parsed.baseDsn) {
		throw new Error("Missing required flag '--base-dsn'");
	}
	if (parsed.command === "drop" && !parsed.dbName) {
		throw new Error("Drop command requires '--db-name'");
	}
	return parsed;
}

export function sanitizeDbIdentifierPart(value: string): string {
	return value
		.replaceAll(INVALID_DB_IDENTIFIER_PARTS, "_")
		.replace(LEADING_UNDERSCORES, "")
		.replace(TRAILING_UNDERSCORES, "")
		.replaceAll(REPEATED_UNDERSCORES, "_");
}

export function resolveE2EDatabaseName(input: {
	dbName?: string;
	dbPrefix: string;
	runId?: string;
}): string {
	const explicit = sanitizeDbIdentifierPart(input.dbName?.trim() ?? "");
	if (explicit) {
		return explicit.slice(0, 63);
	}

	const prefix =
		sanitizeDbIdentifierPart(input.dbPrefix) || DEFAULT_E2E_DB_PREFIX;
	const run = sanitizeDbIdentifierPart(input.runId ?? `${Date.now()}`) || "run";
	const name = `${prefix}_${run}`;
	if (name.length <= 63) {
		return name;
	}
	if (run.length >= 62) {
		return run.slice(-63);
	}
	return `${prefix.slice(0, Math.max(1, 62 - run.length))}_${run}`;
}

export function normalizeDatabaseUrl(databaseDsn: string): URL {
	const parsed = new URL(databaseDsn);
	if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
		throw new Error(`Unsupported database protocol '${parsed.protocol}'`);
	}
	return parsed;
}

export function isLocalDbHostname(hostname: string): boolean {
	return LOCAL_DATABASE_HOSTS.has(hostname.toLowerCase());
}

export function deriveAdminDatabaseUrl(baseUrl: URL): URL {
	const url = new URL(baseUrl.href);
	url.pathname = "/postgres";
	return url;
}

export function deriveDatabaseUrl(baseUrl: URL, dbName: string): URL {
	const url = new URL(baseUrl.href);
	url.pathname = `/${dbName}`;
	return url;
}

export function resolveLifecycleConfig(
	input: ParsedLifecycleArgs
): ResolvedLifecycleConfig {
	const baseUrl = normalizeDatabaseUrl(input.baseDsn);
	if (!(input.allowNonLocal || isLocalDbHostname(baseUrl.hostname))) {
		throw new Error(
			`Refusing to manage E2E DB on non-local host '${baseUrl.hostname}'. Set --allow-non-local to override.`
		);
	}
	const dbName = resolveE2EDatabaseName(input);
	return {
		adminDsn: deriveAdminDatabaseUrl(baseUrl).toString(),
		dbDsn: deriveDatabaseUrl(baseUrl, dbName).toString(),
		dbName,
	};
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function toShellAssignments(values: Record<string, string>): string {
	return Object.entries(values)
		.map(([key, value]) => `${key}=${shellQuote(value)}`)
		.join("\n");
}

function pgCode(error: unknown): string | null {
	if (!(error && typeof error === "object" && "code" in error)) {
		return null;
	}
	return typeof error.code === "string" ? error.code : null;
}

async function withAdminClient<T>(
	adminDsn: string,
	operation: (client: Client) => Promise<T>
): Promise<T> {
	const client = new Client({ connectionString: adminDsn });
	await client.connect();
	try {
		return await operation(client);
	} finally {
		await client.end();
	}
}

async function dropDatabase(client: Client, dbName: string): Promise<void> {
	const quoted = quoteIdentifier(dbName);
	try {
		await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
		return;
	} catch (error) {
		if (pgCode(error) !== "42601") {
			throw error;
		}
	}

	await client.query(
		"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
		[dbName]
	);
	await client.query(`DROP DATABASE IF EXISTS ${quoted}`);
}

export async function createLifecycleDatabase(
	config: ResolvedLifecycleConfig
): Promise<LifecycleCommandResult> {
	await withAdminClient(config.adminDsn, async (client) => {
		try {
			await client.query(`CREATE DATABASE ${quoteIdentifier(config.dbName)}`);
		} catch (error) {
			if (pgCode(error) !== "42P04") {
				throw error;
			}
		}
	});
	return { dbDsn: config.dbDsn, dbName: config.dbName };
}

export async function dropLifecycleDatabase(
	config: ResolvedLifecycleConfig
): Promise<LifecycleCommandResult> {
	await withAdminClient(config.adminDsn, (client) =>
		dropDatabase(client, config.dbName)
	);
	return { dbDsn: config.dbDsn, dbName: config.dbName };
}

export async function runLifecycleCommand(
	argv: readonly string[]
): Promise<string> {
	const parsed = parseLifecycleArgs(argv);
	const config = resolveLifecycleConfig(parsed);
	if (parsed.command === "create") {
		const result = await createLifecycleDatabase(config);
		return toShellAssignments({
			DATABASE_URL: result.dbDsn,
			DATABUDDY_E2E_DB_NAME: result.dbName,
		});
	}
	await dropLifecycleDatabase(config);
	return toShellAssignments({ DATABUDDY_E2E_DB_NAME: config.dbName });
}
