import {
	type ApiKeyRow,
	getApiKeyFromHeader,
	hasKeyScope,
	hasWebsiteScope,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import { mergeWideEvent } from "@databuddy/ai/lib/tracing";
import {
	and,
	db,
	eq,
	inArray,
	isNull,
	or,
	withTransaction,
} from "@databuddy/db";
import {
	flagChangeEvents,
	type FlagUserRule,
	type FlagVariant,
	flags,
	websites,
} from "@databuddy/db/schema";
import { cacheNamespaces, cacheTags, cacheable } from "@databuddy/redis";
import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import { invalidateFlagCache } from "@databuddy/rpc/flags";
import { randomUUIDv7 } from "bun";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import { LRUCache } from "lru-cache";

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

type FlagRule = Omit<FlagUserRule, "operator" | "value" | "values"> & {
	operator: string;
	value?: unknown;
	values?: unknown[];
};

interface FlagResult {
	enabled: boolean;
	payload: unknown;
	reason: string;
	value: unknown;
	variant?: string;
}

interface TargetGroupData {
	id: string;
	rules: FlagRule[];
}

interface EvaluableFlag {
	defaultValue: boolean;
	dependencies?: string[] | null;
	key: string;
	payload?: unknown;
	resolvedTargetGroups?: TargetGroupData[];
	rolloutBy?: string | null;
	rolloutPercentage: number | null;
	rules?: FlagRule[] | null;
	status: "active" | "inactive" | "archived";
	type: "boolean" | "rollout" | "multivariant";
	variants?: FlagVariant[] | null;
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
		const flag = await db.query.flags.findFirst({
			where: {
				RAW: (t) =>
					and(
						eq(t.key, key),
						environment
							? eq(t.environment, environment)
							: isNull(t.environment),
						isNull(t.deletedAt),
						eq(t.status, "active"),
						isNull(t.userId),
						or(eq(t.websiteId, clientId), eq(t.organizationId, clientId))
					),
			},
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
				rules: ftg.targetGroup.rules,
			}));

		return {
			...flag,
			resolvedTargetGroups,
		};
	},
	{
		expireInSec: 30,
		prefix: cacheNamespaces.flag,
		staleWhileRevalidate: true,
		staleTime: 15,
		tags: (_result, key, clientId) => [
			cacheTags.flagClient(clientId),
			cacheTags.flagKey(clientId, key),
		],
	}
);

const getCachedFlagsForClient = cacheable(
	async (clientId: string, environment?: string) => {
		const flagsList = await db.query.flags.findMany({
			where: {
				RAW: (t) =>
					and(
						isNull(t.deletedAt),
						eq(t.status, "active"),
						isNull(t.userId),
						environment
							? eq(t.environment, environment)
							: isNull(t.environment),
						or(eq(t.websiteId, clientId), eq(t.organizationId, clientId))
					),
			},
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
					rules: ftg.targetGroup.rules,
				}));

			return {
				...flag,
				resolvedTargetGroups,
			};
		});
	},
	{
		expireInSec: 30,
		prefix: cacheNamespaces.flagsClient,
		staleWhileRevalidate: true,
		staleTime: 15,
		tags: (_result, clientId) => [cacheTags.flagClient(clientId)],
	}
);

const getCachedFlagDefinitionsForClient = cacheable(
	async (clientId: string, environment?: string) => {
		const flagsList = await db.query.flags.findMany({
			where: {
				RAW: (t) =>
					and(
						isNull(t.deletedAt),
						isNull(t.userId),
						environment
							? eq(t.environment, environment)
							: isNull(t.environment),
						or(eq(t.websiteId, clientId), eq(t.organizationId, clientId))
					),
			},
			orderBy: { createdAt: "desc" },
		});

		return flagsList;
	},
	{
		expireInSec: 30,
		prefix: cacheNamespaces.flagsDefinitions,
		staleWhileRevalidate: true,
		staleTime: 15,
		tags: (_result, clientId) => [cacheTags.flagClient(clientId)],
	}
);

