import { parseArgs } from "node:util";
import { clickHouse } from "@databuddy/db/clickhouse";
import { applyClickHouseSchema } from "@databuddy/db/clickhouse/apply";
import {
	applyPostgresSchema,
	assertLocalTargets,
	resetLocalDatabase,
} from "@databuddy/db/e2e-db-lifecycle";
import {
	deleteAnalytics,
	generateAnalytics,
	seedAnalytics,
} from "@databuddy/db/seed";
import { signUp } from "./auth";
import { closeClickHouse } from "./clickhouse";
import { closePostgres, db, truncatePostgres } from "./db";
import { insertApiKey, insertWebsite } from "./factories";
import { closeRedis, flushRedis } from "./redis";

export async function reset() {
	await Promise.all([truncatePostgres(), flushRedis()]);
}

export async function cleanup() {
	await Promise.all([closePostgres(), closeRedis(), closeClickHouse()]);
}

const WORKSPACE = {
	domain: "localhost",
	email: "dev@databuddy.local",
	password: "databuddy-dev",
	websiteId: "local-website",
};

async function workspaceWebsite(websiteId?: string) {
	const existing = await db().query.websites.findFirst({
		where: { id: websiteId ?? WORKSPACE.websiteId },
	});
	if (existing) {
		return { apiKey: null, website: existing };
	}
	if (websiteId) {
		throw new Error(`Website "${websiteId}" does not exist`);
	}
	const user = await signUp({
		email: WORKSPACE.email,
		name: "Local Dev",
		password: WORKSPACE.password,
		verified: true,
	});
	const membership = await db().query.member.findFirst({
		where: { userId: user.id },
	});
	if (!membership) {
		throw new Error("Sign-up did not provision an organization");
	}
	const website = await insertWebsite({
		domain: WORKSPACE.domain,
		id: WORKSPACE.websiteId,
		name: "Localhost",
		organizationId: membership.organizationId,
	});
	if (!website) {
		throw new Error("Website insert returned no row");
	}
	const apiKey = await insertApiKey({
		name: "Local workspace",
		organizationId: membership.organizationId,
		scopes: ["read:data"],
	});
	return { apiKey: apiKey.secret, website };
}

if (import.meta.main) {
	try {
		const { values } = parseArgs({
			options: {
				anomaly: { type: "boolean" },
				events: { type: "string" },
				reset: { type: "boolean" },
				website: { type: "string" },
			},
		});
		const events = values.events ? Number(values.events) : undefined;
		if (events !== undefined && !(Number.isFinite(events) && events > 0)) {
			throw new Error("--events must be a positive number");
		}
		const databaseUrl = assertLocalTargets();
		if (values.reset) {
			await resetLocalDatabase(databaseUrl);
		}
		await Promise.all([
			applyPostgresSchema(databaseUrl),
			applyClickHouseSchema(),
		]);
		const { apiKey, website } = await workspaceWebsite(values.website);
		const rows = generateAnalytics({
			anomaly: values.anomaly,
			clientId: website.id,
			domain: website.domain,
			events,
		});
		await deleteAnalytics(clickHouse, website.id);
		await seedAnalytics(clickHouse, rows);
		console.info(
			[
				`Seeded ${rows.events.length} events, ${rows.errors.length} errors, ${rows.webVitals.length} web vitals and ${rows.outgoingLinks.length} outgoing links`,
				values.website
					? null
					: `Login:   ${WORKSPACE.email} / ${WORKSPACE.password}`,
				`Website: ${website.id} (${website.domain})`,
				apiKey ? `API key: ${apiKey} (shown once)` : null,
			]
				.filter(Boolean)
				.join("\n")
		);
		process.exit(0);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
