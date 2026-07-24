import { auth } from "@databuddy/auth";
import {
	type ApiKeyRow,
	getAccessibleWebsiteIds,
	getApiKeyFromHeader,
	hasGlobalAccess,
	hasKeyScope,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import { and, db, eq, inArray } from "@databuddy/db";
import { profiles } from "@databuddy/db/schema";
import { config } from "@databuddy/env/app";
import {
	isTraitFilterField,
	resolveTraitSegment,
	revealPii,
	type TraitFilter,
	TraitFilterError,
} from "@databuddy/services/identity";
import { validateTimezone } from "@databuddy/validation";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import { getBillingOwner } from "@databuddy/rpc/billing";
import { getOrganizationOwnerId } from "@databuddy/rpc/organization";
import {
	type GatedFeatureId,
	GATED_FEATURES,
	isFeatureAvailable,
} from "@databuddy/shared/types/features";
import {
	allowedFilterFields,
	compileQuery,
	executeBatch,
	isFilterFieldAllowed,
} from "@databuddy/ai/query";
import {
	canReadQueryTypesPublicly,
	QueryBuilders,
} from "@databuddy/ai/query/builders";
import {
	isNormalizedQueryDate,
	normalizeClickHouseDateTime,
} from "@databuddy/ai/query/date-utils";
import type { Filter, QueryRequest } from "@databuddy/ai/query/types";
import { Elysia, t } from "elysia";
import { getAccessibleWebsites } from "@databuddy/ai/lib/accessible-websites";
import {
	getCachedWebsiteDomain,
	getWebsiteDomain,
} from "@databuddy/ai/lib/website-utils";
import { resolveDatePreset } from "@databuddy/ai/lib/date-presets";
import { captureError, mergeWideEvent } from "@databuddy/ai/lib/tracing";
import {
	CompileRequestSchema,
	type CompileRequestType,
	DatePresets,
	DynamicQueryRequestSchema,
	type DynamicQueryRequestType,
} from "../schemas/query-schemas";
import { getRequestId } from "../http/request-id";

const PER_WEBSITE_QUERY_CONCURRENCY = 8;

interface KeyedSemaphore {
	active: number;
	queue: Array<() => void>;
}

const websiteSemaphores = new Map<string, KeyedSemaphore>();

async function runPerWebsite<T>(key: string, fn: () => Promise<T>): Promise<T> {
	let sem = websiteSemaphores.get(key);
	if (!sem) {
		sem = { active: 0, queue: [] };
		websiteSemaphores.set(key, sem);
	}
	while (sem.active >= PER_WEBSITE_QUERY_CONCURRENCY) {
		await new Promise<void>((resolve) => {
			(sem as KeyedSemaphore).queue.push(resolve);
		});
	}
	sem.active++;
	try {
		return await fn();
	} finally {
		sem.active--;
		const next = sem.queue.shift();
		if (next) {
			next();
		} else if (sem.active === 0 && sem.queue.length === 0) {
			websiteSemaphores.delete(key);
		}
	}
}

const MAX_HOURLY_DAYS = 30;
const MS_PER_DAY = 86_400_000;
const PROTECTED_RESOURCE_METADATA_URL = `${config.urls.api}/.well-known/oauth-protected-resource`;

function normalizeDate(input: string): string {
	return normalizeClickHouseDateTime(input);
}

interface ValidationError {
	field: string;
	message: string;
	suggestion?: string;
}

const QUERY_EXECUTION_ERROR_MESSAGE = "Query execution failed";

interface ResolvedDateRange {
	endDate?: string;
	startDate?: string;
}

function findClosestMatch(input: string, options: string[]): string | null {
	const inputLower = input.toLowerCase();
	let bestMatch: string | null = null;
	let bestScore = 0;

	for (const option of options) {
		const optionLower = option.toLowerCase();

		if (
			optionLower.startsWith(inputLower) ||
			inputLower.startsWith(optionLower)
		) {
			const score =
				Math.min(input.length, option.length) /
				Math.max(input.length, option.length);
			if (score > bestScore) {
				bestScore = score;
				bestMatch = option;
			}
		}

		let matches = 0;
		for (let i = 0; i < Math.min(inputLower.length, optionLower.length); i++) {
			if (inputLower[i] === optionLower[i]) {
				matches++;
			}
		}
		const score = matches / Math.max(input.length, option.length);
		if (score > 0.6 && score > bestScore) {
			bestScore = score;
			bestMatch = option;
		}
	}

	return bestScore > 0.5 ? bestMatch : null;
}

function validateQueryRequest(
	request: DynamicQueryRequestType,
	timezone: string
):
	| { valid: true; startDate: string; endDate: string }
	| { valid: false; errors: ValidationError[] } {
	const errors = validateQueryParameters(request.parameters);
	const dateRange = validateDateRange(request, timezone);
	const { startDate, endDate } = dateRange;
	errors.push(...dateRange.errors);
	errors.push(
		...validateRequiredDateFields(startDate, endDate, Boolean(request.preset))
	);
	errors.push(...validateParsedDateFields(request, { startDate, endDate }));
	errors.push(...validatePaginationFields(request));

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		startDate: startDate as string,
		endDate: endDate as string,
	};
}

