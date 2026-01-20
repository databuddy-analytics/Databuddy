import { auth } from "@databuddy/auth";
import {
	and,
	db,
	eq,
	inArray,
	isNull,
	links,
	member,
	uptimeSchedules,
	websites,
} from "@databuddy/db";
import { filterOptions } from "@databuddy/shared/lists/filters";
import type { CustomQueryRequest } from "@databuddy/shared/types/custom-query";
import { Elysia, t } from "elysia";
import {
	type ApiKeyRow,
	getAccessibleWebsiteIds,
	getApiKeyFromHeader,
	hasGlobalAccess,
	hasKeyScope,
	isApiKeyPresent,
} from "../lib/api-key";
import { record, setAttributes } from "../lib/tracing";
import { getCachedWebsiteDomain, getWebsiteDomain } from "../lib/website-utils";
import { compileQuery, executeBatch } from "../query";
import { QueryBuilders } from "../query/builders";
import { executeCustomQuery } from "../query/custom-query-builder";
import type { Filter, QueryRequest } from "../query/types";
import {
	CompileRequestSchema,
	type CompileRequestType,
	type DatePreset,
	DatePresets,
	DynamicQueryRequestSchema,
	type DynamicQueryRequestType,
} from "../schemas/query-schemas";

const MAX_HOURLY_DAYS = 30;
const MS_PER_DAY = 86_400_000;
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T/;

/**
 * Normalize date input to YYYY-MM-DD format
 * Accepts: "2024-01-15", "2024-01-15T14:30:00.000Z", etc.
 */
function normalizeDate(input: string): string {
	// Already in correct format
	if (DATE_FORMAT_REGEX.test(input)) {
		return input;
	}
	// ISO datetime format - extract date part
	if (ISO_DATETIME_REGEX.test(input)) {
		return input.split("T")[0] as string;
	}
	// Try to parse as date
	const parsed = new Date(input);
	if (!Number.isNaN(parsed.getTime())) {
		return parsed.toISOString().split("T")[0] as string;
	}
	// Return as-is (will fail validation)
	return input;
}

// ============================================================================
// Date Preset Resolution
// ============================================================================

function resolveDatePreset(
	preset: DatePreset,
	timezone: string
): { startDate: string; endDate: string } {
	const now = new Date();
	const today = new Date(
		now.toLocaleDateString("en-CA", { timeZone: timezone })
	);
	const formatDate = (d: Date) => d.toISOString().split("T")[0] as string;

	switch (preset) {
		case "today":
			return { startDate: formatDate(today), endDate: formatDate(today) };
		case "yesterday": {
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);
			return {
				startDate: formatDate(yesterday),
				endDate: formatDate(yesterday),
			};
		}
		case "last_7d": {
			const start = new Date(today);
			start.setDate(start.getDate() - 6);
			return { startDate: formatDate(start), endDate: formatDate(today) };
		}
		case "last_14d": {
			const start = new Date(today);
			start.setDate(start.getDate() - 13);
			return { startDate: formatDate(start), endDate: formatDate(today) };
		}
		case "last_30d": {
			const start = new Date(today);
			start.setDate(start.getDate() - 29);
			return { startDate: formatDate(start), endDate: formatDate(today) };
		}
		case "last_90d": {
			const start = new Date(today);
			start.setDate(start.getDate() - 89);
			return { startDate: formatDate(start), endDate: formatDate(today) };
		}
		case "this_week": {
			const start = new Date(today);
			start.setDate(start.getDate() - start.getDay());
			return { startDate: formatDate(start), endDate: formatDate(today) };
		}
		case "last_week": {
			const end = new Date(today);
			end.setDate(end.getDate() - end.getDay() - 1);
			const start = new Date(end);
			start.setDate(start.getDate() - 6);
			return { startDate: formatDate(start), endDate: formatDate(end) };
		}
		case "this_month": {
			const start = new Date(today.getFullYear(), today.getMonth(), 1);
			return { startDate: formatDate(start), endDate: formatDate(today) };
		}
		case "last_month": {
			const end = new Date(today.getFullYear(), today.getMonth(), 0);
			const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
			return { startDate: formatDate(start), endDate: formatDate(end) };
		}
		case "this_year": {
			const start = new Date(today.getFullYear(), 0, 1);
			return { startDate: formatDate(start), endDate: formatDate(today) };
		}
		default:
			return { startDate: formatDate(today), endDate: formatDate(today) };
	}
}

// ============================================================================
// Validation Helpers
// ============================================================================

interface ValidationError {
	field: string;
	message: string;
	suggestion?: string;
}

