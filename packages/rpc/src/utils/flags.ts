import {
	and,
	arrayContains,
	db,
	eq,
	inArray,
	isNull,
	withTransaction,
} from "@databuddy/db";
import { flagChangeEvents, flags } from "@databuddy/db/schema";
import {
	createDrizzleCache,
	invalidateFlagReadCaches,
	redis,
} from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { log } from "evlog";

const flagsCache = createDrizzleCache({ redis, namespace: "flags" });

export const getScope = (
	websiteId?: string | null,
	organizationId?: string | null
) => (websiteId ? `website:${websiteId}` : `org:${organizationId}`);

export const invalidateFlagEvaluationCaches = async (clientId: string) => {
	await invalidateFlagReadCaches({ clientId });
};

export const invalidateFlagCache = async (
	id: string,
	websiteId?: string | null,
	organizationId?: string | null,
	flagKey?: string,
	userId?: string | null
) => {
	const clientId = websiteId || organizationId;

	let key = flagKey;
	let scopedUserId = userId;
	if ((!key || scopedUserId === undefined) && clientId) {
		const result = await db
			.select({ key: flags.key, userId: flags.userId })
			.from(flags)
			.where(eq(flags.id, id))
			.limit(1);
		key = key ?? result[0]?.key;
		scopedUserId = scopedUserId ?? result[0]?.userId;
	}

	const scope = getScope(websiteId, organizationId);
	const invalidations: Promise<unknown>[] = [
		flagsCache.invalidateByTables(["flags"]),
		flagsCache.invalidateByKey(`byId:${id}:${scope}`),
	];

	if (clientId) {
		invalidations.push(
			invalidateFlagReadCaches({
				clientId,
				flagKey: key,
				userId: scopedUserId,
			})
		);
	}

	await Promise.allSettled(invalidations);
};

export const getScopeCondition = (
	websiteId?: string | null,
	organizationId?: string | null,
	userId?: string,
	table: typeof flags = flags
) => {
	if (websiteId) {
		return eq(table.websiteId, websiteId);
	}
	if (organizationId) {
		return eq(table.organizationId, organizationId);
	}
	if (userId) {
		return eq(table.userId, userId);
	}
	return eq(table.organizationId, "");
};

function buildFlagChangeSnapshot(flag: {
	defaultValue: boolean;
	dependencies?: string[] | null;
	description?: string | null;
	environment?: string | null;
	key: string;
	name?: string | null;
	persistAcrossAuth: boolean;
	rolloutBy?: string | null;
	rolloutPercentage?: number | null;
	status: "active" | "inactive" | "archived";
	type: "boolean" | "rollout" | "multivariant";
	variants?: Array<{
		description?: string;
		key: string;
		type: "string" | "number" | "json";
		value: unknown;
		weight?: number;
	}> | null;
}) {
	return {
		key: flag.key,
		name: flag.name ?? null,
		description: flag.description ?? null,
		type: flag.type,
		status: flag.status,
		defaultValue: flag.defaultValue,
		persistAcrossAuth: flag.persistAcrossAuth,
		rolloutPercentage: flag.rolloutPercentage ?? null,
		rolloutBy: flag.rolloutBy ?? null,
		environment: flag.environment ?? null,
		dependencies: flag.dependencies ?? [],
		variants: flag.variants ?? [],
	};
}

interface FlagUpdateDependencyCascadingParams {
	changedBy?: string;
	updatedFlag: {
		id: string;
		status: "active" | "inactive" | "archived";
		websiteId: string | null;
		organizationId: string | null;
		key: string;
	};
	userId?: string;
}

const MAX_CASCADE_DEPTH = 10;

interface CascadeInvalidation {
	flagId: string;
	key: string;
	organizationId: string | null;
	websiteId: string | null;
}

interface CascadeContext {
	changedBy?: string;
	invalidations: CascadeInvalidation[];
	tx: Parameters<Parameters<typeof withTransaction>[0]>[0];
	userId?: string;
	visited: Set<string>;
}