function validateQueryParameters(
	parameters: DynamicQueryRequestType["parameters"]
): ValidationError[] {
	if (!parameters || parameters.length === 0) {
		return [
			{
				field: "parameters",
				message: "At least one parameter is required",
			},
		];
	}

	const queryTypes = Object.keys(QueryBuilders);
	return parameters.flatMap((param, index) => {
		const name = typeof param === "string" ? param : param?.name;
		if (!(name && !QueryBuilders[name])) {
			return [];
		}

		const suggestion = findClosestMatch(name, queryTypes);
		return [
			{
				field: `parameters[${index}]`,
				message: `Unknown query type: ${name}`,
				suggestion: suggestion ? `Did you mean '${suggestion}'?` : undefined,
			},
		];
	});
}

function validateDateRange(
	request: DynamicQueryRequestType,
	timezone: string
): ResolvedDateRange & { errors: ValidationError[] } {
	const dates = getExplicitDateRange(request);
	if (!request.preset) {
		return { ...dates, errors: [] };
	}

	if (DatePresets[request.preset]) {
		return { ...resolveDatePreset(request.preset, timezone), errors: [] };
	}

	return { ...dates, errors: [buildInvalidPresetError(request.preset)] };
}

function getExplicitDateRange(
	request: DynamicQueryRequestType
): ResolvedDateRange {
	return {
		startDate: request.startDate ? normalizeDate(request.startDate) : undefined,
		endDate: request.endDate ? normalizeDate(request.endDate) : undefined,
	};
}

function buildInvalidPresetError(preset: string): ValidationError {
	const validPresets = Object.keys(DatePresets);
	const suggestion = findClosestMatch(preset, validPresets);

	return {
		field: "preset",
		message: `Invalid date preset: ${preset}`,
		suggestion: suggestion
			? `Did you mean '${suggestion}'? Valid presets: ${validPresets.join(", ")}`
			: `Valid presets: ${validPresets.join(", ")}`,
	};
}

function validateRequiredDateFields(
	startDate: string | undefined,
	endDate: string | undefined,
	hasPreset: boolean
): ValidationError[] {
	const errors: ValidationError[] = [];
	if (!(startDate || hasPreset)) {
		errors.push({
			field: "startDate",
			message: "Either startDate or preset is required",
		});
	}
	if (!(endDate || hasPreset)) {
		errors.push({
			field: "endDate",
			message: "Either endDate or preset is required",
		});
	}
	return errors;
}

function validateParsedDateFields(
	request: DynamicQueryRequestType,
	{ startDate, endDate }: ResolvedDateRange
): ValidationError[] {
	const errors: ValidationError[] = [];
	if (startDate && !isNormalizedQueryDate(startDate)) {
		errors.push({
			field: "startDate",
			message: `Invalid date: ${request.startDate}. Could not parse as a valid date`,
		});
	}
	if (endDate && !isNormalizedQueryDate(endDate)) {
		errors.push({
			field: "endDate",
			message: `Invalid date: ${request.endDate}. Could not parse as a valid date`,
		});
	}
	return errors;
}

function validatePaginationFields(
	request: DynamicQueryRequestType
): ValidationError[] {
	const errors: ValidationError[] = [];
	if (request.limit !== undefined && request.limit < 1) {
		errors.push({ field: "limit", message: "Limit must be at least 1" });
	}
	if (request.limit !== undefined && request.limit > 10_000) {
		errors.push({ field: "limit", message: "Limit cannot exceed 10000" });
	}
	if (request.page !== undefined && request.page < 1) {
		errors.push({ field: "page", message: "Page must be at least 1" });
	}
	return errors;
}

interface AuthContext {
	// Session active org; used when query omits organization_id.
	activeOrganizationId: string | null;
	apiKey: ApiKeyRow | null;
	authMethod: "api_key" | "session" | "none";
	isAuthenticated: boolean;
	user: { id: string; name: string; email: string } | null;
}

type ProjectType = "website" | "schedule" | "link" | "organization";

type ProjectAccessResult =
	| {
			success: true;
			projectId: string;
			projectType: ProjectType;
	  }
	| {
			success: false;
			error: string;
			code: string;
			status?: number;
	  };

function createAuthFailedResponse(requestId: string): Response {
	return new Response(
		JSON.stringify({
			success: false,
			error: "Authentication required",
			code: "AUTH_REQUIRED",
			requestId,
		}),
		{
			status: 401,
			headers: {
				"Content-Type": "application/json",
				"X-Request-ID": requestId,
				"WWW-Authenticate": `Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"`,
			},
		}
	);
}

function clientIpForQuery(request: Request): string {
	return (
		request.headers.get("cf-connecting-ip") ||
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		"unknown"
	);
}

