import { and, db, eq, flags, isNull, or } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { Elysia, t } from "elysia";
import { logger } from "@/lib/logger";
import { record, setAttributes } from "@/lib/tracing";

const flagQuerySchema = t.Object({
	key: t.String(),
	clientId: t.String(),
	userId: t.Optional(t.String()),
	email: t.Optional(t.String()),
	properties: t.Optional(t.String()),
	environment: t.Optional(t.String()),
});

const bulkFlagQuerySchema = t.Object({
	clientId: t.String(),
	userId: t.Optional(t.String()),
	email: t.Optional(t.String()),
	properties: t.Optional(t.String()),
	environment: t.Optional(t.String()),
});

type UserContext = {
	userId?: string;
	email?: string;
	properties?: Record<string, unknown>;
};

type FlagRule = {
	type: "user_id" | "email" | "property";
	operator: string;
	field?: string;
	value?: unknown;
	values?: unknown[];
	enabled: boolean;
	batch: boolean;
	batchValues?: string[];
};

type FlagResult = {
	enabled: boolean;
	value: boolean | string | number;
	payload: unknown;
	reason: string;
	variant?: string;
};

type Variant = {
	key: string;
	value: string | number;
	weight?: number;
	description?: string;
	type: "string" | "number";
};

/** Flag type for evaluation - includes database fields not in the form schema */
type EvaluableFlag = {
	key: string;
	type: "boolean" | "rollout" | "multivariant";
	status: "active" | "inactive" | "archived";
	defaultValue: boolean;
	rolloutPercentage: number;
	rules?: FlagRule[];
	variants?: Variant[];
	payload?: unknown;
};

const getCachedFlag = cacheable(
	(key: string, clientId: string, environment?: string) => {
		const scopeCondition = or(
			eq(flags.websiteId, clientId),
			eq(flags.organizationId, clientId)
		);

		const environmentCondition = environment
			? eq(flags.environment, environment)
			: isNull(flags.environment);
		return db.query.flags.findFirst({
			where: and(
				eq(flags.key, key),
				environmentCondition,
				isNull(flags.deletedAt),
				eq(flags.status, "active"),
				scopeCondition
			),
		});
	},
	{
		expireInSec: 30,
		prefix: "flag",
		staleWhileRevalidate: true,
		staleTime: 15,
	}
);

