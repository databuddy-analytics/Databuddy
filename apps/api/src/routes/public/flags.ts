import { and, db, eq, isNull, or } from "@databuddy/db";
import { flags } from "@databuddy/db/schema";
import { cacheable } from "@databuddy/redis";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import { LRUCache } from "lru-cache";
import { mergeWideEvent } from "@/lib/tracing";

const memCache = new LRUCache<string, object>({ max: 500, ttl: 5000 });

const NULL_SENTINEL = Object.freeze({ __null: true });

function fromMemory<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
	const cached = memCache.get(key);
	if (cached !== undefined) {
		return Promise.resolve((cached === NULL_SENTINEL ? null : cached) as T);
	}
	return fetcher().then((data) => {
		memCache.set(key, (data as object) ?? NULL_SENTINEL);
		return data;
	});
}

interface UserContext {
	email?: string;
	organizationId?: string;
	properties?: Record<string, unknown>;
	teamId?: string;
	userId?: string;
}

interface FlagRule {
	batch: boolean;
	batchValues?: string[];
	enabled: boolean;
	field?: string;
	operator: string;
	type: "user_id" | "email" | "property";
	value?: unknown;
	values?: unknown[];
}

interface FlagResult {
	enabled: boolean;
	payload: unknown;
	reason: string;
	value: boolean | string | number | unknown;
	variant?: string;
}

interface Variant {
	description?: string;
	key: string;
	type: "string" | "number";
	value: string | number;
	weight?: number;
}

interface TargetGroupData {
	id: string;
	rules: FlagRule[];
}

interface EvaluableFlag {
	defaultValue: string | number | boolean | unknown;
	key: string;
	payload?: unknown;
	resolvedTargetGroups?: TargetGroupData[];
	rolloutBy?: string | null;
	rolloutPercentage: number | null;
	rules?: FlagRule[] | unknown;
	status: "active" | "inactive" | "archived";
	targetGroupIds?: string[];
	type: "boolean" | "rollout" | "multivariant";
	variants?: Variant[];
}

const flagQuerySchema = t.Object({
	key: t.String(),
	clientId: t.String(),
	userId: t.Optional(t.String()),
	email: t.Optional(t.String()),
	organizationId: t.Optional(t.String()),
	teamId: t.Optional(t.String()),
	properties: t.Optional(t.String()),
	environment: t.Optional(t.String()),
});

const bulkFlagQuerySchema = t.Object({
	clientId: t.String(),
	keys: t.Optional(t.String()),
	userId: t.Optional(t.String()),
	email: t.Optional(t.String()),
	organizationId: t.Optional(t.String()),
	teamId: t.Optional(t.String()),
	properties: t.Optional(t.String()),
	environment: t.Optional(t.String()),
});

const getCachedFlag = cacheable(
	async (key: string, clientId: string, environment?: string) => {
		const scopeCondition = or(
			eq(flags.websiteId, clientId),
			eq(flags.organizationId, clientId)
		);

		const environmentCondition = environment
			? eq(flags.environment, environment)
			: isNull(flags.environment);

		const flag = await db.query.flags.findFirst({
			where: and(
				eq(flags.key, key),
				environmentCondition,
				isNull(flags.deletedAt),
				eq(flags.status, "active"),
				scopeCondition
			),
			with: {
				flagsToTargetGroups: {
					with: {
						targetGroup: true,
					},
				},
			},
		});

		if (!flag) {
			return null;
		}

		const resolvedTargetGroups: TargetGroupData[] = flag.flagsToTargetGroups
			.filter((ftg) => ftg.targetGroup && !ftg.targetGroup.deletedAt)
			.map((ftg) => ({
				id: ftg.targetGroup.id,
				rules: (ftg.targetGroup.rules as FlagRule[]) || [],
			}));

		return {
			...flag,
			resolvedTargetGroups,
		};
	},
	{
		expireInSec: 30,
		prefix: "flag",
		staleWhileRevalidate: true,
		staleTime: 15,
	}
);