async function enforceQueryRateLimit(
	ctx: AuthContext,
	endpoint: "compile" | "execute",
	limit: number,
	requestId: string,
	request: Request
): Promise<Response | null> {
	if (readBooleanEnv("DATABUDDY_E2E_MODE")) {
		return null;
	}

	const principal = ctx.apiKey
		? `apikey:${ctx.apiKey.id}`
		: ctx.user
			? `user:${ctx.user.id}`
			: `anon:${clientIpForQuery(request)}`;
	const effectiveLimit = ctx.isAuthenticated ? limit : Math.min(limit, 60);
	const rl = await ratelimit(
		`query:${endpoint}:${principal}`,
		effectiveLimit,
		60
	);
	if (rl.success) {
		return null;
	}
	const retryAfter = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000));
	return new Response(
		JSON.stringify({
			success: false,
			error: "Rate limit exceeded",
			code: "RATE_LIMITED",
			requestId,
			limit: rl.limit,
			remaining: rl.remaining,
			reset: rl.reset,
			retryAfter,
		}),
		{
			status: 429,
			headers: {
				"Content-Type": "application/json",
				"X-Request-ID": requestId,
				...getRateLimitHeaders(rl),
			},
		}
	);
}

function createErrorResponse(
	error: string,
	code: string,
	status = 403,
	requestId?: string,
	details?: ValidationError[]
): Response {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (requestId) {
		headers["X-Request-ID"] = requestId;
	}
	if (status === 401) {
		headers["WWW-Authenticate"] =
			`Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"`;
	}

	return new Response(
		JSON.stringify({
			success: false,
			error,
			code,
			...(requestId && { requestId }),
			...(details && details.length > 0 && { details }),
		}),
		{
			status,
			headers,
		}
	);
}

function createValidationErrorResponse(
	errors: ValidationError[],
	requestId: string
): Response {
	const primaryError = errors[0];
	const message = primaryError?.suggestion
		? `${primaryError.message}. ${primaryError.suggestion}`
		: (primaryError?.message ?? "Validation failed");

	return createErrorResponse(
		message,
		"VALIDATION_ERROR",
		400,
		requestId,
		errors
	);
}

async function getOrganizationWebsiteIds(
	organizationId: string
): Promise<string[]> {
	const websites = await db.query.websites.findMany({
		where: { organizationId, deletedAt: { isNull: true } },
		columns: { id: true },
	});

	return websites.map((website) => website.id);
}

const FEATURE_GATED_QUERY_TYPES: Record<string, GatedFeatureId> = {
	recent_errors: GATED_FEATURES.ERROR_TRACKING,
	error_types: GATED_FEATURES.ERROR_TRACKING,
	errors_by_page: GATED_FEATURES.ERROR_TRACKING,
	error_summary: GATED_FEATURES.ERROR_TRACKING,
	error_chart_data: GATED_FEATURES.ERROR_TRACKING,
	error_trends: GATED_FEATURES.ERROR_TRACKING,
	error_frequency: GATED_FEATURES.ERROR_TRACKING,
	errors_by_type: GATED_FEATURES.ERROR_TRACKING,
};

async function enforceFeatureGatesForQueryTypes(
	queryTypes: string[],
	website: { organizationId: string | null }
): Promise<{ error: string; feature: GatedFeatureId } | null> {
	const required = new Set<GatedFeatureId>();
	for (const type of queryTypes) {
		const feature = FEATURE_GATED_QUERY_TYPES[type];
		if (feature) {
			required.add(feature);
		}
	}
	if (required.size === 0) {
		return null;
	}

	const ownerId = website.organizationId
		? await getOrganizationOwnerId(website.organizationId)
		: null;
	if (!ownerId) {
		return null;
	}
	const billing = await getBillingOwner(ownerId, website.organizationId);
	for (const feature of required) {
		if (!isFeatureAvailable(billing.planId, feature)) {
			return { error: "This feature is not available on the plan", feature };
		}
	}
	return null;
}

function extractQueryTypes(
	body: DynamicQueryRequestType | DynamicQueryRequestType[]
): string[] {
	const requests = Array.isArray(body) ? body : [body];
	return requests.flatMap((req) =>
		req.parameters.map((p) => (typeof p === "string" ? p : p.name))
	);
}

