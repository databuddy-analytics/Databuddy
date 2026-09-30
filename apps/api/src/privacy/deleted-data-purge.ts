import { db, inArray } from "@databuddy/db";
import {
	listLinksWithStoredVisits,
	listOwnersWithStoredData,
	purgeAnalyticsData,
	purgeLinkVisits,
	type StoredDataOwner,
} from "@databuddy/db/clickhouse";
import { links, organization, user, websites } from "@databuddy/db/schema";
import { redis } from "@databuddy/redis";
import { getErrorLogFields } from "@databuddy/shared/evlog-fields";
import { log } from "evlog";

const PURGE_INTERVAL_SECONDS = 6 * 60 * 60;
const PURGE_LOCK_KEY = "deleted-data-purge:lock";
// A missing or wrong Postgres would make every owner look deleted.
const MAX_DELETED_SHARE = 0.25;
const EXISTENCE_CHUNK_SIZE = 10_000;

interface PurgeTarget {
	kind: "owner" | "link";
	listExisting: (ids: string[]) => Promise<{ id: string }[]>;
	listStored: () => Promise<StoredDataOwner[]>;
	purge: (ids: string[]) => Promise<void>;
}

const TARGETS: PurgeTarget[] = [
	{
		kind: "owner",
		listStored: listOwnersWithStoredData,
		listExisting: async (ids) =>
			(
				await Promise.all([
					db
						.select({ id: websites.id })
						.from(websites)
						.where(inArray(websites.id, ids)),
					db
						.select({ id: organization.id })
						.from(organization)
						.where(inArray(organization.id, ids)),
					db.select({ id: user.id }).from(user).where(inArray(user.id, ids)),
				])
			).flat(),
		purge: purgeAnalyticsData,
	},
	{
		kind: "link",
		listStored: listLinksWithStoredVisits,
		listExisting: (ids) =>
			db.select({ id: links.id }).from(links).where(inArray(links.id, ids)),
		purge: purgeLinkVisits,
	},
];

async function findDeletedOwners(target: PurgeTarget) {
	const stored = await target.listStored();
	const existing = new Set<string>();
	for (let i = 0; i < stored.length; i += EXISTENCE_CHUNK_SIZE) {
		const ids = stored.slice(i, i + EXISTENCE_CHUNK_SIZE).map((o) => o.id);
		for (const row of await target.listExisting(ids)) {
			existing.add(row.id);
		}
	}
	const deleted = stored.filter((owner) => !existing.has(owner.id));
	if (deleted.length > stored.length * MAX_DELETED_SHARE) {
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
			if (idle.length > 0 || recent.length > 0) {
				log.info({
					service: "api",
					component: "deleted_data_purge",
					kind: target.kind,
					purged_count: idle.length,
					purged_ids: idle,
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

export interface DeletedDataPurgeLoop {
	stop(): Promise<void>;
}

export function startDeletedDataPurgeLoop(): DeletedDataPurgeLoop {
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