const getCachedFlagsForClient = cacheable(
	async (clientId: string, environment?: string) => {
		const scopeCondition = or(
			eq(flags.websiteId, clientId),
			eq(flags.organizationId, clientId)
		);

		const environmentCondition = environment
			? eq(flags.environment, environment)
			: isNull(flags.environment);

		const flagsList = await db.query.flags.findMany({
			where: and(
				isNull(flags.deletedAt),
				eq(flags.status, "active"),
				environmentCondition,
				scopeCondition
			),
			with: {
				flagsToTargetGroups: {
					with: {
						targetGroup: true,
					},
				},
			},
		});

		return flagsList.map((flag) => {
			const resolvedTargetGroups: TargetGroupData[] = flag.flagsToTargetGroups
				.filter((ftg) => ftg.targetGroup && !ftg.targetGroup.deletedAt)
				.map((ftg) => ({
					id: ftg.targetGroup.id,
					rules: (ftg.targetGroup.rules as FlagRule[]) || [],
				}));

			return {
				...flag,
				resolvedTargetGroups,
			};
		});
	},
	{
		expireInSec: 30,
		prefix: "flags-client",
		staleWhileRevalidate: true,
		staleTime: 15,
	}
);

const getCachedFlagsForUser = cacheable(
	async (userId: string, environment?: string) => {
		const environmentCondition = environment
			? eq(flags.environment, environment)
			: isNull(flags.environment);

		const flagsList = await db.query.flags.findMany({
			where: and(
				isNull(flags.deletedAt),
				eq(flags.status, "active"),
				environmentCondition,
				eq(flags.userId, userId)
			),
			with: {
				flagsToTargetGroups: {
					with: {
						targetGroup: true,
					},
				},
			},
		});

		return flagsList.map((flag) => {
			const resolvedTargetGroups: TargetGroupData[] = flag.flagsToTargetGroups
				.filter((ftg) => ftg.targetGroup && !ftg.targetGroup.deletedAt)
				.map((ftg) => ({
					id: ftg.targetGroup.id,
					rules: (ftg.targetGroup.rules as FlagRule[]) || [],
				}));

			return {
				...flag,
				resolvedTargetGroups,
			};
		});
	},
	{
		expireInSec: 30,
		prefix: "flags-user",
		staleWhileRevalidate: true,
		staleTime: 15,
	}
);

export function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i += 1) {
		const char = str.charCodeAt(i);
		// biome-ignore lint: hash calculation requires bitwise operations
		hash = (hash << 5) - hash + char;
		// biome-ignore lint: hash calculation requires bitwise operations
		hash &= hash;
	}
	return Math.abs(hash);
}

export function parseProperties(
	propertiesJson?: string
): Record<string, unknown> {
	if (!propertiesJson) {
		return {};
	}

	try {
		return JSON.parse(propertiesJson);
	} catch (_error) {
		return {};
	}
}

export function evaluateStringRule(
	value: string | undefined,
	rule: FlagRule
): boolean {
	if (!value) {
		return false;
	}

	const { operator, value: ruleValue, values } = rule;
	const stringValue = String(ruleValue);

	switch (operator) {
		case "equals":
			return value === ruleValue;
		case "contains":
			return value.includes(stringValue);
		case "starts_with":
			return value.startsWith(stringValue);
		case "ends_with":
			return value.endsWith(stringValue);
		case "in":
			return Array.isArray(values) && values.includes(value);
		case "not_in":
			return Array.isArray(values) && !values.includes(value);
		default:
			return false;
	}
}

export function evaluateValueRule(value: unknown, rule: FlagRule): boolean {
	const { operator, value: ruleValue, values } = rule;

	switch (operator) {
		case "equals":
			return value === ruleValue;
		case "contains":
			return String(value).includes(String(ruleValue));
		case "in":
			return Array.isArray(values) && values.includes(value);
		case "not_in":
			return Array.isArray(values) && !values.includes(value);
		case "exists":
			return value !== undefined && value !== null;
		case "not_exists":
			return value === undefined || value === null;
		default:
			return false;
	}
}

