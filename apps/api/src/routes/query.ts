import { auth } from "@databuddy/auth";
import {
	and,
	db,
	eq,
	inArray,
	isNull,
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
	DynamicQueryRequestSchema,
	type DynamicQueryRequestType,
} from "../schemas/query-schemas";

const MAX_HOURLY_DAYS = 7;
const MS_PER_DAY = 86_400_000;

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

const AUTH_FAILED_RESPONSE = new Response(
	JSON.stringify({
		success: false,
		error: "Authentication required",
		code: "AUTH_REQUIRED",
	}),
	{ status: 401, headers: { "Content-Type": "application/json" } }
);

function createErrorResponse(
	error: string,
	code: string,
	status = 403
): Response {
	return new Response(JSON.stringify({ success: false, error, code }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
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
			userId: true,
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

	if (ctx.apiKey) {
		if (hasGlobalAccess(ctx.apiKey)) {
			if (ctx.apiKey.organizationId) {
				return website.organizationId === ctx.apiKey.organizationId;
			}
			if (ctx.apiKey.userId) {
				return website.userId === ctx.apiKey.userId && !website.organizationId;
			}
			return false;
		}

		const accessibleIds = getAccessibleWebsiteIds(ctx.apiKey);
		return accessibleIds.includes(websiteId);
	}

	if (ctx.user) {
		// Direct ownership (personal websites)
		if (website.userId === ctx.user.id && !website.organizationId) {
			return true;
		}

		// Organization access - check if user is a member of the website's organization
		if (website.organizationId) {
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
			userId: true,
			websiteId: true,
		},
	});

	if (!schedule) {
		return false;
	}

	if (!ctx.isAuthenticated) {
		return false;
	}

	// If schedule has a websiteId, verify website access instead
	if (schedule.websiteId) {
		return verifyWebsiteAccess(ctx, schedule.websiteId);
	}

	// For custom monitors (no websiteId), check user ownership
	if (ctx.user) {
		return schedule.userId === ctx.user.id;
	}

	if (ctx.apiKey) {
		// API key must belong to the same user who owns the schedule
		return ctx.apiKey.userId === schedule.userId;
	}

	return false;
}

async function resolveProjectAccess(
	ctx: AuthContext,
	options: { websiteId?: string; scheduleId?: string }
): Promise<ProjectAccessResult> {
	const { websiteId, scheduleId } = options;

	// Check schedule_id first (for custom uptime monitors)
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
		error: "Missing project identifier (website_id or schedule_id)",
		code: "MISSING_PROJECT_ID",
		status: 400,
	};
}

function getAccessibleWebsites(authCtx: AuthContext) {
	const select = {
		id: websites.id,
		name: websites.name,
		domain: websites.domain,
		isPublic: websites.isPublic,
		createdAt: websites.createdAt,
	};

	if (authCtx.user) {
		return db
			.select(select)
			.from(websites)
			.where(
				and(
					eq(websites.userId, authCtx.user.id),
					isNull(websites.organizationId)
				)
			)
			.orderBy((t) => t.createdAt);
	}

	if (authCtx.apiKey) {
		if (hasGlobalAccess(authCtx.apiKey)) {
			const filter = authCtx.apiKey.organizationId
				? eq(websites.organizationId, authCtx.apiKey.organizationId)
				: authCtx.apiKey.userId
					? and(
						eq(websites.userId, authCtx.apiKey.userId),
						isNull(websites.organizationId)
					)
					: eq(websites.id, "");
			return db
				.select(select)
				.from(websites)
				.where(filter)
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

		const hasRequiredFields = projectId && paramFrom && paramTo;
		if (!hasRequiredFields) {
			return {
				id,
				error: "Missing project identifier, start_date, or end_date",
			};
		}

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
			if (!ctx.isAuthenticated) {
				return AUTH_FAILED_RESPONSE;
			}
			const list = await getAccessibleWebsites(ctx);
			const count = Array.isArray(list) ? list.length : 0;
			setAttributes({ websites_count: count, auth_method: ctx.authMethod });
			return { success: true, websites: list, total: count };
		})
	)

	.get(
		"/types",
		({
			query: params,
			auth: ctx,
		}: {
			query: { include_meta?: string };
			auth: AuthContext;
		}) => {
			if (!ctx.isAuthenticated) {
				return AUTH_FAILED_RESPONSE;
			}
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
			return { success: true, types: Object.keys(QueryBuilders), configs };
		}
	)

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
			const accessResult = await resolveProjectAccess(ctx, {
				websiteId: q.website_id,
			});

			if (!accessResult.success) {
				return createErrorResponse(
					accessResult.error,
					accessResult.code,
					accessResult.status
				);
			}

			try {
				const domain = q.website_id
					? await getWebsiteDomain(q.website_id)
					: null;
				return {
					success: true,
					...compileQuery(body as QueryRequest, domain, q.timezone || "UTC"),
				};
			} catch (e) {
				return {
					success: false,
					error: e instanceof Error ? e.message : "Compilation failed",
				};
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
			query: { website_id?: string; schedule_id?: string; timezone?: string };
			auth: AuthContext;
		}) =>
			record("executeQuery", async () => {
				const accessResult = await resolveProjectAccess(ctx, {
					websiteId: q.website_id,
					scheduleId: q.schedule_id,
				});

				if (!accessResult.success) {
					return {
						success: false,
						error: accessResult.error,
						code: accessResult.code,
					};
				}

				const timezone = q.timezone || "UTC";
				const isBatch = Array.isArray(body);
				setAttributes({
					query_is_batch: isBatch,
					query_count: isBatch ? body.length : 1,
				});

				if (isBatch) {
					const cache = await getCachedWebsiteDomain([]);
					const results = await Promise.all(
						body.map((req) =>
							executeDynamicQuery(
								req,
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
							}))
						)
					);
					return { success: true, batch: true, results };
				}

				return {
					success: true,
					...(await executeDynamicQuery(
						body,
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
				if (!q.website_id) {
					return {
						success: false,
						error: "website_id is required",
						code: "MISSING_WEBSITE_ID",
					};
				}

				const accessResult = await resolveProjectAccess(ctx, {
					websiteId: q.website_id,
				});

				if (!accessResult.success) {
					return {
						success: false,
						error: accessResult.error,
						code: accessResult.code,
					};
				}

				setAttributes({
					custom_query_table: body.query.table,
					custom_query_selects: body.query.selects.length,
					custom_query_filters: body.query.filters?.length || 0,
				});

				return executeCustomQuery(body, accessResult.projectId);
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