function findClosestMatch(input: string, options: string[]): string | null {
	const inputLower = input.toLowerCase();
	let bestMatch: string | null = null;
	let bestScore = 0;

	for (const option of options) {
		const optionLower = option.toLowerCase();

		// Exact prefix match
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

		// Levenshtein-like simple check (for typos)
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
	const errors: ValidationError[] = [];
	const queryTypes = Object.keys(QueryBuilders);

	// Validate parameters
	if (!request.parameters || request.parameters.length === 0) {
		errors.push({
			field: "parameters",
			message: "At least one parameter is required",
		});
	} else {
		for (let i = 0; i < request.parameters.length; i++) {
			const param = request.parameters[i];
			const name = typeof param === "string" ? param : param?.name;
			if (name && !QueryBuilders[name]) {
				const suggestion = findClosestMatch(name, queryTypes);
				errors.push({
					field: `parameters[${i}]`,
					message: `Unknown query type: ${name}`,
					suggestion: suggestion ? `Did you mean '${suggestion}'?` : undefined,
				});
			}
		}
	}

	// Resolve dates from preset or explicit values
	// Normalize dates to YYYY-MM-DD (accepts ISO datetime strings too)
	let startDate = request.startDate ? normalizeDate(request.startDate) : undefined;
	let endDate = request.endDate ? normalizeDate(request.endDate) : undefined;

	if (request.preset) {
		if (DatePresets[request.preset]) {
			const resolved = resolveDatePreset(request.preset, timezone);
			startDate = resolved.startDate;
			endDate = resolved.endDate;
		} else {
			const validPresets = Object.keys(DatePresets);
			const suggestion = findClosestMatch(request.preset, validPresets);
			errors.push({
				field: "preset",
				message: `Invalid date preset: ${request.preset}`,
				suggestion: suggestion
					? `Did you mean '${suggestion}'? Valid presets: ${validPresets.join(", ")}`
					: `Valid presets: ${validPresets.join(", ")}`,
			});
		}
	}

	// Check date requirements
	if (!(startDate || request.preset)) {
		errors.push({
			field: "startDate",
			message: "Either startDate or preset is required",
		});
	}
	if (!(endDate || request.preset)) {
		errors.push({
			field: "endDate",
			message: "Either endDate or preset is required",
		});
	}

	// Validate normalized date format
	if (startDate && !DATE_FORMAT_REGEX.test(startDate)) {
		errors.push({
			field: "startDate",
			message: `Invalid date: ${request.startDate}. Could not parse as a valid date`,
		});
	}
	if (endDate && !DATE_FORMAT_REGEX.test(endDate)) {
		errors.push({
			field: "endDate",
			message: `Invalid date: ${request.endDate}. Could not parse as a valid date`,
		});
	}

	// Validate limit
	if (request.limit !== undefined) {
		if (request.limit < 1) {
			errors.push({
				field: "limit",
				message: "Limit must be at least 1",
			});
		} else if (request.limit > 10_000) {
			errors.push({
				field: "limit",
				message: "Limit cannot exceed 10000",
			});
		}
	}

	// Validate page
	if (request.page !== undefined && request.page < 1) {
		errors.push({
			field: "page",
			message: "Page must be at least 1",
		});
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		startDate: startDate as string,
		endDate: endDate as string,
	};
}

function generateRequestId(): string {
	return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

interface AuthContext {
	apiKey: ApiKeyRow | null;
	user: { id: string; name: string; email: string } | null;
	isAuthenticated: boolean;
	authMethod: "api_key" | "session" | "none";
}

type ProjectAccessResult =
	| {
		success: true;
		projectId: string;
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
		{ status: 401, headers: { "Content-Type": "application/json" } }
	);
}

function createErrorResponse(
	error: string,
	code: string,
	status = 403,
	requestId?: string,
	details?: ValidationError[]
): Response {
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
			headers: { "Content-Type": "application/json" },
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

/**
 * Get the owner ID for a website (organizationId)
 * Used for LLM queries which are scoped by owner, not website
 */
async function getWebsiteOwnerId(websiteId: string): Promise<string | null> {
	const website = await db.query.websites.findFirst({
		where: eq(websites.id, websiteId),
		columns: {
			organizationId: true,
		},
	});

	if (!website) {
		return null;
	}

	return website.organizationId ?? null;
}

async function verifyWebsiteAccess(
	ctx: AuthContext,
	websiteId: string
): Promise<boolean> {
	const website = await db.query.websites.findFirst({
		where: eq(websites.id, websiteId),
		columns: {
			id: true,
			isPublic: true,
			organizationId: true,
		},
	});

	if (!website) {
		return false;
	}

	if (website.isPublic) {
		return true;
	}

	if (!ctx.isAuthenticated) {
		return false;
	}

	// Website must belong to a workspace
	if (!website.organizationId) {
		return false;
	}

	if (ctx.apiKey) {
		if (hasGlobalAccess(ctx.apiKey)) {
			if (ctx.apiKey.organizationId) {
				return website.organizationId === ctx.apiKey.organizationId;
			}
			return false;
		}

		const accessibleIds = getAccessibleWebsiteIds(ctx.apiKey);
		return accessibleIds.includes(websiteId);
	}

	if (ctx.user) {
		const membership = await db.query.member.findFirst({
			where: and(
				eq(member.userId, ctx.user.id),
				eq(member.organizationId, website.organizationId)
			),
			columns: {
				id: true,
			},
		});

		return !!membership;
	}

	return false;
}

async function verifyScheduleAccess(
	ctx: AuthContext,
	scheduleId: string
): Promise<boolean> {
	const schedule = await db.query.uptimeSchedules.findFirst({
		where: eq(uptimeSchedules.id, scheduleId),
		columns: {
			id: true,
			organizationId: true,
		},
	});

	if (!schedule) {
		return false;
	}

	if (!ctx.isAuthenticated) {
		return false;
	}

	// Check workspace membership
	if (ctx.user) {
		const membership = await db.query.member.findFirst({
			where: and(
				eq(member.userId, ctx.user.id),
				eq(member.organizationId, schedule.organizationId)
			),
			columns: { id: true },
		});
		return !!membership;
	}

	if (ctx.apiKey) {
		return ctx.apiKey.organizationId === schedule.organizationId;
	}

	return false;
}

async function verifyLinkAccess(
	ctx: AuthContext,
	linkId: string
): Promise<boolean> {
	const link = await db.query.links.findFirst({
		where: and(eq(links.id, linkId), isNull(links.deletedAt)),
		columns: {
			id: true,
			organizationId: true,
			createdBy: true,
		},
	});

	if (!link) {
		return false;
	}

	if (!ctx.isAuthenticated) {
		return false;
	}

	// Check organization membership
	if (ctx.user && link.organizationId) {
		const membership = await db.query.member.findFirst({
			where: and(
				eq(member.userId, ctx.user.id),
				eq(member.organizationId, link.organizationId)
			),
			columns: { id: true },
		});
		return !!membership;
	}

	// Check direct ownership
	if (ctx.user) {
		return link.createdBy === ctx.user.id;
	}

	if (ctx.apiKey) {
		return ctx.apiKey.organizationId === link.organizationId;
	}

	return false;
}

async function resolveProjectAccess(
	ctx: AuthContext,
	options: { websiteId?: string; scheduleId?: string; linkId?: string }
): Promise<ProjectAccessResult> {
	const { websiteId, scheduleId, linkId } = options;

	// Check link_id first (for link shortener)
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
		return { success: true, projectId: linkId };
	}

	// Check schedule_id (for custom uptime monitors)
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
		return { success: true, projectId: scheduleId };
	}

	// Check website access (handles public websites)
	if (websiteId) {
		const hasAccess = await verifyWebsiteAccess(ctx, websiteId);
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
		return { success: true, projectId: websiteId };
	}

	// No project identifier provided
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
		error: "Missing project identifier (website_id, schedule_id, or link_id)",
		code: "MISSING_PROJECT_ID",
		status: 400,
	};
}

