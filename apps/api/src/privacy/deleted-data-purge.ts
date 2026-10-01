import { type AnyColumn, db, sql } from "@databuddy/db";
import {
	listLinksWithStoredVisits,
	listOwnersWithStoredData,
	purgeAnalyticsData,
	purgeLinkVisits,
} from "@databuddy/db/clickhouse";
import { links, organization, user, websites } from "@databuddy/db/schema";
import { redis } from "@databuddy/redis";
import { getErrorLogFields } from "@databuddy/shared/evlog-fields";
import { audit, log } from "evlog";

const PURGE_INTERVAL_SECONDS = 6 * 60 * 60;
const PURGE_LOCK_KEY = "deleted-data-purge:lock";
// A missing or wrong Postgres would make every owner look deleted.
// ponytail: only one missing id can bypass the share guard; broader cleanup
// needs explicit deletion evidence.
const MAX_DELETED_SHARE = 0.25;
const MIN_DELETED_FOR_SHARE_GUARD = 1;

const isAnyOf = (column: AnyColumn, ids: string[]) =>
	sql`${column} = any(${sql.param(ids)})`;

const TARGETS = [
	{
		kind: "owner",
		listStored: listOwnersWithStoredData,
		listExisting: async (ids: string[]) =>
			(
				await Promise.all([
					db
						.select({ id: websites.id })
						.from(websites)
						.where(isAnyOf(websites.id, ids)),
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
		listStored: listLinksWithStoredVisits,
		listExisting: (ids: string[]) =>
			db.select({ id: links.id }).from(links).where(isAnyOf(links.id, ids)),
		purge: purgeLinkVisits,
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
		idle: deleted.filter((owner) => owner.recent === 0).map((o) => o.id),
		recent: deleted.filter((owner) => owner.recent !== 0).map((o) => o.id),
	};
}

async function purgeDeletedData(): Promise<void> {
	const acquired = await redis.set(
		PURGE_LOCK_KEY,
		"1",
		"EX",
		PURGE_INTERVAL_SECONDS,
		"NX"
	);
	if (acquired !== "OK") {
		return;
	}
	for (const target of TARGETS) {
		try {
			const { idle, recent } = await findDeletedOwners(target);
			await target.purge(idle);
			for (const id of idle) {
				audit({
					action: "analytics_data.purged",
					actor: { type: "system", id: "deleted-data-purge" },
					target: { type: target.kind, id },
					reason: "owner_deleted",
				});
			}
			if (recent.length > 0) {
				log.warn({
					service: "api",
					component: "deleted_data_purge",
					kind: target.kind,
					deferred_ids: recent,
				});
			}
		} catch (error) {
			log.error({
				service: "api",
				component: "deleted_data_purge",
				kind: target.kind,
				...getErrorLogFields(error),
			});
		}
	}
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
