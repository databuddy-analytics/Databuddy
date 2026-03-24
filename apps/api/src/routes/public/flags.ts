import { and, db, eq, flags, isNull, or } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import { mergeWideEvent } from "@/lib/tracing";

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
	userId: t.Optional(t.String()),
	email: t.Optional(t.String()),
	organizationId: t.Optional(t.String()),
	teamId: t.Optional(t.String()),
	properties: t.Optional(t.String()),
	environment: t.Optional(t.String()),
});

interface UserContext {
	userId?: string;
	email?: string;
	organizationId?: string;
	teamId?: string;
	properties?: Record<string, unknown>;
}

interface FlagRule {
	type: "user_id" | "email" | "property";
	operator: string;
	field?: string;
	value?: unknown;
	values?: unknown[];
	enabled: boolean;
	batch: boolean;
	batchValues?: string[];
}

interface FlagResult {
	enabled: boolean;
	value: boolean | string | number | unknown;
	payload: unknown;
	reason: string;
	variant?: string;
}

interface Variant {
	key: string;
	value: string | number;
	weight?: number;
	description?: string;
	type: "string" | "number";
}

interface TargetGroupData {
	id: string;
	rules: FlagRule[];
}

/** Flag type for evaluation - includes database fields not in the form schema */
interface EvaluableFlag {
	key: string;
	type: "boolean" | "rollout" | "multivariant";
	status: "active" | "inactive" | "archived";
	defaultValue: string | number | boolean | unknown;
	rolloutPercentage: number | null;
	rolloutBy?: string | null;
	rules?: FlagRule[] | unknown;
	variants?: Variant[];
	payload?: unknown;
	targetGroupIds?: string[];
	resolvedTargetGroups?: TargetGroupData[];
}

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

		// Map the nested relation to a flat array
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

		// Map the nested relations to flat arrays
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

	// Regular evaluation
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

	// Otherwise use weighted selection (weights may be 0 for some variants)
	let cumulative = 0;
	for (const variant of flag.variants) {
		cumulative += typeof variant.weight === "number" ? variant.weight : 0;
		if (percentage < cumulative) {
			return { value: variant.value, variant: variant.key };
		}
	}

	// If no weighted match, fall back to last variant
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
	// Check direct flag rules first
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

	// Check target group rules - if user matches any group rule, enable the flag
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
			enabled: true, // Variants are always "enabled"
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
				// Default: user-based rollout
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

export const flagsRoute = new Elysia({ prefix: "/v1/flags" })
	.get(
		"/evaluate",
		function evaluateFlagEndpoint({ query, set }) {
			return (async (): Promise<FlagResult> => {
				mergeWideEvent({
					flag_key: query.key || "missing",
					flag_client_id: query.clientId || "missing",
					flag_has_user_id: Boolean(query.userId),
					flag_has_email: Boolean(query.email),
					flag_environment: query.environment || "missing",
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

					useLogger().set({
						flags: {
							evaluationRequest: {
								key: query.key,
								clientId: query.clientId,
								userId: query.userId,
								email: query.email,
								environment: query.environment,
							},
						},
					});

					const flag = await getCachedFlag(
						query.key,
						query.clientId,
						query.environment
					);

					if (!flag) {
						mergeWideEvent({ flag_found: false });
						return {
							enabled: false,
							value: false,
							payload: null,
							reason: "FLAG_NOT_FOUND",
						};
					}

					const result = evaluateFlag(
						{
							defaultValue: flag.defaultValue,
							key: flag.key,
							type: flag.type,
							status: flag.status,
							rolloutPercentage: flag.rolloutPercentage,
							rolloutBy: flag.rolloutBy,
							rules: flag.rules,
							variants: flag.variants as Variant[],
							payload: flag.payload,
							targetGroupIds: flag.targetGroupIds as string[],
							resolvedTargetGroups: flag.resolvedTargetGroups,
						},
						context
					);
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
			})();
		},
		{ query: flagQuerySchema }
	)

	.get(
		"/bulk",
		function bulkEvaluateFlags({ query, set }) {
			return (async () => {
				mergeWideEvent({
					flag_bulk: true,
					flag_client_id: query.clientId || "missing",
					flag_has_user_id: Boolean(query.userId),
					flag_has_email: Boolean(query.email),
					flag_environment: query.environment || "missing",
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

					const allFlags = await getCachedFlagsForClient(
						query.clientId,
						query.environment
					);

					mergeWideEvent({
						flag_total_flags: allFlags.length,
					});

					const enabledFlags: Record<string, FlagResult> = {};

					mergeWideEvent({ flag_count: allFlags.length });
					for (const flag of allFlags) {
						const result = evaluateFlag(
							flag as unknown as EvaluableFlag,
							context
						);
						if (result.enabled) {
							enabledFlags[flag.key] = result;
						}
					}

					mergeWideEvent({
						flag_enabled_count: Object.keys(enabledFlags).length,
					});

					return {
						flags: enabledFlags,
						count: Object.keys(enabledFlags).length,
						timestamp: new Date().toISOString(),
					};
				} catch (error) {
					mergeWideEvent({ flag_error: true });
					useLogger().error(
						error instanceof Error ? error : new Error(String(error)),
						{ flags: { bulk: true, clientId: query.clientId } }
					);
					set.status = 500;
					return {
						flags: {},
						count: 0,
						error: "Bulk evaluation failed",
					};
				}
			})();
		},
		{ query: bulkFlagQuerySchema }
	)

	.get(
		"/definitions",
		function getDefinitionsEndpoint({ query, set }) {
			return (async () => {
				mergeWideEvent({
					flag_client_id: query.clientId || "missing",
					flag_environment: query.environment || "missing",
				});

				try {
					if (!query.clientId) {
						mergeWideEvent({ flag_error: "missing_client_id" });
						set.status = 400;
						return {
							flags: [],
							error: "Missing required clientId parameter",
						};
					}

					const allFlags = await getCachedFlagsForClient(
						query.clientId,
						query.environment
					);

					mergeWideEvent({
						flag_total_flags: allFlags.length,
					});

					// Return flag definitions without evaluation
					const flagDefinitions = allFlags.map((flag) => ({
						key: flag.key,
						description: flag.description,
						type: flag.type,
						variants: flag.variants,
						createdAt: flag.createdAt,
						updatedAt: flag.updatedAt,
					}));

					return {
						flags: flagDefinitions,
						count: flagDefinitions.length,
						timestamp: new Date().toISOString(),
					};
				} catch (error) {
					mergeWideEvent({ flag_error: true });
					useLogger().error(
						error instanceof Error ? error : new Error(String(error)),
						{ flags: { definitions: true, clientId: query.clientId } }
					);
					set.status = 500;
					return {
						flags: [],
						error: "Failed to fetch flag definitions",
					};
				}
			})();
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
		timestamp: new Date().toISOString(),
	}));