function getContextValue(
	rule: FlagRule,
	context: UserContext
): string | undefined {
	if (rule.type === "user_id") {
		return context.userId;
	}
	if (rule.type === "email") {
		return context.email;
	}
	if (rule.field) {
		return String(context.properties?.[rule.field] ?? "");
	}
	return undefined;
}

export function evaluateRule(rule: FlagRule, context: UserContext): boolean {
	if (rule.batch && rule.batchValues?.length) {
		const contextValue = getContextValue(rule, context);

		if (rule.operator === "in" || rule.operator === "not_in") {
			const isInList = contextValue
				? rule.batchValues.includes(contextValue)
				: false;
			return rule.operator === "not_in" ? !isInList : isInList;
		}

		if (!contextValue) {
			return false;
		}

		for (const batchVal of rule.batchValues) {
			if (
				evaluateStringRule(contextValue, {
					...rule,
					value: batchVal,
					values: undefined,
				})
			) {
				return true;
			}
		}
		return false;
	}

	switch (rule.type) {
		case "user_id":
			return evaluateStringRule(context.userId, rule);
		case "email":
			return evaluateStringRule(context.email, rule);
		case "property": {
			if (!rule.field) {
				if (typeof rule.value === "number") {
					const userId = context.userId || context.email || "anonymous";
					const hash = hashString(`percentage:${userId}`);
					const percentage = hash % 100;
					return percentage < rule.value;
				}
				return false;
			}
			const propertyValue = context.properties?.[rule.field];
			return evaluateValueRule(propertyValue, rule);
		}
		default:
			return false;
	}
}

export function selectVariant(
	flag: EvaluableFlag,
	context: UserContext
): { value: string | number | boolean | unknown; variant: string } {
	if (!flag.variants || flag.variants.length === 0) {
		return { value: flag.defaultValue, variant: "default" };
	}

	const identifier = context.userId || context.email || "anonymous";
	const hash = hashString(`${flag.key}:variant:${identifier}`);
	const percentage = hash % 100;

	const hasAnyWeight = flag.variants.some(
		(v: Variant) => typeof v?.weight === "number"
	);

	if (!hasAnyWeight) {
		const idx = hash % flag.variants.length;
		const selected = flag.variants[idx];
		if (!selected) {
			return { value: flag.defaultValue, variant: "default" };
		}
		return { value: selected.value, variant: selected.key };
	}

	let cumulative = 0;
	for (const variant of flag.variants) {
		cumulative += typeof variant.weight === "number" ? variant.weight : 0;
		if (percentage < cumulative) {
			return { value: variant.value, variant: variant.key };
		}
	}

	const lastVariant = flag.variants.at(-1);
	if (!lastVariant) {
		return { value: flag.defaultValue, variant: "default" };
	}
	return { value: lastVariant.value, variant: lastVariant.key };
}

