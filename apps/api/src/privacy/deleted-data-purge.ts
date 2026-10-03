import { type AnyColumn, and, db, notDeleted, sql } from "@databuddy/db";
import {
	listKeyedIdsWithStoredRows,
	listOwnersWithStoredData,
	purgeAnalyticsData,
	purgeKeyedRows,
} from "@databuddy/db/clickhouse";
import {
	links,
	organization,
	uptimeSchedules,
	user,
	websites,
} from "@databuddy/db/schema";
import { redis } from "@databuddy/redis";
import { getErrorLogFields } from "@databuddy/shared/evlog-fields";
import { audit, createLogger, log } from "evlog";
import { flushBatchedApiDrain } from "@/lib/evlog-api";

const PURGE_INTERVAL_SECONDS = 6 * 60 * 60;
// Expires before the next tick, which would otherwise race its own lock.
const PURGE_LOCK_TTL_SECONDS = PURGE_INTERVAL_SECONDS - 5 * 60;
const PURGE_LOCK_KEY = "deleted-data-purge:lock";
// A missing or wrong Postgres would make every owner look deleted.
const MAX_DELETED_SHARE = 0.25;
const MIN_DELETED_FOR_SHARE_GUARD = 1;

const isAnyOf = (column: AnyColumn, ids: string[]) =>
	sql`${column} = any(${sql.param(ids)})`;

const existingWebsites = (ids: string[]) =>
	db
		.select({ id: websites.id })
		.from(websites)
		.where(isAnyOf(websites.id, ids));

const TARGETS = [
	{
		kind: "owner",
		listStored: listOwnersWithStoredData,
		listExisting: async (ids: string[]) =>
			(
				await Promise.all([
					existingWebsites(ids),
					db
						.select({ id: organization.id })
						.from(organization)
						.where(isAnyOf(organization.id, ids)),
					db.select({ id: user.id }).from(user).where(isAnyOf(user.id, ids)),
				])
			).flat(),
		purge: purgeAnalyticsData,
	},
	{
		kind: "link",
		listStored: () => listKeyedIdsWithStoredRows("analytics.link_visits"),
		listExisting: (ids: string[]) =>
			db
				.select({ id: links.id })
				.from(links)
				.where(and(isAnyOf(links.id, ids), notDeleted(links))),
		purge: (ids: string[], onBatchPurged: (ids: string[]) => Promise<void>) =>
			purgeKeyedRows("analytics.link_visits", ids, onBatchPurged),
	},
	{
		kind: "uptime_monitor",
		listStored: () => listKeyedIdsWithStoredRows("uptime.uptime_monitor"),
		listExisting: async (ids: string[]) =>
			(
				await Promise.all([
					existingWebsites(ids),
					db
						.select({ id: uptimeSchedules.id })
						.from(uptimeSchedules)
						.where(isAnyOf(uptimeSchedules.id, ids)),
				])
			).flat(),
		purge: (ids: string[], onBatchPurged: (ids: string[]) => Promise<void>) =>
			purgeKeyedRows("uptime.uptime_monitor", ids, onBatchPurged),
	},
] as const;

async function findDeletedOwners(target: (typeof TARGETS)[number]) {
	const stored = await target.listStored();
	const existing = new Set(
		(await target.listExisting(stored.map((owner) => owner.id))).map(
			(row) => row.id
		)
	);
	const deleted = stored.filter((owner) => !existing.has(owner.id));
	if (
		(deleted.length > 0 && deleted.length === stored.length) ||
		(deleted.length > MIN_DELETED_FOR_SHARE_GUARD &&
			deleted.length > stored.length * MAX_DELETED_SHARE)
	) {
		throw new Error(
			`${deleted.length} of ${stored.length} ${target.kind} ids with stored data are missing from Postgres; refusing to purge`
		);
	}
	return {
		stored: stored.length,
		idle: deleted.filter((owner) => owner.recent === 0).map((o) => o.id),
		recent: deleted.filter((owner) => owner.recent !== 0).map((o) => o.id),
	};
}

async function purgeDeletedData(): Promise<void> {
	const acquired = await redis.set(
		PURGE_LOCK_KEY,
		"1",
		"EX",
		PURGE_LOCK_TTL_SECONDS,
		"NX"
	);
	if (acquired !== "OK") {
		return;
	}
	const run = createLogger({ service: "api", component: "deleted_data_purge" });
	for (const target of TARGETS) {
		let purged = 0;
		try {
			const { stored, idle, recent } = await findDeletedOwners(target);
			run.set({
				[target.kind]: { stored, idle: idle.length, deferred_ids: recent },
			});
			if (recent.length > 0) {
				run.warn(`Deferred deleted ${target.kind} ids still receiving data`);
			}
			await target.purge(idle, async (batch) => {
				for (const id of batch) {
					audit({
						action: "analytics_data.purged",
						actor: { type: "system", id: "deleted-data-purge" },
						target: { type: target.kind, id },
						reason: "owner_deleted",
					});
				}
				purged += batch.length;
				await flushBatchedApiDrain();
			});
		} catch (error) {
			run.error(error instanceof Error ? error : String(error), {
				[target.kind]: getErrorLogFields(error),
			});
		} finally {
			run.set({ [target.kind]: { purged } });
		}
	}
	run.emit({ _forceKeep: true });
}

export function startDeletedDataPurgeLoop() {
	let active: Promise<void> | null = null;
	const run = () => {
		active ??= purgeDeletedData()
			.catch((error) => {
				log.error({
					service: "api",
					component: "deleted_data_purge",
					...getErrorLogFields(error),
				});
			})
			.finally(() => {
				active = null;
			});
	};

	run();
	const timer = setInterval(run, PURGE_INTERVAL_SECONDS * 1000);
	timer.unref?.();

	return {
		stop: async () => {
			clearInterval(timer);
			await active;
		},
	};
}