async function verifyWebsiteAccess(
	ctx: AuthContext,
	websiteId: string,
	queryTypes: string[] = []
): Promise<boolean> {
	mergeWideEvent({ access_check_type: "website", website_id: websiteId });

	const website = await db.query.websites.findFirst({
		where: { id: websiteId },
		columns: { id: true, isPublic: true, organizationId: true },
	});

	if (!website) {
		mergeWideEvent({ access_result: "not_found" });
		return false;
	}

	if (website.isPublic && canReadQueryTypesPublicly(queryTypes)) {
		mergeWideEvent({ access_result: "public_query" });
		return true;
	}

	if (!ctx.isAuthenticated) {
		mergeWideEvent({
			access_result: website.isPublic
				? "public_overview_only"
				: "unauthenticated",
		});
		return false;
	}

	if (!website.organizationId) {
		mergeWideEvent({ access_result: "no_organization" });
		return false;
	}

	if (ctx.apiKey) {
		if (hasGlobalAccess(ctx.apiKey)) {
			if (!ctx.apiKey.organizationId) {
				mergeWideEvent({ access_result: "api_key_no_org" });
				return false;
			}
			const granted = website.organizationId === ctx.apiKey.organizationId;
			mergeWideEvent({
				access_result: granted ? "api_key_global" : "api_key_denied",
			});
			return granted;
		}

		const granted = getAccessibleWebsiteIds(ctx.apiKey).includes(websiteId);
		mergeWideEvent({
			access_result: granted ? "api_key_scoped" : "api_key_denied",
		});
		return granted;
	}

	if (ctx.user) {
		const membership = await db.query.member.findFirst({
			where: { userId: ctx.user.id, organizationId: website.organizationId },
			columns: { id: true },
		});
		mergeWideEvent({ access_result: membership ? "member" : "not_member" });
		return !!membership;
	}

	mergeWideEvent({ access_result: "denied" });
	return false;
}

async function verifyScheduleAccess(
	ctx: AuthContext,
	scheduleId: string
): Promise<boolean> {
	mergeWideEvent({ access_check_type: "schedule", schedule_id: scheduleId });

	const schedule = await db.query.uptimeSchedules.findFirst({
		where: { id: scheduleId },
		columns: { id: true, organizationId: true, websiteId: true },
	});

	if (!schedule) {
		mergeWideEvent({ access_result: "not_found" });
		return false;
	}

	if (!ctx.isAuthenticated) {
		mergeWideEvent({ access_result: "unauthenticated" });
		return false;
	}

	if (ctx.user) {
		const membership = await db.query.member.findFirst({
			where: { userId: ctx.user.id, organizationId: schedule.organizationId },
			columns: { id: true },
		});
		mergeWideEvent({ access_result: membership ? "member" : "not_member" });
		return !!membership;
	}

	if (ctx.apiKey) {
		const orgMatch =
			hasKeyScope(ctx.apiKey, "read:monitors") &&
			ctx.apiKey.organizationId === schedule.organizationId;
		if (!orgMatch) {
			mergeWideEvent({ access_result: "api_key_denied" });
			return false;
		}
		if (hasGlobalAccess(ctx.apiKey)) {
			mergeWideEvent({ access_result: "api_key_match" });
			return true;
		}
		const granted =
			!!schedule.websiteId &&
			getAccessibleWebsiteIds(ctx.apiKey).includes(schedule.websiteId);
		mergeWideEvent({
			access_result: granted
				? "api_key_website_match"
				: "api_key_website_denied",
		});
		return granted;
	}

	mergeWideEvent({ access_result: "denied" });
	return false;
}

async function verifyLinkAccess(
	ctx: AuthContext,
	linkId: string
): Promise<boolean> {
	mergeWideEvent({ access_check_type: "link", link_id: linkId });

	const link = await db.query.links.findFirst({
		where: { id: linkId, deletedAt: { isNull: true } },
		columns: { id: true, organizationId: true, createdBy: true },
	});

	if (!link) {
		mergeWideEvent({ access_result: "not_found" });
		return false;
	}

	if (!ctx.isAuthenticated) {
		mergeWideEvent({ access_result: "unauthenticated" });
		return false;
	}

	if (ctx.user && link.organizationId) {
		const membership = await db.query.member.findFirst({
			where: { userId: ctx.user.id, organizationId: link.organizationId },
			columns: { id: true },
		});
		mergeWideEvent({ access_result: membership ? "member" : "not_member" });
		return !!membership;
	}

	if (ctx.user) {
		const granted = link.createdBy === ctx.user.id;
		mergeWideEvent({ access_result: granted ? "owner" : "not_owner" });
		return granted;
	}

	if (ctx.apiKey) {
		const granted =
			hasKeyScope(ctx.apiKey, "read:data") &&
			ctx.apiKey.organizationId === link.organizationId &&
			hasGlobalAccess(ctx.apiKey);
		mergeWideEvent({
			access_result: granted ? "api_key_match" : "api_key_denied",
		});
		return granted;
	}

	mergeWideEvent({ access_result: "denied" });
	return false;
}

async function verifyOrganizationAccess(
	ctx: AuthContext,
	organizationId: string
): Promise<boolean> {
	mergeWideEvent({
		access_check_type: "organization",
		organization_id: organizationId,
	});

	if (!ctx.isAuthenticated) {
		mergeWideEvent({ access_result: "unauthenticated" });
		return false;
	}

	if (ctx.user) {
		const membership = await db.query.member.findFirst({
			where: { userId: ctx.user.id, organizationId },
			columns: { id: true },
		});
		mergeWideEvent({ access_result: membership ? "member" : "not_member" });
		return !!membership;
	}

	if (ctx.apiKey) {
		const granted =
			hasKeyScope(ctx.apiKey, "read:data") &&
			ctx.apiKey.organizationId === organizationId;
		mergeWideEvent({
			access_result: granted ? "api_key_match" : "api_key_denied",
		});
		return granted;
	}

	mergeWideEvent({ access_result: "denied" });
	return false;
}