async function getAccessibleWebsites(authCtx: AuthContext) {
	const select = {
		id: websites.id,
		name: websites.name,
		domain: websites.domain,
		isPublic: websites.isPublic,
		createdAt: websites.createdAt,
	};

	if (authCtx.user) {
		const userMemberships = await db.query.member.findMany({
			where: eq(member.userId, authCtx.user.id),
			columns: { organizationId: true },
		});
		const orgIds = userMemberships.map((m) => m.organizationId);

		if (orgIds.length === 0) {
			return [];
		}

		return db
			.select(select)
			.from(websites)
			.where(inArray(websites.organizationId, orgIds))
			.orderBy((t) => t.createdAt);
	}

	if (authCtx.apiKey) {
		if (hasGlobalAccess(authCtx.apiKey)) {
			if (!authCtx.apiKey.organizationId) {
				return [];
			}
			return db
				.select(select)
				.from(websites)
				.where(eq(websites.organizationId, authCtx.apiKey.organizationId))
				.orderBy((t) => t.createdAt);
		}

		const ids = getAccessibleWebsiteIds(authCtx.apiKey);
		if (ids.length === 0) {
			return [];
		}
		return db
			.select(select)
			.from(websites)
			.where(inArray(websites.id, ids))
			.orderBy((t) => t.createdAt);
	}

	return [];
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
	parameter: string;
	success: boolean;
	data: Record<string, unknown>[];
	error?: string;
}

