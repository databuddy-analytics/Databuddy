import { Client } from "pg";

export interface DatabaseStats {
	databaseName: string;
	databaseSize: string;
	maxConnections: number;
	activeConnections: number;
	totalQueries: number;
	totalInserts: number;
	totalUpdates: number;
	totalDeletes: number;
	hitRatio: number;
	indexUsage: number;
}

export interface TableStats {
	tableName: string;
	schemaName: string;
	rowCount: number;
	totalSize: string;
	indexSize: string;
	lastVacuum?: string;
	lastAnalyze?: string;
	sequentialScans: number;
	indexScans: number;
	deadTuples: number;
}

export interface ExtensionInfo {
	name: string;
	version: string;
	schema: string;
	description: string;
	installed: boolean;
	availableVersion?: string;
	needsUpdate: boolean;
}

async function createClient(connectionUrl: string): Promise<Client> {
	const client = new Client({
		connectionString: connectionUrl,
		connectionTimeoutMillis: 10_000,
		query_timeout: 30_000,
	});
	await client.connect();
	return client;
}

export async function getDatabaseStats(
	connectionUrl: string
): Promise<DatabaseStats> {
	const client = await createClient(connectionUrl);

	try {
		const queries = [
			// Database info
			"SELECT current_database() as database_name, pg_size_pretty(pg_database_size(current_database())) as database_size",
			// Connection info
			"SELECT setting as max_connections FROM pg_settings WHERE name = 'max_connections'",
			"SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active'",
			// Activity stats
			"SELECT SUM(xact_commit + xact_rollback) as total_queries, SUM(tup_inserted) as total_inserts, SUM(tup_updated) as total_updates, SUM(tup_deleted) as total_deletes FROM pg_stat_database WHERE datname = current_database()",
			// Performance metrics
			"SELECT ROUND(100.0 * SUM(blks_hit) / NULLIF(SUM(blks_hit + blks_read), 0), 2) as hit_ratio FROM pg_stat_database WHERE datname = current_database()",
			"SELECT ROUND(100.0 * SUM(idx_scan) / NULLIF(SUM(seq_scan + idx_scan), 0), 2) as index_usage FROM pg_stat_user_tables",
		];

		const results = await Promise.all(queries.map((q) => client.query(q)));
		const [
			dbInfo,
			connectionInfo,
			activeConnections,
			activity,
			hitRatio,
			indexUsage,
		] = results.map((r) => r.rows[0]);

		return {
			databaseName: dbInfo.database_name,
			databaseSize: dbInfo.database_size,
			maxConnections: Number.parseInt(connectionInfo.max_connections, 10),
			activeConnections: Number.parseInt(
				activeConnections.active_connections,
				10
			),
			totalQueries: Number.parseInt(activity.total_queries || "0", 10),
			totalInserts: Number.parseInt(activity.total_inserts || "0", 10),
			totalUpdates: Number.parseInt(activity.total_updates || "0", 10),
			totalDeletes: Number.parseInt(activity.total_deletes || "0", 10),
			hitRatio: Number.parseFloat(hitRatio.hit_ratio || "0"),
			indexUsage: Number.parseFloat(indexUsage.index_usage || "0"),
		};
	} finally {
		await client.end();
	}
}

export async function getTableStats(
	connectionUrl: string,
	limit?: number
): Promise<TableStats[]> {
	const client = await createClient(connectionUrl);

	try {
		const query = `
			SELECT 
				schemaname as schema_name,
				relname as table_name,
				n_live_tup as row_count,
				pg_size_pretty(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as total_size,
				pg_size_pretty(pg_indexes_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as index_size,
				last_vacuum,
				last_analyze,
				seq_scan as sequential_scans,
				idx_scan as index_scans,
				n_dead_tup as dead_tuples
			FROM pg_stat_user_tables 
			ORDER BY pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname)) DESC
			${limit ? "LIMIT $1" : ""}
		`;

		const result = limit
			? await client.query(query, [limit])
			: await client.query(query);

		return result.rows.map((row) => ({
			tableName: row.table_name,
			schemaName: row.schema_name,
			rowCount: Number.parseInt(row.row_count || "0", 10),
			totalSize: row.total_size,
			indexSize: row.index_size,
			lastVacuum: row.last_vacuum
				? new Date(row.last_vacuum).toISOString()
				: undefined,
			lastAnalyze: row.last_analyze
				? new Date(row.last_analyze).toISOString()
				: undefined,
			sequentialScans: Number.parseInt(row.sequential_scans || "0", 10),
			indexScans: Number.parseInt(row.index_scans || "0", 10),
			deadTuples: Number.parseInt(row.dead_tuples || "0", 10),
		}));
	} finally {
		await client.end();
	}
}

export async function getExtensions(
	connectionUrl: string
): Promise<ExtensionInfo[]> {
	const client = await createClient(connectionUrl);

	try {
		const [extensionsResult, availableResult] = await Promise.all([
			client.query(
				"SELECT e.extname as name, e.extversion as version, n.nspname as schema, COALESCE(c.description, 'No description available') as description FROM pg_extension e LEFT JOIN pg_namespace n ON n.oid = e.extnamespace LEFT JOIN pg_description c ON c.objoid = e.oid AND c.classoid = 'pg_extension'::regclass ORDER BY e.extname"
			),
			client.query("SELECT name, default_version FROM pg_available_extensions"),
		]);

		const availableVersions = new Map(
			availableResult.rows.map((row) => [row.name, row.default_version])
		);

		return extensionsResult.rows.map((row) => {
			const availableVersion = availableVersions.get(row.name);
			return {
				name: row.name,
				version: row.version,
				schema: row.schema,
				description: row.description,
				installed: true,
				availableVersion,
				needsUpdate: availableVersion && availableVersion !== row.version,
			};
		});
	} finally {
		await client.end();
	}
}

