import { performance } from 'node:perf_hooks';
import { TABLE_NAMES } from '../clickhouse/client';
import { account, user, websites } from '../drizzle/schema';
import type { SeedConfig } from './config';
import { parseSeedArgs, resolveSeedConfig } from './config';
import { createSeedContext } from './context';
import type { SeedContext } from './context';
import { getScenario, listScenarios } from './scenarios';
import type { ScenarioResult } from './scenarios/types';

export interface SeedRunSummary {
	config: SeedConfig;
	result: ScenarioResult;
	durationMs: number;
}

export async function runSeed(
	initialConfig: Partial<SeedConfig>
): Promise<SeedRunSummary> {
	const config = resolveSeedConfig(initialConfig);
	const ctx = createSeedContext(config);

	console.info(
		`[seed] Starting scenario "${config.scenario}" (dryRun=${config.dryRun})`
	);

	if (config.reset === 'truncate') {
		if (config.dryRun) {
			console.info('[seed] reset=truncate ignored because dryRun=true');
		} else {
			await truncateDatabases(ctx);
		}
	}

	const scenario = getScenario(config.scenario);
	const startedAt = performance.now();
	const result = await scenario(ctx);
	const durationMs = Math.round(performance.now() - startedAt);

	logHumanSummary(result, durationMs);

	const summary: SeedRunSummary = {
		config,
		result,
		durationMs,
	};

	// JSON summary (last line for CI parsing)
	console.log(
		JSON.stringify({
			scenario: config.scenario,
			dryRun: config.dryRun,
			durationMs,
			result,
		})
	);

	return summary;
}

function logHumanSummary(result: ScenarioResult, durationMs: number) {
	console.info(
		`[seed] Completed in ${durationMs}ms — users=${result.users}, websites=${result.websites}, events=${result.events}, customEvents=${result.customEvents}, outgoingLinks=${result.outgoingLinks}, errors=${result.errors}, webVitals=${result.webVitals}`
	);
	console.info(
		`[seed] Admin user ID=${result.ids.adminUserId} website ID=${result.ids.websiteId}`
	);
}

async function truncateDatabases(ctx: SeedContext) {
	console.info('[seed] Truncating Postgres tables...');
	await ctx.db.delete(account).execute();
	await ctx.db.delete(websites).execute();
	await ctx.db.delete(user).execute();

	console.info('[seed] Truncating ClickHouse tables...');
	const ckTables = [
		TABLE_NAMES.events,
		TABLE_NAMES.custom_events,
		TABLE_NAMES.outgoing_links,
		TABLE_NAMES.errors,
		TABLE_NAMES.web_vitals,
	];

	for (const table of ckTables) {
		await ctx.clickHouse.command({
			query: `TRUNCATE TABLE ${table}`,
		});
	}
}

async function main() {
	try {
		const config = parseSeedArgs();

		if (process.argv.includes('--list')) {
			for (const scenario of listScenarios()) {
				console.info(`${scenario.name} - ${scenario.description ?? ''}`.trim());
			}
			return;
		}

		await runSeed(config);
	} catch (error) {
		console.error('[seed] Failed to execute seed:', error);
		process.exitCode = 1;
	}
}

if (require.main === module) {
	void main();
}