const getCachedFlagsForUser = cacheable(
	async (userId: string, clientId: string, environment?: string) => {
		const flagsList = await db.query.flags.findMany({
			where: {
				RAW: (t) =>
					and(
						isNull(t.deletedAt),
						eq(t.status, "active"),
						environment
							? eq(t.environment, environment)
							: isNull(t.environment),
						eq(t.userId, userId),
						or(eq(t.websiteId, clientId), eq(t.organizationId, clientId))
					),
			},
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
					rules: ftg.targetGroup.rules,
				}));

			return {
				...flag,
				resolvedTargetGroups,
			};
		});
	},
	{
		expireInSec: 30,
		prefix: cacheNamespaces.flagsUser,
		staleWhileRevalidate: true,
		staleTime: 15,
		tags: (_result, userId, clientId) => [
			cacheTags.flagClient(clientId),
			cacheTags.flagUser(clientId, userId),
		],
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
	} catch {
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
	return;
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
): { value: unknown; variant: string } {
	if (!flag.variants || flag.variants.length === 0) {
		return { value: flag.defaultValue, variant: "default" };
	}

	const identifier = context.userId || context.email || "anonymous";
	const hash = hashString(`${flag.key}:variant:${identifier}`);
	const percentage = hash % 100;

	const hasAnyWeight = flag.variants.some((v) => typeof v?.weight === "number");

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

function dependencyFailure(): FlagResult {
	return {
		enabled: false,
		value: false,
		payload: null,
		reason: "DEPENDENCY_NOT_SATISFIED",
	};
}

function dependenciesSatisfiedFromList(
	flag: EvaluableFlag,
	flagsList: EvaluableFlag[]
): boolean {
	const dependencies = flag.dependencies ?? [];
	if (dependencies.length === 0) {
		return true;
	}
	const byKey = new Map(flagsList.map((item) => [item.key, item]));
	return dependencies.every((key) => byKey.get(key)?.status === "active");
}

async function dependenciesSatisfied(
	flag: EvaluableFlag,
	clientId: string,
	environment?: string
): Promise<boolean> {
	const dependencies = flag.dependencies ?? [];
	if (dependencies.length === 0) {
		return true;
	}

	const rows = await db
		.select({ key: flags.key })
		.from(flags)
		.where(
			and(
				isNull(flags.deletedAt),
				eq(flags.status, "active"),
				environment
					? eq(flags.environment, environment)
					: isNull(flags.environment),
				inArray(flags.key, dependencies),
				or(eq(flags.websiteId, clientId), eq(flags.organizationId, clientId))
			)
		);

	return rows.length === new Set(dependencies).size;
}

export function evaluateFlag(
	flag: EvaluableFlag,
	context: UserContext
): FlagResult {
	if (flag.rules?.length) {
		for (const rule of flag.rules) {
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

	for (const group of flag.resolvedTargetGroups ?? []) {
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

const PUBLIC_EVAL_RATE_PER_MINUTE = 600;

function clientIpForFlags(request: Request): string {
	return (
		request.headers.get("cf-connecting-ip") ||
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		"unknown"
	);
}

interface ElysiaSet {
	headers: Record<string, unknown>;
	status?: unknown;
}

async function enforcePublicFlagRateLimit(
	request: Request,
	clientId: string | undefined,
	set: ElysiaSet
): Promise<boolean> {
	const ip = clientIpForFlags(request);
	const key = clientId
		? `flags:eval:${clientId}:${ip}`
		: `flags:eval:anon:${ip}`;
	const rl = await ratelimit(key, PUBLIC_EVAL_RATE_PER_MINUTE, 60);
	if (rl.success) {
		return true;
	}
	for (const [name, value] of Object.entries(getRateLimitHeaders(rl))) {
		set.headers[name] = value;
	}
	set.status = 429;
	return false;
}

const FLAG_CACHE_CONTROL =
	"public, max-age=15, s-maxage=30, stale-while-revalidate=15";

const PUBLIC_CACHE_PATH_RE = /\/v1\/flags\/(evaluate|bulk)$/;

interface FlagAdminSuccess {
	apiKey: ApiKeyRow;
	ok: true;
}

interface FlagAdminFailure {
	error: string;
	ok: false;
	status: 401 | 403;
}

async function resolveFlagAdmin(
	headers: Headers,
	clientId: string
): Promise<FlagAdminSuccess | FlagAdminFailure> {
	if (!isApiKeyPresent(headers)) {
		return { ok: false, status: 401, error: "Authentication required" };
	}
	const apiKey = await getApiKeyFromHeader(headers);
	if (!apiKey) {
		return { ok: false, status: 401, error: "Authentication required" };
	}
	const hasOrgAccess =
		apiKey.organizationId === clientId && hasKeyScope(apiKey, "manage:flags");
	let hasWebsiteAccess = false;
	if (hasWebsiteScope(apiKey, clientId, "manage:flags")) {
		const [website] = await db
			.select({ id: websites.id })
			.from(websites)
			.where(
				and(
					eq(websites.id, clientId),
					eq(websites.organizationId, apiKey.organizationId ?? "")
				)
			)
			.limit(1);
		hasWebsiteAccess = Boolean(website);
	}
	if (!(hasWebsiteAccess || hasOrgAccess)) {
		return { ok: false, status: 403, error: "Forbidden" };
	}
	return { ok: true, apiKey };
}

function invalidateMemCacheForClient(clientId: string) {
	const clientFragment = `:${clientId}:`;
	for (const key of memCache.keys()) {
		if (
			(key.startsWith("fc:") ||
				key.startsWith("fd:") ||
				key.startsWith("f:") ||
				key.startsWith("fu:")) &&
			key.includes(clientFragment)
		) {
			memCache.delete(key);
		}
	}
}

function resolveScope(
	apiKey: ApiKeyRow,
	clientId: string
): { organizationId: string | null; websiteId: string | null } {
	if (hasWebsiteScope(apiKey, clientId, "manage:flags")) {
		return { websiteId: clientId, organizationId: null };
	}
	if (apiKey.organizationId === clientId) {
		return { websiteId: null, organizationId: clientId };
	}
	return { websiteId: null, organizationId: null };
}

function buildFlagChangeSnapshot(flag: typeof flags.$inferSelect) {
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

const variantBodySchema = t.Object({
	key: t.String({ minLength: 1 }),
	type: t.Union([t.Literal("string"), t.Literal("number"), t.Literal("json")]),
	value: t.Any(),
	description: t.Optional(t.String()),
	weight: t.Optional(t.Number()),
});

export const flagsRoute = new Elysia({ prefix: "/v1/flags" })
	.onAfterHandle(({ set, request }) => {
		if (!set.status || set.status === 200) {
			const pathname = new URL(request.url).pathname;
			set.headers["cache-control"] = PUBLIC_CACHE_PATH_RE.test(pathname)
				? FLAG_CACHE_CONTROL
				: "private, no-store";
		}
		set.headers.vary = "Origin";
	})
	.get(
		"/evaluate",
		async function evaluateFlagEndpoint({ query, set, request }) {
			if (!(await enforcePublicFlagRateLimit(request, query.clientId, set))) {
				return {
					enabled: false,
					value: false,
					payload: null,
					reason: "RATE_LIMITED",
				};
			}

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
						`fu:${uid}:${query.clientId}:${query.environment || ""}`,
						() => getCachedFlagsForUser(uid, query.clientId, query.environment)
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

				const result = (await dependenciesSatisfied(
					flag,
					query.clientId,
					query.environment
				))
					? evaluateFlag(flag, context)
					: dependencyFailure();
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
		async function bulkEvaluateFlags({ query, set, request }) {
			if (!(await enforcePublicFlagRateLimit(request, query.clientId, set))) {
				return { flags: [], reason: "RATE_LIMITED" };
			}

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
						`fu:${uid}:${query.clientId}:${query.environment || ""}`,
						() => getCachedFlagsForUser(uid, query.clientId, query.environment)
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
					results[flag.key] = dependenciesSatisfiedFromList(flag, allFlags)
						? evaluateFlag(flag, context)
						: dependencyFailure();
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
		async function getDefinitionsEndpoint({ query, set, request }) {
			mergeWideEvent({
				flag_client_id: query.clientId || "",
				flag_environment: query.environment || "",
				flag_definitions: true,
			});

			try {
				if (!query.clientId) {
					mergeWideEvent({ flag_error: "missing_client_id" });
					set.status = 400;
					return { flags: [], error: "Missing required clientId parameter" };
				}

				const auth = await resolveFlagAdmin(request.headers, query.clientId);
				if (!auth.ok) {
					mergeWideEvent({ flag_error: `auth_${auth.status}` });
					set.status = auth.status;
					return { flags: [], error: auth.error };
				}

				const clientFlags = await fromMemory(
					`fd:${query.clientId}:${query.environment || ""}`,
					() =>
						getCachedFlagDefinitionsForClient(query.clientId, query.environment)
				);

				mergeWideEvent({ flag_total_flags: clientFlags.length });

				return {
					flags: clientFlags.map((flag) => ({
						id: flag.id,
						key: flag.key,
						name: flag.name,
						description: flag.description,
						type: flag.type,
						status: flag.status,
						defaultValue: flag.defaultValue,
						payload: flag.payload,
						rules: flag.rules,
						rolloutPercentage: flag.rolloutPercentage,
						rolloutBy: flag.rolloutBy,
						dependencies: flag.dependencies,
						environment: flag.environment,
						variants: flag.variants,
						createdAt: flag.createdAt,
						updatedAt: flag.updatedAt,
					})),
					count: clientFlags.length,
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

	.post(
		"/",
		async function createFlagEndpoint({ body, set, request }) {
			mergeWideEvent({
				flag_client_id: body.clientId || "",
				flag_write: "create",
			});

			try {
				const auth = await resolveFlagAdmin(request.headers, body.clientId);
				if (!auth.ok) {
					set.status = auth.status;
					return { error: auth.error };
				}

				if (!auth.apiKey.userId) {
					set.status = 403;
					return { error: "Forbidden" };
				}

				const scope = resolveScope(auth.apiKey, body.clientId);
				if (!(scope.websiteId || scope.organizationId)) {
					set.status = 403;
					return { error: "Insufficient permissions" };
				}

				const existingRows = await db
					.select()
					.from(flags)
					.where(
						and(
							eq(flags.key, body.key),
							or(
								eq(flags.websiteId, scope.websiteId ?? ""),
								eq(flags.organizationId, scope.organizationId ?? "")
							)
						)
					)
					.limit(1);

				const existing = existingRows.at(0) ?? null;

				if (existing && !existing.deletedAt) {
					set.status = 409;
					return { error: "A flag with this key already exists" };
				}

				const createdBy = auth.apiKey.userId;
				const variants: FlagVariant[] = body.variants ?? [];
				const dependencies = body.dependencies ?? [];
				if (dependencies.length > 0) {
					const dependencyRows = await db
						.select({ key: flags.key })
						.from(flags)
						.where(
							and(
								inArray(flags.key, dependencies),
								isNull(flags.deletedAt),
								or(
									eq(flags.websiteId, scope.websiteId ?? ""),
									eq(flags.organizationId, scope.organizationId ?? "")
								)
							)
						);
					if (dependencyRows.length !== dependencies.length) {
						set.status = 400;
						return { error: "One or more dependency flags were not found" };
					}
				}

				const result = await withTransaction(async (tx) => {
					if (existing) {
						const restoredRows = await tx
							.update(flags)
							.set({
								name: body.name ?? null,
								description: body.description ?? null,
								type: body.type,
								status: body.status ?? "active",
								defaultValue: body.defaultValue,
								payload: body.payload ?? null,
								rules: body.rules ?? [],
								rolloutPercentage: body.rolloutPercentage ?? 0,
								rolloutBy: body.rolloutBy ?? null,
								dependencies,
								variants,
								environment: body.environment ?? null,
								deletedAt: null,
								updatedAt: new Date(),
							})
							.where(eq(flags.id, existing.id))
							.returning();

						const restored = restoredRows.at(0);
						if (!restored) {
							throw new Error("Failed to restore flag");
						}

						await tx.insert(flagChangeEvents).values({
							id: randomUUIDv7(),
							flagId: restored.id,
							websiteId: restored.websiteId,
							organizationId: restored.organizationId,
							changeType: "restored",
							before: buildFlagChangeSnapshot(existing),
							after: buildFlagChangeSnapshot(restored),
							changedBy: createdBy,
						});

						return restored;
					}

					const id = randomUUIDv7();
					const createdRows = await tx
						.insert(flags)
						.values({
							id,
							key: body.key,
							name: body.name ?? null,
							description: body.description ?? null,
							type: body.type,
							status: body.status ?? "active",
							defaultValue: body.defaultValue,
							payload: body.payload ?? null,
							rules: body.rules ?? [],
							rolloutPercentage: body.rolloutPercentage ?? 0,
							rolloutBy: body.rolloutBy ?? null,
							dependencies,
							variants,
							environment: body.environment ?? null,
							websiteId: scope.websiteId,
							organizationId: scope.organizationId,
							createdBy,
						})
						.returning();

					const created = createdRows.at(0);
					if (!created) {
						throw new Error("Failed to create flag");
					}

					await tx.insert(flagChangeEvents).values({
						id: randomUUIDv7(),
						flagId: created.id,
						websiteId: created.websiteId,
						organizationId: created.organizationId,
						changeType: "created",
						before: null,
						after: buildFlagChangeSnapshot(created),
						changedBy: createdBy,
					});

					return created;
				});

				await invalidateFlagCache(
					result.id,
					result.websiteId,
					result.organizationId,
					result.key
				);
				invalidateMemCacheForClient(body.clientId);

				return {
					flag: {
						id: result.id,
						key: result.key,
						description: result.description,
						type: result.type,
						status: result.status,
						defaultValue: result.defaultValue,
						variants: result.variants,
						createdAt: result.createdAt,
						updatedAt: result.updatedAt,
					},
				};
			} catch (error) {
				mergeWideEvent({ flag_error: true });
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ flags: { create: true, clientId: body.clientId } }
				);
				set.status = 500;
				return { error: "Failed to create flag" };
			}
		},
		{
			body: t.Object({
				clientId: t.String({ minLength: 1 }),
				key: t.String({ minLength: 1, maxLength: 128 }),
				name: t.Optional(t.String({ maxLength: 100 })),
				type: t.Union([
					t.Literal("boolean"),
					t.Literal("rollout"),
					t.Literal("multivariant"),
				]),
				status: t.Optional(
					t.Union([t.Literal("active"), t.Literal("inactive")])
				),
				defaultValue: t.Boolean(),
				description: t.Optional(t.String({ maxLength: 500 })),
				payload: t.Optional(t.Record(t.String(), t.Unknown())),
				rules: t.Optional(t.Array(t.Any())),
				rolloutPercentage: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
				rolloutBy: t.Optional(t.String()),
				dependencies: t.Optional(t.Array(t.String())),
				environment: t.Optional(t.String()),
				variants: t.Optional(t.Array(variantBodySchema, { maxItems: 32 })),
			}),
		}
	)

	.patch(
		"/:id",
		async function updateFlagEndpoint({ body, params, set, request }) {
			mergeWideEvent({
				flag_client_id: body.clientId || "",
				flag_write: "update",
			});

			try {
				const auth = await resolveFlagAdmin(request.headers, body.clientId);
				if (!auth.ok) {
					set.status = auth.status;
					return { error: auth.error };
				}

				if (!auth.apiKey.userId) {
					set.status = 403;
					return { error: "Forbidden" };
				}

				const existing = await db
					.select()
					.from(flags)
					.where(and(eq(flags.id, params.id), isNull(flags.deletedAt)))
					.limit(1);

				const flag = existing.at(0);
				if (!flag) {
					set.status = 404;
					return { error: "Flag not found" };
				}
				if (
					flag.websiteId !== body.clientId &&
					flag.organizationId !== body.clientId
				) {
					set.status = 404;
					return { error: "Flag not found" };
				}

				const updates: Partial<typeof flags.$inferInsert> = {
					updatedAt: new Date(),
				};
				if (body.description !== undefined) {
					updates.description = body.description ?? null;
				}
				if (body.defaultValue !== undefined) {
					updates.defaultValue = body.defaultValue;
				}
				if (body.variants !== undefined) {
					updates.variants = body.variants;
				}
				if (body.status !== undefined) {
					updates.status = body.status;
				}

				const changedBy = auth.apiKey.userId;

				const updated = await withTransaction(async (tx) => {
					const rows = await tx
						.update(flags)
						.set(updates)
						.where(and(eq(flags.id, params.id), isNull(flags.deletedAt)))
						.returning();

					const row = rows.at(0);
					if (!row) {
						throw new Error("Failed to update flag");
					}

					await tx.insert(flagChangeEvents).values({
						id: randomUUIDv7(),
						flagId: row.id,
						websiteId: row.websiteId,
						organizationId: row.organizationId,
						changeType: "updated",
						before: buildFlagChangeSnapshot(flag),
						after: buildFlagChangeSnapshot(row),
						changedBy,
					});

					return row;
				});

				await invalidateFlagCache(
					updated.id,
					updated.websiteId,
					updated.organizationId,
					updated.key
				);
				invalidateMemCacheForClient(body.clientId);

				return {
					flag: {
						id: updated.id,
						key: updated.key,
						description: updated.description,
						type: updated.type,
						status: updated.status,
						defaultValue: updated.defaultValue,
						variants: updated.variants,
						createdAt: updated.createdAt,
						updatedAt: updated.updatedAt,
					},
				};
			} catch (error) {
				mergeWideEvent({ flag_error: true });
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ flags: { update: true, flagId: params.id } }
				);
				set.status = 500;
				return { error: "Failed to update flag" };
			}
		},
		{
			params: t.Object({ id: t.String({ minLength: 1 }) }),
			body: t.Object({
				clientId: t.String({ minLength: 1 }),
				description: t.Optional(t.Union([t.String(), t.Null()])),
				defaultValue: t.Optional(t.Boolean()),
				variants: t.Optional(t.Array(variantBodySchema, { maxItems: 32 })),
				status: t.Optional(
					t.Union([
						t.Literal("active"),
						t.Literal("inactive"),
						t.Literal("archived"),
					])
				),
			}),
		}
	)

	.delete(
		"/:id",
		async function deleteFlagEndpoint({ params, query, set, request }) {
			mergeWideEvent({
				flag_client_id: query.clientId || "",
				flag_write: "delete",
			});

			try {
				const auth = await resolveFlagAdmin(request.headers, query.clientId);
				if (!auth.ok) {
					set.status = auth.status;
					return { error: auth.error };
				}

				if (!auth.apiKey.userId) {
					set.status = 403;
					return { error: "Forbidden" };
				}

				const existing = await db
					.select()
					.from(flags)
					.where(and(eq(flags.id, params.id), isNull(flags.deletedAt)))
					.limit(1);

				const flag = existing.at(0);
				if (!flag) {
					set.status = 404;
					return { error: "Flag not found" };
				}
				if (
					flag.websiteId !== query.clientId &&
					flag.organizationId !== query.clientId
				) {
					set.status = 404;
					return { error: "Flag not found" };
				}

				const changedBy = auth.apiKey.userId;

				await withTransaction(async (tx) => {
					const archivedRows = await tx
						.update(flags)
						.set({ deletedAt: new Date(), status: "archived" })
						.where(and(eq(flags.id, params.id), isNull(flags.deletedAt)))
						.returning();

					const archived = archivedRows.at(0);
					if (!archived) {
						throw new Error("Failed to archive flag");
					}

					await tx.insert(flagChangeEvents).values({
						id: randomUUIDv7(),
						flagId: archived.id,
						websiteId: archived.websiteId,
						organizationId: archived.organizationId,
						changeType: "archived",
						before: buildFlagChangeSnapshot(flag),
						after: buildFlagChangeSnapshot(archived),
						changedBy,
					});
				});

				await invalidateFlagCache(
					flag.id,
					flag.websiteId,
					flag.organizationId,
					flag.key
				);
				invalidateMemCacheForClient(query.clientId);

				return { success: true };
			} catch (error) {
				mergeWideEvent({ flag_error: true });
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ flags: { delete: true, flagId: params.id } }
				);
				set.status = 500;
				return { error: "Failed to delete flag" };
			}
		},
		{
			params: t.Object({ id: t.String({ minLength: 1 }) }),
			query: t.Object({ clientId: t.String({ minLength: 1 }) }),
		}
	)

	.get("/health", () => ({
		service: "flags",
		status: "ok",
		version: "1.0.0",
	}));