async function resolveProjectAccess(
	ctx: AuthContext,
	options: {
		websiteId?: string;
		scheduleId?: string;
		linkId?: string;
		organizationId?: string;
		queryTypes?: string[];
	}
): Promise<ProjectAccessResult> {
	const { websiteId, scheduleId, linkId, organizationId, queryTypes } = options;

	if (linkId) {
		const hasAccess = await verifyLinkAccess(ctx, linkId);
		if (!hasAccess) {
			return {
				success: false,
				error: ctx.isAuthenticated
					? "Access denied to this link"
					: "Authentication required",
				code: ctx.isAuthenticated ? "ACCESS_DENIED" : "AUTH_REQUIRED",
				status: ctx.isAuthenticated ? 403 : 401,
			};
		}
		return { success: true, projectId: linkId, projectType: "link" };
	}

	if (scheduleId) {
		const hasAccess = await verifyScheduleAccess(ctx, scheduleId);
		if (!hasAccess) {
			return {
				success: false,
				error: ctx.isAuthenticated
					? "Access denied to this monitor"
					: "Authentication required",
				code: ctx.isAuthenticated ? "ACCESS_DENIED" : "AUTH_REQUIRED",
				status: ctx.isAuthenticated ? 403 : 401,
			};
		}
		return { success: true, projectId: scheduleId, projectType: "schedule" };
	}

	if (websiteId) {
		const hasAccess = await verifyWebsiteAccess(ctx, websiteId, queryTypes);
		if (!hasAccess) {
			return {
				success: false,
				error: ctx.isAuthenticated
					? "Access denied to this website"
					: "Authentication required",
				code: ctx.isAuthenticated ? "ACCESS_DENIED" : "AUTH_REQUIRED",
				status: ctx.isAuthenticated ? 403 : 401,
			};
		}
		return { success: true, projectId: websiteId, projectType: "website" };
	}

	const apiKeyOrgFallback =
		ctx.apiKey && hasGlobalAccess(ctx.apiKey)
			? ctx.apiKey.organizationId
			: null;
	const resolvedOrganizationId =
		organizationId ??
		(websiteId || scheduleId || linkId
			? null
			: (ctx.activeOrganizationId ?? apiKeyOrgFallback ?? null));
	if (resolvedOrganizationId) {
		const hasAccess = await verifyOrganizationAccess(
			ctx,
			resolvedOrganizationId
		);
		if (!hasAccess) {
			return {
				success: false,
				error: ctx.isAuthenticated
					? "Access denied to this organization"
					: "Authentication required",
				code: ctx.isAuthenticated ? "ACCESS_DENIED" : "AUTH_REQUIRED",
				status: ctx.isAuthenticated ? 403 : 401,
			};
		}
		return {
			success: true,
			projectId: resolvedOrganizationId,
			projectType: "organization",
		};
	}

	if (!ctx.isAuthenticated) {
		return {
			success: false,
			error: "Authentication required",
			code: "AUTH_REQUIRED",
			status: 401,
		};
	}

	return {
		success: false,
		error:
			"Missing resource identifier (website_id, schedule_id, link_id, or organization_id)",
		code: "MISSING_PROJECT_ID",
		status: 400,
	};
}

