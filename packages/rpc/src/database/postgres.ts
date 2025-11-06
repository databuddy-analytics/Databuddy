import { Client } from "pg";

export interface PostgresConnectionInfo {
	host: string;
	port: number;
	database: string;
	username: string;
	password: string;
	ssl?: boolean;
}

export function parsePostgresUrl(url: string): PostgresConnectionInfo {
	try {
		const urlObj = new URL(url);
		return {
			host: urlObj.hostname,
			port: urlObj.port ? Number.parseInt(urlObj.port, 10) : 5432,
			database: urlObj.pathname.slice(1),
			username: urlObj.username,
			password: urlObj.password,
			ssl: urlObj.searchParams.get("sslmode") === "require",
		};
	} catch (error) {
		throw new Error(`Invalid PostgreSQL URL: ${error.message}`);
	}
}

export function buildPostgresUrl(info: PostgresConnectionInfo): string {
	const url = new URL("postgresql://");
	url.hostname = info.host;
	url.port = info.port.toString();
	url.username = info.username;
	url.password = info.password;
	url.pathname = `/${info.database}`;

	if (info.ssl) {
		url.searchParams.set("sslmode", "require");
	}

	return url.toString();
}

export async function testConnection(url: string): Promise<void> {
	const client = new Client({
		connectionString: url,
		connectionTimeoutMillis: 10_000,
		query_timeout: 5000,
	});

	try {
		await client.connect();
		await client.query("SELECT 1");
	} catch (error) {
		throw new Error(`Failed to connect: ${error.message}`);
	} finally {
		await client.end();
	}
}