export function evaluateFlag(
	flag: EvaluableFlag,
	context: UserContext
): FlagResult {
	if (flag.rules && Array.isArray(flag.rules) && flag.rules.length > 0) {
		for (const rule of flag.rules as FlagRule[]) {
			if (evaluateRule(rule, context)) {
				return {
					enabled: rule.enabled,
					value: rule.enabled,
					payload: rule.enabled ? flag.payload : null,
					reason: "USER_RULE_MATCH",
				};
			}
		}
	}

	if (flag.resolvedTargetGroups && flag.resolvedTargetGroups.length > 0) {
		for (const group of flag.resolvedTargetGroups) {
			if (group.rules && Array.isArray(group.rules)) {
				for (const rule of group.rules) {
					if (evaluateRule(rule, context)) {
						return {
							enabled: rule.enabled,
							value: rule.enabled,
							payload: rule.enabled ? flag.payload : null,
							reason: "TARGET_GROUP_MATCH",
						};
					}
				}
			}
		}
	}

	if (
		flag.type === "multivariant" &&
		flag.variants &&
		flag.variants.length > 0
	) {
		const { value, variant } = selectVariant(flag, context);
		return {
			enabled: true,
			value,
			variant,
			payload: flag.payload,
			reason: "MULTIVARIANT_EVALUATED",
		};
	}

	let enabled = Boolean(flag.defaultValue);
	let value = enabled;
	let reason = "DEFAULT_VALUE";

	if (flag.type === "rollout") {
		let identifier: string;

		switch (flag.rolloutBy) {
			case "organization":
				identifier = context.organizationId || "anonymous";
				break;
			case "team":
				identifier = context.teamId || "anonymous";
				break;
			default:
				identifier = context.userId || context.email || "anonymous";
		}

		const hash = hashString(`${flag.key}:${identifier}`);
		const percentage = hash % 100;
		const rolloutPercentage = flag.rolloutPercentage || 0;

		enabled = percentage < rolloutPercentage;
		value = enabled;
		reason = enabled ? "ROLLOUT_ENABLED" : "ROLLOUT_DISABLED";
	} else {
		enabled = Boolean(flag.defaultValue);
		value = enabled;
		reason = "BOOLEAN_DEFAULT";
	}

	return {
		enabled,
		value,
		payload: enabled ? flag.payload : null,
		reason,
	};
}

const FLAG_CACHE_CONTROL =
	"public, max-age=15, s-maxage=30, stale-while-revalidate=15";