function getTimeUnit(
	granularity?: string,
	from?: string,
	to?: string
): "hour" | "day" {
	const isHourly = granularity === "hourly" || granularity === "hour";
	if (isHourly && from && to) {
		const days = Math.ceil(
			(new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY
		);
		if (days > MAX_HOURLY_DAYS) {
			throw new Error(
				`Hourly granularity only supports up to ${MAX_HOURLY_DAYS} days`
			);
		}
	}
	return isHourly ? "hour" : "day";
}

type ParameterInput =
	| string
	| {
			name: string;
			start_date?: string;
			end_date?: string;
			granularity?: string;
			id?: string;
	  };

function parseQueryParameter(param: ParameterInput) {
	if (typeof param === "string") {
		return { name: param, id: param };
	}
	return {
		name: param.name,
		id: param.id || param.name,
		start: param.start_date,
		end: param.end_date,
		granularity: param.granularity,
	};
}

interface QueryResult {
	data: Record<string, unknown>[];
	error?: string;
	parameter: string;
	success: boolean;
}

async function attachProfileIdentities(
	websiteId: string,
	results: QueryResult[]
) {
	const profileIds = new Set<string>();
	for (const result of results) {
		for (const row of result.data) {
			if (typeof row.profile_id === "string" && row.profile_id) {
				profileIds.add(row.profile_id);
			}
		}
	}
	if (profileIds.size === 0) {
		return;
	}

	const identities = await db
		.select({
			profileId: profiles.profileId,
			displayName: profiles.displayName,
			email: profiles.email,
		})
		.from(profiles)
		.where(
			and(
				eq(profiles.websiteId, websiteId),
				inArray(profiles.profileId, [...profileIds])
			)
		);
	const identityByProfileId = new Map(
		identities.map((identity) => [identity.profileId, identity])
	);

	for (const result of results) {
		for (const row of result.data) {
			const identity =
				typeof row.profile_id === "string"
					? identityByProfileId.get(row.profile_id)
					: undefined;
			row.display_name = identity ? revealPii(identity.displayName) : null;
			row.email = identity ? revealPii(identity.email) : null;
		}
	}
}

async function executeDynamicQuery(
	request: DynamicQueryRequestType,
	projectId: string,
	projectType: ProjectType,
	timezone: string,
	domainCache?: Record<string, string | null>,
	scope?: { organizationWebsiteIds?: string[] }
): Promise<{
	queryId: string;
	data: QueryResult[];
	meta: {
		parameters: (string | Record<string, unknown>)[];
		total_parameters: number;
		page: number;
		limit: number;
		filters_applied: number;
	};
}> {
	const { startDate: from, endDate: to } = request;

	const domain =
		projectType === "website"
			? (domainCache?.[projectId] ??
				(await getWebsiteDomain(projectId).catch(() => null)))
			: null;
	const organizationWebsiteIds =
		projectType === "organization"
			? (scope?.organizationWebsiteIds ?? [])
			: undefined;

	const requestFilters = (request.filters || []) as Filter[];
	const traitFilters = requestFilters.filter((f) =>
		isTraitFilterField(f.field)
	);
	let effectiveFilters = requestFilters;
	let traitError: string | null = null;
	if (traitFilters.length > 0) {
		if (projectType === "website") {
			try {
				const segment = await resolveTraitSegment(
					projectId,
					traitFilters as TraitFilter[]
				);
				effectiveFilters = [
					...requestFilters.filter((f) => !isTraitFilterField(f.field)),
					{ field: "profile_id", op: "in", value: segment },
				];
			} catch (error) {
				if (error instanceof TraitFilterError) {
					traitError = error.message;
				} else {
					captureError(error, {
						route: "v1/query",
						step: "resolve_trait_segment",
					});
					traitError = "Trait filter failed";
				}
			}
		} else {
			traitError = "Trait filters are only supported for website queries";
		}
	}

	// Org-level custom_events queries: builder scans by owner_id (= organizationId
	// set at ingestion) via primary key instead of matching website_id.
	const hasCustomEventsQueries = request.parameters.some((param) => {
		const name = typeof param === "string" ? param : param.name;
		return name.startsWith("custom_event");
	});

	const isOrgCustomEvents =
		projectType === "organization" && hasCustomEventsQueries;

	type PreparedParameter =
		| { id: string; error: string }
		| { id: string; request: QueryRequest & { type: string } };

	const prepared: PreparedParameter[] = request.parameters.map((param) => {
		const { name, id, start, end, granularity } = parseQueryParameter(param);
		const paramFrom = start ? normalizeDate(start) : from;
		const paramTo = end ? normalizeDate(end) : to;

		const config = QueryBuilders[name];
		if (!config) {
			return { id, error: `Unknown query type: ${name}` };
		}

		if (traitError) {
			return { id, error: traitError };
		}
		if (
			traitFilters.length > 0 &&
			!isFilterFieldAllowed(config, "profile_id")
		) {
			return { id, error: `Trait filters are not supported for ${name}` };
		}

		if (
			(paramFrom && !isNormalizedQueryDate(paramFrom)) ||
			(paramTo && !isNormalizedQueryDate(paramTo))
		) {
			return { id, error: "Invalid parameter date range" };
		}

		const hasRequiredFields = projectId && paramFrom && paramTo;
		if (!hasRequiredFields) {
			return {
				id,
				error: "Missing resource identifier, start_date, or end_date",
			};
		}

		const orderBy =
			request.sortBy && request.sortOrder
				? `${request.sortBy} ${request.sortOrder.toUpperCase()}`
				: undefined;

		return {
			id,
			request: {
				projectId,
				type: name,
				from: paramFrom,
				to: paramTo,
				timeUnit: getTimeUnit(
					granularity || request.granularity,
					paramFrom,
					paramTo
				),
				filters: effectiveFilters.filter((f) =>
					isFilterFieldAllowed(config, f.field)
				),
				limit: request.limit || 100,
				offset: request.page ? (request.page - 1) * (request.limit || 100) : 0,
				timezone,
				organizationWebsiteIds: isOrgCustomEvents
					? (organizationWebsiteIds ?? [])
					: organizationWebsiteIds,
				orderBy,
			},
		};
	});

	const validParameters = prepared.filter(
		(p): p is { id: string; request: QueryRequest & { type: string } } =>
			"request" in p
	);
	const errorParameters = prepared.filter(
		(p): p is { id: string; error: string } => "error" in p
	);

	const resultMap = new Map<string, QueryResult>();

	for (const errorParam of errorParameters) {
		resultMap.set(errorParam.id, {
			parameter: errorParam.id,
			success: false,
			error: errorParam.error,
			data: [],
		});
	}

	if (validParameters.length > 0) {
		const results = await runPerWebsite(projectId, () =>
			executeBatch(
				validParameters.map((v) => v.request),
				{ websiteDomain: domain, timezone }
			)
		);

		for (let i = 0; i < validParameters.length; i++) {
			const param = validParameters[i];
			const result = results[i];
			if (param) {
				if (result?.error) {
					captureError(new Error(result.error), {
						query_type: param.request.type,
						route: "v1/query",
						step: "execute_batch",
					});
				}
				resultMap.set(param.id, {
					parameter: param.id,
					success: !result?.error,
					data: result?.data || [],
					error: result?.error ? QUERY_EXECUTION_ERROR_MESSAGE : undefined,
				});
			}
		}

		if (projectType === "website") {
			const profileResults = validParameters
				.filter((p) => p.request.type === "profile_list")
				.flatMap((p) => resultMap.get(p.id) ?? []);
			if (profileResults.length > 0) {
				await attachProfileIdentities(projectId, profileResults).catch(
					(error) => {
						captureError(error, {
							route: "v1/query",
							step: "attach_profile_identities",
						});
					}
				);
			}
		}
	}

	const allResults = prepared.map(
		(p) =>
			resultMap.get(p.id) || {
				parameter: p.id,
				success: false,
				error: "Unknown",
				data: [],
			}
	);

	const sortedResults = allResults.sort((a, b) => {
		const aIsError = !a.success;
		const bIsError = !b.success;
		if (!aIsError && bIsError) {
			return -1;
		}
		if (aIsError && !bIsError) {
			return 1;
		}
		return 0;
	});

	return {
		queryId: request.id || "",
		data: sortedResults,
		meta: {
			parameters: request.parameters as (string | Record<string, unknown>)[],
			total_parameters: request.parameters.length,
			page: request.page || 1,
			limit: request.limit || 100,
			filters_applied: request.filters?.length || 0,
		},
	};
}

export const query = new Elysia({ prefix: "/v1/query" })
	.derive(async ({ request }): Promise<{ auth: AuthContext }> => {
		const hasApiKey = isApiKeyPresent(request.headers);
		const [apiKey, session] = await Promise.all([
			hasApiKey ? getApiKeyFromHeader(request.headers) : null,
			auth.api.getSession({ headers: request.headers }),
		]);
		const user = session?.user ?? null;

		if (
			apiKey &&
			!(
				hasKeyScope(apiKey, "read:data") || hasKeyScope(apiKey, "read:monitors")
			)
		) {
			return {
				auth: {
					apiKey: null,
					user: null,
					isAuthenticated: false,
					authMethod: "none",
					activeOrganizationId: null,
				},
			};
		}

		const activeOrganizationId =
			(session?.session as { activeOrganizationId?: string | null } | undefined)
				?.activeOrganizationId ?? null;

		return {
			auth: {
				apiKey,
				user,
				isAuthenticated: Boolean(user ?? apiKey),
				authMethod: apiKey ? "api_key" : user ? "session" : "none",
				activeOrganizationId,
			},
		};
	})

	.get("/websites", ({ auth: ctx, request }) =>
		(async () => {
			const requestId = getRequestId(request);
			if (!ctx.isAuthenticated) {
				return createAuthFailedResponse(requestId);
			}
			const list = await getAccessibleWebsites(ctx);
			const count = Array.isArray(list) ? list.length : 0;
			mergeWideEvent({
				websites_count: count,
				auth_method: ctx.authMethod,
			});
			return { success: true, requestId, websites: list, total: count };
		})()
	)

	.get(
		"/types",
		({
			query: params,
			request,
		}: {
			query: { include_meta?: string };
			request: Request;
		}) => {
			const requestId = getRequestId(request);
			const includeMeta = params.include_meta === "true";
			const configs = Object.fromEntries(
				Object.entries(QueryBuilders).map(([key, cfg]) => [
					key,
					{
						allowedFilters: allowedFilterFields(cfg),
						customizable: cfg.customizable,
						defaultLimit: cfg.limit,
						publicAccess: cfg.publicAccess === true,
						...(includeMeta && { meta: cfg.meta }),
					},
				])
			);
			return {
				success: true,
				requestId,
				types: Object.keys(QueryBuilders),
				configs,
				presets: Object.keys(DatePresets),
			};
		}
	)

	.post(
		"/compile",
		async ({
			body,
			query: q,
			auth: ctx,
			request,
		}: {
			body: CompileRequestType;
			query: { website_id?: string; timezone?: string };
			auth: AuthContext;
			request: Request;
		}) => {
			const requestId = getRequestId(request);
			const rateLimited = await enforceQueryRateLimit(
				ctx,
				"compile",
				300,
				requestId,
				request
			);
			if (rateLimited) {
				return rateLimited;
			}
			const accessResult = await resolveProjectAccess(ctx, {
				websiteId: q.website_id,
				queryTypes: body.type ? [String(body.type)] : [],
			});

			if (!accessResult.success) {
				return createErrorResponse(
					accessResult.error,
					accessResult.code,
					accessResult.status,
					requestId
				);
			}

			try {
				const domain = q.website_id
					? await getWebsiteDomain(q.website_id)
					: null;
				return {
					success: true,
					requestId,
					...compileQuery(
						body as QueryRequest,
						domain,
						validateTimezone(q.timezone) || "UTC"
					),
				};
			} catch (e) {
				return createErrorResponse(
					e instanceof Error ? e.message : "Compilation failed",
					"COMPILATION_ERROR",
					400,
					requestId
				);
			}
		},
		{ body: CompileRequestSchema }
	)

	.post(
		"/",
		({
			body,
			query: q,
			auth: ctx,
			request,
		}: {
			body: DynamicQueryRequestType | DynamicQueryRequestType[];
			query: {
				website_id?: string;
				schedule_id?: string;
				link_id?: string;
				organization_id?: string;
				timezone?: string;
			};
			auth: AuthContext;
			request: Request;
		}) =>
			(async () => {
				const requestId = getRequestId(request);
				const timezone = validateTimezone(q.timezone) || "UTC";
				const rateLimited = await enforceQueryRateLimit(
					ctx,
					"execute",
					120,
					requestId,
					request
				);
				if (rateLimited) {
					return rateLimited;
				}

				const accessResult = await resolveProjectAccess(ctx, {
					websiteId: q.website_id,
					scheduleId: q.schedule_id,
					linkId: q.link_id,
					organizationId: q.organization_id,
					queryTypes: extractQueryTypes(body),
				});

				if (!accessResult.success) {
					return createErrorResponse(
						accessResult.error,
						accessResult.code,
						accessResult.status,
						requestId
					);
				}

				if (accessResult.projectType === "website" && q.website_id) {
					const queryTypes = extractQueryTypes(body);
					const website = await db.query.websites.findFirst({
						where: { id: q.website_id },
						columns: { organizationId: true },
					});
					if (website) {
						const gateFail = await enforceFeatureGatesForQueryTypes(
							queryTypes,
							website
						);
						if (gateFail) {
							return createErrorResponse(
								gateFail.error,
								"FEATURE_UNAVAILABLE",
								402,
								requestId
							);
						}
					}
				}

				const organizationWebsiteIds =
					accessResult.projectType === "organization"
						? await getOrganizationWebsiteIds(accessResult.projectId)
						: undefined;
				const organizationScope = organizationWebsiteIds
					? { organizationWebsiteIds }
					: undefined;

				const isBatch = Array.isArray(body);
				mergeWideEvent({
					query_is_batch: isBatch,
					query_count: isBatch ? body.length : 1,
					...(organizationWebsiteIds && {
						query_organization_website_count: organizationWebsiteIds.length,
					}),
				});

				if (isBatch) {
					for (let i = 0; i < body.length; i++) {
						const req = body[i];
						if (req) {
							const validation = validateQueryRequest(req, timezone);
							if (!validation.valid) {
								return createValidationErrorResponse(
									validation.errors.map((e) => ({
										...e,
										field: `batch[${i}].${e.field}`,
									})),
									requestId
								);
							}
						}
					}

					const cache = await getCachedWebsiteDomain([]);
					const results = await Promise.all(
						body.map((req) => {
							const validation = validateQueryRequest(req, timezone);
							if (!validation.valid) {
								return {
									queryId: req.id,
									data: [],
									meta: {
										parameters: req.parameters,
										total_parameters: req.parameters.length,
										page: req.page || 1,
										limit: req.limit || 100,
										filters_applied: req.filters?.length || 0,
									},
								};
							}
							const resolvedReq = {
								...req,
								startDate: validation.startDate,
								endDate: validation.endDate,
							};
							return executeDynamicQuery(
								resolvedReq,
								accessResult.projectId,
								accessResult.projectType,
								timezone,
								cache,
								organizationScope
							).catch((error) => {
								captureError(error, {
									query_id: req.id,
									route: "v1/query",
									step: "execute_dynamic_query",
								});
								return {
									queryId: req.id,
									data: [
										{
											parameter: req.parameters[0] as string,
											success: false,
											error: QUERY_EXECUTION_ERROR_MESSAGE,
											data: [],
										},
									],
									meta: {
										parameters: req.parameters,
										total_parameters: req.parameters.length,
										page: req.page || 1,
										limit: req.limit || 100,
										filters_applied: req.filters?.length || 0,
									},
								};
							});
						})
					);
					return { success: true, requestId, batch: true, results };
				}

				const validation = validateQueryRequest(body, timezone);
				if (!validation.valid) {
					return createValidationErrorResponse(validation.errors, requestId);
				}

				const resolvedBody = {
					...body,
					startDate: validation.startDate,
					endDate: validation.endDate,
				};

				return {
					success: true,
					requestId,
					...(await executeDynamicQuery(
						resolvedBody,
						accessResult.projectId,
						accessResult.projectType,
						timezone,
						undefined,
						organizationScope
					)),
				};
			})(),
		{
			body: t.Union([
				DynamicQueryRequestSchema,
				t.Array(DynamicQueryRequestSchema),
			]),
		}
	);