export async function resetExtensionStats(
	connectionUrl: string,
	extensionName: string
): Promise<void> {
	const client = await createClient(connectionUrl);

	try {
		switch (extensionName) {
			case "pg_stat_statements":
				await client.query("SELECT pg_stat_statements_reset()");
				break;
			case "pg_stat_monitor":
				await client.query("SELECT pg_stat_monitor_reset()");
				break;
			default:
				throw new Error(
					`Stats reset not supported for extension: ${extensionName}`
				);
		}
	} finally {
		await client.end();
	}
}

export async function updateExtension(
	connectionUrl: string,
	extensionName: string
): Promise<void> {
	const client = await createClient(connectionUrl);

	try {
		// Check if extension exists and needs updating
		const versionCheck = await client.query(
			"SELECT e.extversion as current_version, av.default_version as available_version FROM pg_extension e JOIN pg_available_extensions av ON e.extname = av.name WHERE e.extname = $1",
			[extensionName]
		);

		if (versionCheck.rows.length === 0) {
			throw new Error(`Extension ${extensionName} is not installed`);
		}

		const { current_version, available_version } = versionCheck.rows[0];
		if (current_version === available_version) {
			return;
		}

		await client.query(`ALTER EXTENSION "${extensionName}" UPDATE`);
	} finally {
		await client.end();
	}
}

export async function safeInstallExtension(
	connectionUrl: string,
	extensionName: string,
	schema?: string,
	force = false
): Promise<{ success: boolean; warnings: string[] }> {
	const client = await createClient(connectionUrl);
	const warnings: string[] = [];

	try {
		// Check if available
		const availableCheck = await client.query(
			"SELECT name FROM pg_available_extensions WHERE name = $1",
			[extensionName]
		);

		if (availableCheck.rows.length === 0) {
			return {
				success: false,
				warnings: [`Extension ${extensionName} is not available`],
			};
		}

		// Check if already installed
		const installedCheck = await client.query(
			"SELECT extversion FROM pg_extension WHERE extname = $1",
			[extensionName]
		);

		if (installedCheck.rows.length > 0) {
			return {
				success: false,
				warnings: [`Extension ${extensionName} is already installed`],
			};
		}

		// Install
		let query = `CREATE EXTENSION "${extensionName}"`;
		if (schema) {
			query += ` WITH SCHEMA "${schema}"`;
		}

		if (force) {
			query += " WITH FORCE";
		}

		await client.query(query);
		return { success: true, warnings };
	} finally {
		await client.end();
	}
}

export async function getAvailableExtensions(connectionUrl: string): Promise<
	{
		name: string;
		defaultVersion: string;
		description: string;
	}[]
> {
	const client = await createClient(connectionUrl);

	try {
		const result = await client.query(`
			SELECT name, default_version, comment
			FROM pg_available_extensions
			WHERE name NOT IN (SELECT extname FROM pg_extension)
			ORDER BY name
		`);

		return result.rows.map((row) => ({
			name: row.name,
			defaultVersion: row.default_version,
			description: row.comment || "No description available",
		}));
	} finally {
		await client.end();
	}
}

export async function checkExtensionSafety(
	connectionUrl: string,
	extensionName: string
): Promise<{
	canSafelyDrop: boolean;
	canSafelyUpdate: boolean;
	warnings: string[];
	hasStatefulData: boolean;
}> {
	const client = await createClient(connectionUrl);

	try {
		// Check for dependent objects
		const dependencyResult = await client.query(
			`SELECT COUNT(*) as dependency_count FROM pg_depend d
			 JOIN pg_extension e ON d.refobjid = e.oid
			 WHERE e.extname = $1 AND d.deptype IN ('n', 'a')`,
			[extensionName]
		);

		const dependencyCount = Number.parseInt(
			dependencyResult.rows[0].dependency_count,
			10
		);
		const hasStatefulData = ["pg_stat_statements", "pg_stat_monitor"].includes(
			extensionName
		);
		const canSafelyDrop = dependencyCount === 0;
		const canSafelyUpdate = true;

		const warnings: string[] = [];
		if (hasStatefulData) {
			warnings.push(
				"Extension contains stateful data that will be lost if dropped"
			);
		}
		if (dependencyCount > 0) {
			warnings.push(`${dependencyCount} dependent objects will be affected`);
		}

		return {
			canSafelyDrop,
			canSafelyUpdate,
			warnings,
			hasStatefulData,
		};
	} finally {
		await client.end();
	}
}

export async function safeDropExtension(
	connectionUrl: string,
	extensionName: string,
	cascade = false
): Promise<{ success: boolean; warnings: string[] }> {
	const client = await createClient(connectionUrl);
	const warnings: string[] = [];

	try {
		// Check if exists
		const extensionCheck = await client.query(
			"SELECT extname FROM pg_extension WHERE extname = $1",
			[extensionName]
		);

		if (extensionCheck.rows.length === 0) {
			return {
				success: false,
				warnings: [`Extension ${extensionName} is not installed`],
			};
		}

		// Drop
		let query = `DROP EXTENSION "${extensionName}"`;
		if (cascade) {
			query += " CASCADE";
			warnings.push("Using CASCADE to drop dependent objects");
		}

		await client.query(query);
		return { success: true, warnings };
	} finally {
		await client.end();
	}
}
