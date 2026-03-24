import {
	and,
	arrayContains,
	db,
	eq,
	flags,
	inArray,
	isNull,
} from "@databuddy/db";
import {
	createDrizzleCache,
	invalidateCacheableWithArgs,
	redis,
} from "@databuddy/redis";
import { log } from "evlog";

const flagsCache = createDrizzleCache({ redis, namespace: "flags" });

export const getScope = (
	websiteId?: string | null,
	organizationId?: string | null
) => (websiteId ? `website:${websiteId}` : `org:${organizationId}`);

export const invalidateFlagCache = async (
	id: string,
	websiteId?: string | null,
	organizationId?: string | null,
	flagKey?: string
) => {
	const clientId = websiteId || organizationId;

	let key = flagKey;
	if (!key && clientId) {
		const result = await db
			.select({ key: flags.key })
			.from(flags)
			.where(eq(flags.id, id))
			.limit(1);
		key = result[0]?.key;
	}

	const scope = getScope(websiteId, organizationId);
	const invalidations: Promise<unknown>[] = [
		flagsCache.invalidateByTables(["flags"]),
		flagsCache.invalidateByKey(`byId:${id}:${scope}`),
	];

	if (clientId) {
		if (key) {
			invalidations.push(invalidateCacheableWithArgs("flag", [key, clientId]));
		}
		invalidations.push(invalidateCacheableWithArgs("flags-client", [clientId]));
	}

	await Promise.allSettled(invalidations);
};

export const getScopeCondition = (
	websiteId?: string | null,
	organizationId?: string | null,
	userId?: string
) => {
	if (websiteId) {
		return eq(flags.websiteId, websiteId);
	}
	if (organizationId) {
		return eq(flags.organizationId, organizationId);
	}
	if (userId) {
		return eq(flags.userId, userId);
	}
	return eq(flags.organizationId, "");
};

interface FlagUpdateDependencyCascadingParams {
	updatedFlag: {
		id: string;
		status: "active" | "inactive" | "archived";
		websiteId: string | null;
		organizationId: string | null;
		key: string;
	};
	userId?: string;
}

export async function handleFlagUpdateDependencyCascading(
	params: FlagUpdateDependencyCascadingParams
) {
	const { updatedFlag, userId } = params;
	try {
		if (updatedFlag.status !== "archived") {
			const dependentFlags = await db
				.select()
				.from(flags)
				.where(
					and(
						getScopeCondition(
							updatedFlag.websiteId,
							updatedFlag.organizationId,
							userId
						),
						isNull(flags.deletedAt),
						arrayContains(flags.dependencies, [updatedFlag.key])
					)
				);

			if (dependentFlags.length > 0) {
				const flagsToUpdate: Array<{
					id: string;
					key: string;
					newStatus: "active" | "inactive";
				}> = [];

				if (updatedFlag.status === "inactive") {
					const flagsToDeactivate = dependentFlags.filter(
						(depFlag) => depFlag.status === "active"
					);

					flagsToUpdate.push(
						...flagsToDeactivate.map((f) => ({
							id: f.id,
							key: f.key,
							newStatus: "inactive" as const,
						}))
					);
				} else if (updatedFlag.status === "active") {
					const potentialActivations = dependentFlags.filter(
						(depFlag) => depFlag.status === "inactive"
					);

					const allDepKeys = new Set(
						potentialActivations.flatMap(
							(f) => (f.dependencies as string[]) ?? []
						)
					);
					const allDepFlags = await db
						.select()
						.from(flags)
						.where(
							and(
								inArray(flags.key, [...allDepKeys]),
								getScopeCondition(
									updatedFlag.websiteId,
									updatedFlag.organizationId,
									userId
								),
								isNull(flags.deletedAt)
							)
						);
					const depFlagsByKey = new Map(allDepFlags.map((f) => [f.key, f]));

					for (const depFlag of potentialActivations) {
						const deps = (depFlag.dependencies as string[]) ?? [];
						const allDependenciesActive = deps.every((key) => {
							const dep = depFlagsByKey.get(key);
							return dep && dep.status === "active";
						});

						if (allDependenciesActive) {
							flagsToUpdate.push({
								id: depFlag.id,
								key: depFlag.key,
								newStatus: "active",
							});
						}
					}
				}

				if (flagsToUpdate.length > 0) {
					await Promise.all(
						flagsToUpdate.map((flagUpdate) =>
							db
								.update(flags)
								.set({
									status: flagUpdate.newStatus,
									updatedAt: new Date(),
								})
								.where(eq(flags.id, flagUpdate.id))
						)
					);

					await Promise.all(
						flagsToUpdate.map((flagUpdate) => {
							const affectedFlag = dependentFlags.find(
								(f) => f.id === flagUpdate.id
							);
							return invalidateFlagCache(
								flagUpdate.id,
								affectedFlag?.websiteId,
								affectedFlag?.organizationId,
								flagUpdate.key
							);
						})
					);

					for (const flagUpdate of flagsToUpdate) {
						const affectedFlag = dependentFlags.find(
							(f) => f.id === flagUpdate.id
						);
						if (affectedFlag) {
							await handleFlagUpdateDependencyCascading({
								updatedFlag: { ...affectedFlag, status: flagUpdate.newStatus },
								userId,
							});
						}
					}
				}
			}
		}
	} catch (error) {
		log.error({
			service: "shared-flags",
			message: "Failed to cascade flag updates",
			error,
			flagId: updatedFlag.id,
			flagKey: updatedFlag.key,
		});
		throw error;
	}
}