export const flagsRoute = new Elysia({ prefix: "/v1/flags" })
	.onAfterHandle(({ set }) => {
		if (!set.status || set.status === 200) {
			set.headers["cache-control"] = FLAG_CACHE_CONTROL;
		}
		set.headers.vary = "Origin";
	})
	.get(
		"/evaluate",
		async function evaluateFlagEndpoint({ query, set }) {
			mergeWideEvent({
				flag_key: query.key || "",
				flag_client_id: query.clientId || "",
				flag_has_user_id: Boolean(query.userId),
				flag_has_email: Boolean(query.email),
				flag_environment: query.environment || "",
			});

			try {
				if (!(query.key && query.clientId)) {
					mergeWideEvent({ flag_error: "missing_params" });
					set.status = 400;
					return {
						enabled: false,
						value: false,
						payload: null,
						reason: "MISSING_REQUIRED_PARAMS",
					};
				}

				const context: UserContext = {
					userId: query.userId,
					email: query.email,
					organizationId: query.organizationId,
					teamId: query.teamId,
					properties: parseProperties(query.properties),
				};

				let flag = await fromMemory(
					`f:${query.key}:${query.clientId}:${query.environment || ""}`,
					() => getCachedFlag(query.key, query.clientId, query.environment)
				);

				if (!flag && context.userId) {
					const uid = context.userId;
					const userFlags = await fromMemory(
						`fu:${uid}:${query.environment || ""}`,
						() => getCachedFlagsForUser(uid, query.environment)
					);
					flag = userFlags.find((f) => f.key === query.key) ?? null;
				}

				if (!flag) {
					mergeWideEvent({ flag_found: false });
					return {
						enabled: false,
						value: false,
						payload: null,
						reason: "FLAG_NOT_FOUND",
					};
				}

				const result = evaluateFlag(flag as unknown as EvaluableFlag, context);
				mergeWideEvent({
					flag_found: true,
					flag_type: flag.type,
					flag_enabled: result.enabled,
					flag_reason: result.reason,
				});

				return result;
			} catch (error) {
				mergeWideEvent({ flag_error: true });
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ flags: { key: query.key, clientId: query.clientId } }
				);
				set.status = 500;
				return {
					enabled: false,
					value: false,
					payload: null,
					reason: "EVALUATION_ERROR",
				};
			}
		},
		{ query: flagQuerySchema }
	)

	.get(
		"/bulk",
		async function bulkEvaluateFlags({ query, set }) {
			mergeWideEvent({
				flag_bulk: true,
				flag_client_id: query.clientId || "",
				flag_has_user_id: Boolean(query.userId),
				flag_has_email: Boolean(query.email),
				flag_environment: query.environment || "",
			});

			try {
				if (!query.clientId) {
					mergeWideEvent({ flag_error: "missing_client_id" });
					set.status = 400;
					return {
						flags: {},
						count: 0,
						error: "Missing required clientId parameter",
					};
				}

				const context: UserContext = {
					userId: query.userId,
					email: query.email,
					organizationId: query.organizationId,
					teamId: query.teamId,
					properties: parseProperties(query.properties),
				};

				const requestedKeys = query.keys
					? new Set(
							query.keys
								.split(",")
								.map((k) => k.trim())
								.filter(Boolean)
						)
					: null;

				const clientFlags = await fromMemory(
					`fc:${query.clientId}:${query.environment || ""}`,
					() => getCachedFlagsForClient(query.clientId, query.environment)
				);

				let allFlags = clientFlags;

				if (context.userId) {
					const uid = context.userId;
					const userFlags = await fromMemory(
						`fu:${uid}:${query.environment || ""}`,
						() => getCachedFlagsForUser(uid, query.environment)
					);
					if (userFlags.length > 0) {
						const clientKeys = new Set(clientFlags.map((f) => f.key));
						const uniqueUserFlags = userFlags.filter(
							(f) => !clientKeys.has(f.key)
						);
						allFlags = [...clientFlags, ...uniqueUserFlags];
					}
				}

				const flagsToEvaluate = requestedKeys
					? allFlags.filter((f) => requestedKeys.has(f.key))
					: allFlags;

				const results: Record<string, FlagResult> = {};
				for (const flag of flagsToEvaluate) {
					results[flag.key] = evaluateFlag(
						flag as unknown as EvaluableFlag,
						context
					);
				}

				const count = Object.keys(results).length;
				mergeWideEvent({
					flag_total_flags: allFlags.length,
					flag_evaluated: flagsToEvaluate.length,
					flag_count: count,
				});

				return { flags: results, count };
			} catch (error) {
				mergeWideEvent({ flag_error: true });
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ flags: { bulk: true, clientId: query.clientId } }
				);
				set.status = 500;
				return { flags: {}, count: 0, error: "Bulk evaluation failed" };
			}
		},
		{ query: bulkFlagQuerySchema }
	)

	.get(
		"/definitions",
		async function getDefinitionsEndpoint({ query, set }) {
			mergeWideEvent({
				flag_client_id: query.clientId || "",
				flag_environment: query.environment || "",
			});

			try {
				if (!query.clientId) {
					mergeWideEvent({ flag_error: "missing_client_id" });
					set.status = 400;
					return { flags: [], error: "Missing required clientId parameter" };
				}

				const clientFlags = await fromMemory(
					`fc:${query.clientId}:${query.environment || ""}`,
					() => getCachedFlagsForClient(query.clientId, query.environment)
				);

				const allFlags = clientFlags;

				mergeWideEvent({ flag_total_flags: allFlags.length });

				return {
					flags: allFlags.map((flag) => ({
						key: flag.key,
						description: flag.description,
						type: flag.type,
						variants: flag.variants,
						createdAt: flag.createdAt,
						updatedAt: flag.updatedAt,
					})),
					count: allFlags.length,
				};
			} catch (error) {
				mergeWideEvent({ flag_error: true });
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ flags: { definitions: true, clientId: query.clientId } }
				);
				set.status = 500;
				return { flags: [], error: "Failed to fetch flag definitions" };
			}
		},
		{
			query: t.Object({
				clientId: t.String(),
				environment: t.Optional(t.String()),
			}),
		}
	)

	.get("/health", () => ({
		service: "flags",
		status: "ok",
		version: "1.0.0",
	}));