const getCachedFlagsForClient = cacheable(
	(clientId: string, environment?: string) => {
		const scopeCondition = or(
			eq(flags.websiteId, clientId),
			eq(flags.organizationId, clientId)
		);

		const environmentCondition = environment
			? eq(flags.environment, environment)
			: isNull(flags.environment);

		return db.query.flags.findMany({
			where: and(
				isNull(flags.deletedAt),
				eq(flags.status, "active"),
				environmentCondition,
				scopeCondition
			),
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
	} catch (error) {
		logger.warn({ error, propertiesJson }, "Invalid properties JSON");
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

export function evaluateRule(rule: FlagRule, context: UserContext): boolean {
	if (rule.batch && rule.batchValues?.length) {
		switch (rule.type) {
			case "user_id": {
				return context.userId
					? rule.batchValues.includes(context.userId)
					: false;
			}
			case "email": {
				return context.email ? rule.batchValues.includes(context.email) : false;
			}
			case "property": {
				if (!rule.field) {
					return false;
				}
				const propertyValue = context.properties?.[rule.field];
				return propertyValue
					? rule.batchValues.includes(String(propertyValue))
					: false;
			}
			default:
				return false;
		}
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
): { value: string | number | boolean; variant: string } {
	if (!flag.variants || flag.variants.length === 0) {
		return { value: flag.defaultValue, variant: "default" };
	}

	const identifier = context.userId || context.email || "anonymous";
	const hash = hashString(`${flag.key}:variant:${identifier}`);
	const percentage = hash % 100;

	const hasAnyWeight = flag.variants.some((v: Variant) => typeof v?.weight === "number");

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
	const lastVariant = flag.variants[flag.variants.length - 1];
	if (!lastVariant) {
		return { value: flag.defaultValue, variant: "default" };
	}
	return { value: lastVariant.value, variant: lastVariant.key };
}

export function evaluateFlag(flag: EvaluableFlag, context: UserContext): FlagResult {
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

	if (flag.type === "multivariant" && flag.variants && flag.variants.length > 0) {
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
		const identifier = context.userId || context.email || "anonymous";
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
			return record("evaluateFlag", async (): Promise<FlagResult> => {

				setAttributes({
					"flag.key": query.key || "missing",
					"flag.client_id": query.clientId || "missing",
					"flag.has_user_id": Boolean(query.userId),
					"flag.has_email": Boolean(query.email),
					"flag.environment": query.environment || "missing",
				});

				try {
					if (!(query.key && query.clientId)) {
						setAttributes({ "flag.error": "missing_params" });
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
						properties: parseProperties(query.properties),
					};

					logger.debug(
						{
							key: query.key,
							clientId: query.clientId,
							userId: query.userId,
							email: query.email,
							environment: query.environment,
						},
						"Flag evaluation request"
					);

					const flag = await getCachedFlag(query.key, query.clientId, query.environment);

					if (!flag) {
						setAttributes({ "flag.found": false });
						return {
							enabled: false,
							value: false,
							payload: null,
							reason: "FLAG_NOT_FOUND",
						};
					}

					const result = evaluateFlag(flag as unknown as EvaluableFlag, context);
					setAttributes({
						"flag.found": true,
						"flag.type": flag.type,
						"flag.enabled": result.enabled,
						"flag.reason": result.reason,
					});

					return result;
				} catch (error) {
					setAttributes({ "flag.error": true });
					logger.error(
						{ error, key: query.key, clientId: query.clientId },
						"Flag evaluation failed"
					);
					set.status = 500;
					return {
						enabled: false,
						value: false,
						payload: null,
						reason: "EVALUATION_ERROR",
					};
				}
			});
		},
		{ query: flagQuerySchema }
	)

	.get(
		"/bulk",
		function bulkEvaluateFlags({ query, set }) {
			return record("bulkEvaluateFlags", async () => {
				setAttributes({
					"flag.bulk": true,
					"flag.client_id": query.clientId || "missing",
					"flag.has_user_id": Boolean(query.userId),
					"flag.has_email": Boolean(query.email),
					"flag.environment": query.environment || "missing",
				});

				try {
					if (!query.clientId) {
						setAttributes({ "flag.error": "missing_client_id" });
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
						properties: parseProperties(query.properties),
					};

					const allFlags = await getCachedFlagsForClient(query.clientId, query.environment);

					setAttributes({
						"flag.total_flags": allFlags.length,
					});

					const enabledFlags: Record<string, FlagResult> = {};

					for (const flag of allFlags) {
						const result = evaluateFlag(flag as unknown as EvaluableFlag, context);
						if (result.enabled) {
							enabledFlags[flag.key] = result;
						}
					}

					setAttributes({
						"flag.enabled_count": Object.keys(enabledFlags).length,
					});

					return {
						flags: enabledFlags,
						count: Object.keys(enabledFlags).length,
						timestamp: new Date().toISOString(),
					};
				} catch (error) {
					setAttributes({ "flag.error": true });
					logger.error(
						{ error, clientId: query.clientId },
						"Bulk flag evaluation failed"
					);
					set.status = 500;
					return {
						flags: {},
						count: 0,
						error: "Bulk evaluation failed",
					};
				}
			});
		},
		{ query: bulkFlagQuerySchema }
	)

	.get("/health", () => ({
		service: "flags",
		status: "ok",
		version: "1.0.0",
		timestamp: new Date().toISOString(),
	}));