async function cascadeFlagStatus(
	ctx: CascadeContext,
	updatedFlag: FlagUpdateDependencyCascadingParams["updatedFlag"],
	depth: number
): Promise<void> {
	if (updatedFlag.status === "archived" || depth >= MAX_CASCADE_DEPTH) {
		return;
	}
	if (ctx.visited.has(updatedFlag.id)) {
		return;
	}
	ctx.visited.add(updatedFlag.id);

	const dependentFlags = await ctx.tx
		.select()
		.from(flags)
		.where(
			and(
				getScopeCondition(
					updatedFlag.websiteId,
					updatedFlag.organizationId,
					ctx.userId
				),
				isNull(flags.deletedAt),
				arrayContains(flags.dependencies, [updatedFlag.key])
			)
		)
		.for("update");

	if (dependentFlags.length === 0) {
		return;
	}

	const flagsToUpdate: Array<{
		id: string;
		key: string;
		newStatus: "active" | "inactive";
	}> = [];

	if (updatedFlag.status === "inactive") {
		for (const depFlag of dependentFlags) {
			if (depFlag.status === "active") {
				flagsToUpdate.push({
					id: depFlag.id,
					key: depFlag.key,
					newStatus: "inactive",
				});
			}
		}
	} else {
		const potentialActivations = dependentFlags.filter(
			(depFlag) => depFlag.status === "inactive"
		);

		const allDepKeys = new Set(
			potentialActivations.flatMap((f) => (f.dependencies as string[]) ?? [])
		);
		const allDepFlags = allDepKeys.size
			? await ctx.tx
					.select()
					.from(flags)
					.where(
						and(
							inArray(flags.key, [...allDepKeys]),
							getScopeCondition(
								updatedFlag.websiteId,
								updatedFlag.organizationId,
								ctx.userId
							),
							isNull(flags.deletedAt)
						)
					)
			: [];
		const depFlagsByKey = new Map(allDepFlags.map((f) => [f.key, f]));

		for (const depFlag of potentialActivations) {
			const deps = (depFlag.dependencies as string[]) ?? [];
			const allActive = deps.every(
				(key) => depFlagsByKey.get(key)?.status === "active"
			);
			if (allActive) {
				flagsToUpdate.push({
					id: depFlag.id,
					key: depFlag.key,
					newStatus: "active",
				});
			}
		}
	}

	if (flagsToUpdate.length === 0) {
		return;
	}

	const now = new Date();
	await Promise.all(
		flagsToUpdate.map((flagUpdate) =>
			ctx.tx
				.update(flags)
				.set({ status: flagUpdate.newStatus, updatedAt: now })
				.where(eq(flags.id, flagUpdate.id))
		)
	);

	if (ctx.changedBy) {
		const auditRows = flagsToUpdate.flatMap((flagUpdate) => {
			const affectedFlag = dependentFlags.find((f) => f.id === flagUpdate.id);
			if (!affectedFlag) {
				return [];
			}
			return [
				{
					id: randomUUIDv7(),
					flagId: affectedFlag.id,
					websiteId: affectedFlag.websiteId,
					organizationId: affectedFlag.organizationId,
					changeType: "dependency_cascade" as const,
					before: buildFlagChangeSnapshot(affectedFlag),
					after: buildFlagChangeSnapshot({
						...affectedFlag,
						status: flagUpdate.newStatus,
					}),
					changedBy: ctx.changedBy as string,
				},
			];
		});
		if (auditRows.length > 0) {
			await ctx.tx.insert(flagChangeEvents).values(auditRows);
		}
	}

	for (const flagUpdate of flagsToUpdate) {
		const affectedFlag = dependentFlags.find((f) => f.id === flagUpdate.id);
		if (!affectedFlag) {
			continue;
		}
		ctx.invalidations.push({
			flagId: flagUpdate.id,
			websiteId: affectedFlag.websiteId,
			organizationId: affectedFlag.organizationId,
			key: flagUpdate.key,
		});
		await cascadeFlagStatus(
			ctx,
			{ ...affectedFlag, status: flagUpdate.newStatus },
			depth + 1
		);
	}
}

export async function handleFlagUpdateDependencyCascading(
	params: FlagUpdateDependencyCascadingParams
) {
	const { updatedFlag, userId, changedBy } = params;
	const invalidations: CascadeContext["invalidations"] = [];

	try {
		await withTransaction(async (tx) => {
			await cascadeFlagStatus(
				{ tx, userId, changedBy, visited: new Set(), invalidations },
				updatedFlag,
				0
			);
		});
	} catch (error) {
		log.error({
			service: "flag-service",
			message: "Failed to cascade flag updates",
			error,
			flagId: updatedFlag.id,
			flagKey: updatedFlag.key,
		});
		throw error;
	}

	await Promise.all(
		invalidations.map((job) =>
			invalidateFlagCache(
				job.flagId,
				job.websiteId,
				job.organizationId,
				job.key
			)
		)
	);
}