async function executeDynamicQuery(
	request: DynamicQueryRequestType,
	projectId: string,
	timezone: string,
	domainCache?: Record<string, string | null>
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

	// Try to get domain for website IDs (will return null for schedule IDs)
	const domain =
		domainCache?.[projectId] ??
		(await getWebsiteDomain(projectId).catch(() => null));

	// Check if any LLM queries are requested - they need owner_id, not website_id
	const hasLlmQueries = request.parameters.some((param) => {
		const name = typeof param === "string" ? param : param.name;
		return name.startsWith("llm_");
	});

	// Resolve owner ID for LLM queries (organizationId or userId)
	let ownerId: string | null = null;
	if (hasLlmQueries) {
		ownerId = await getWebsiteOwnerId(projectId);
	}

	type PreparedParameter =
		| { id: string; error: string }
		| { id: string; request: QueryRequest & { type: string } };

	const prepared: PreparedParameter[] = request.parameters.map((param) => {
		const { name, id, start, end, granularity } = parseQueryParameter(param);
		const paramFrom = start || from;
		const paramTo = end || to;

		if (!QueryBuilders[name]) {
			return { id, error: `Unknown query type: ${name}` };
		}

		const isLlmQuery = name.startsWith("llm_");
		const effectiveProjectId = isLlmQuery ? ownerId : projectId;

		const hasRequiredFields = effectiveProjectId && paramFrom && paramTo;
		if (!hasRequiredFields) {
			return {
				id,
				error:
					isLlmQuery && !ownerId
						? "Could not resolve owner for LLM query"
						: "Missing project identifier, start_date, or end_date",
			};
		}

		return {
			id,
			request: {
				projectId: effectiveProjectId,
				type: name,
				from: paramFrom,
				to: paramTo,
				timeUnit: getTimeUnit(
					granularity || request.granularity,
					paramFrom,
					paramTo
				),
				filters: (request.filters || []) as Filter[],
				limit: request.limit || 100,
				offset: request.page ? (request.page - 1) * (request.limit || 100) : 0,
				timezone,
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

	// Add error results
	for (const errorParam of errorParameters) {
		resultMap.set(errorParam.id, {
			parameter: errorParam.id,
			success: false,
			error: errorParam.error,
			data: [],
		});
	}

	// Execute valid queries
	if (validParameters.length > 0) {
		const results = await executeBatch(
			validParameters.map((v) => v.request),
			{ websiteDomain: domain, timezone }
		);

		for (let i = 0; i < validParameters.length; i++) {
			const param = validParameters[i];
			const result = results[i];
			if (param) {
				resultMap.set(param.id, {
					parameter: param.id,
					success: !result?.error,
					data: result?.data || [],
					error: result?.error,
				});
			}
		}
	}

	// Build results array maintaining parameter order
	const allResults = prepared.map(
		(p) =>
			resultMap.get(p.id) || {
				parameter: p.id,
				success: false,
				error: "Unknown",
				data: [],
			}
	);

	// Sort: successes first, then errors
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

		if (apiKey && !hasKeyScope(apiKey, "read:data")) {
			return {
				auth: {
					apiKey: null,
					user: null,
					isAuthenticated: false,
					authMethod: "none",
				},
			};
		}

		return {
			auth: {
				apiKey,
				user,
				isAuthenticated: Boolean(user ?? apiKey),
				authMethod: apiKey ? "api_key" : user ? "session" : "none",
			},
		};
	})

	.get("/websites", ({ auth: ctx }) =>
		record("getWebsites", async () => {
			const requestId = generateRequestId();
			if (!ctx.isAuthenticated) {
				return createAuthFailedResponse(requestId);
			}
			const list = await getAccessibleWebsites(ctx);
			const count = Array.isArray(list) ? list.length : 0;
			setAttributes({
				websites_count: count,
				auth_method: ctx.authMethod,
				request_id: requestId,
			});
			return { success: true, requestId, websites: list, total: count };
		})
	)

	.get("/types", ({ query: params }: { query: { include_meta?: string } }) => {
		const requestId = generateRequestId();
		const includeMeta = params.include_meta === "true";
		const configs = Object.fromEntries(
			Object.entries(QueryBuilders).map(([key, cfg]) => [
				key,
				{
					allowedFilters:
						cfg.allowedFilters ?? filterOptions.map((f) => f.value),
					customizable: cfg.customizable,
					defaultLimit: cfg.limit,
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
	})

	.post(
		"/compile",
		async ({
			body,
			query: q,
			auth: ctx,
		}: {
			body: CompileRequestType;
			query: { website_id?: string; timezone?: string };
			auth: AuthContext;
		}) => {
			const requestId = generateRequestId();
			const accessResult = await resolveProjectAccess(ctx, {
				websiteId: q.website_id,
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
					...compileQuery(body as QueryRequest, domain, q.timezone || "UTC"),
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
		}: {
			body: DynamicQueryRequestType | DynamicQueryRequestType[];
			query: {
				website_id?: string;
				schedule_id?: string;
				link_id?: string;
				timezone?: string;
			};
			auth: AuthContext;
		}) =>
			record("executeQuery", async () => {
				const requestId = generateRequestId();
				const timezone = q.timezone || "UTC";

				const accessResult = await resolveProjectAccess(ctx, {
					websiteId: q.website_id,
					scheduleId: q.schedule_id,
					linkId: q.link_id,
				});

				if (!accessResult.success) {
					return createErrorResponse(
						accessResult.error,
						accessResult.code,
						accessResult.status,
						requestId
					);
				}

				const isBatch = Array.isArray(body);
				setAttributes({
					query_is_batch: isBatch,
					query_count: isBatch ? body.length : 1,
					request_id: requestId,
				});

				if (isBatch) {
					// Validate all requests in batch first
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
								timezone,
								cache
							).catch((e) => ({
								queryId: req.id,
								data: [
									{
										parameter: req.parameters[0] as string,
										success: false,
										error: e instanceof Error ? e.message : "Query failed",
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
							}));
						})
					);
					return { success: true, requestId, batch: true, results };
				}

				// Single query - validate and resolve dates
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
						timezone
					)),
				};
			}),
		{
			body: t.Union([
				DynamicQueryRequestSchema,
				t.Array(DynamicQueryRequestSchema),
			]),
		}
	)

	.post(
		"/custom",
		async ({
			body,
			query: q,
			auth: ctx,
		}: {
			body: CustomQueryRequest;
			query: { website_id?: string };
			auth: AuthContext;
		}) =>
			record("executeCustomQuery", async () => {
				const requestId = generateRequestId();

				if (!q.website_id) {
					return createErrorResponse(
						"website_id is required",
						"MISSING_WEBSITE_ID",
						400,
						requestId
					);
				}

				const accessResult = await resolveProjectAccess(ctx, {
					websiteId: q.website_id,
				});

				if (!accessResult.success) {
					return createErrorResponse(
						accessResult.error,
						accessResult.code,
						accessResult.status,
						requestId
					);
				}

				setAttributes({
					custom_query_table: body.query.table,
					custom_query_selects: body.query.selects.length,
					custom_query_filters: body.query.filters?.length || 0,
				});

				const result = await executeCustomQuery(body, accessResult.projectId);

				if (!result.success) {
					return createErrorResponse(
						result.error ?? "Query execution failed",
						"QUERY_ERROR",
						400,
						requestId
					);
				}

				return { ...result, requestId };
			}),
		{
			body: t.Object({
				query: t.Object({
					table: t.String(),
					selects: t.Array(
						t.Object({
							field: t.String(),
							aggregate: t.Union([
								t.Literal("count"),
								t.Literal("sum"),
								t.Literal("avg"),
								t.Literal("max"),
								t.Literal("min"),
								t.Literal("uniq"),
							]),
							alias: t.Optional(t.String()),
						})
					),
					filters: t.Optional(
						t.Array(
							t.Object({
								field: t.String(),
								operator: t.Union([
									t.Literal("eq"),
									t.Literal("ne"),
									t.Literal("gt"),
									t.Literal("lt"),
									t.Literal("gte"),
									t.Literal("lte"),
									t.Literal("contains"),
									t.Literal("not_contains"),
									t.Literal("starts_with"),
									t.Literal("in"),
									t.Literal("not_in"),
								]),
								value: t.Union([
									t.String(),
									t.Number(),
									t.Array(t.Union([t.String(), t.Number()])),
								]),
							})
						)
					),
					groupBy: t.Optional(t.Array(t.String())),
				}),
				startDate: t.String(),
				endDate: t.String(),
				timezone: t.Optional(t.String()),
				granularity: t.Optional(
					t.Union([t.Literal("hourly"), t.Literal("daily")])
				),
				limit: t.Optional(t.Number()),
			}),
		}
	);
