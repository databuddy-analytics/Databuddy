import { auth } from "@databuddy/auth";
import { and, apikeyAccess, db, eq, isNull, websites } from "@databuddy/db";
import { filterOptions } from "@databuddy/shared/lists/filters";
import { Elysia, t } from "elysia";
import { getApiKeyFromHeader, isApiKeyPresent } from "../lib/api-key";
import { getCachedWebsiteDomain, getWebsiteDomain } from "../lib/website-utils";
import { compileQuery, executeQuery } from "../query";
import { QueryBuilders } from "../query/builders";
import type { QueryRequest } from "../query/types";
import {
	CompileRequestSchema,
	type CompileRequestType,
	DynamicQueryRequestSchema,
	type DynamicQueryRequestType,
} from "../schemas";

// import { databuddy } from '../lib/databuddy';

interface QueryParams {
	start_date?: string;
	startDate?: string;
	end_date?: string;
	endDate?: string;
	website_id?: string;
	timezone?: string;
}

async function checkAuth(request: Request): Promise<Response | null> {
	const apiKeyPresent = isApiKeyPresent(request.headers);
	const apiKey = apiKeyPresent
		? await getApiKeyFromHeader(request.headers)
		: null;
	const session = await auth.api.getSession({ headers: request.headers });
	const sessionUser = session?.user ?? null;

	if (sessionUser || apiKey) {
		return null; // Auth passed
	}

	return new Response(
		JSON.stringify({
			success: false,
			error: "Authentication required",
			code: "AUTH_REQUIRED",
		}),
		{
			status: 401,
			headers: { "Content-Type": "application/json" },
		}
	);
}

async function getAccessibleWebsites(request: Request) {
	const apiKeyPresent = isApiKeyPresent(request.headers);
	const apiKey = apiKeyPresent
		? await getApiKeyFromHeader(request.headers)
		: null;
	const session = await auth.api.getSession({ headers: request.headers });
	const sessionUser = session?.user ?? null;

	const baseSelect = {
		id: websites.id,
		name: websites.name,
		domain: websites.domain,
		isPublic: websites.isPublic,
		createdAt: websites.createdAt,
	};

	if (sessionUser) {
		return db
			.select(baseSelect)
			.from(websites)
			.where(
				and(
					eq(websites.userId, sessionUser.id),
					isNull(websites.organizationId)
				)
			)
			.orderBy((table) => table.createdAt);
	}

	if (apiKey) {
		// Check for global access first
		const hasGlobalAccess = await db
			.select({ count: apikeyAccess.apikeyId })
			.from(apikeyAccess)
			.where(
				and(
					eq(apikeyAccess.apikeyId, apiKey.id),
					eq(apikeyAccess.resourceType, "global")
				)
			)
			.limit(1);

		if (hasGlobalAccess.length > 0) {
			// Global access - return all websites for the API key's scope
			const filter = apiKey.organizationId
				? eq(websites.organizationId, apiKey.organizationId)
				: apiKey.userId
					? and(
							eq(websites.userId, apiKey.userId),
							isNull(websites.organizationId)
						)
					: eq(websites.id, ""); // No matches if no user/org

			return db
				.select(baseSelect)
				.from(websites)
				.where(filter)
				.orderBy((table) => table.createdAt);
		}

		// Specific website access - join with access table
		return db
			.select(baseSelect)
			.from(websites)
			.innerJoin(
				apikeyAccess,
				and(
					eq(apikeyAccess.resourceId, websites.id),
					eq(apikeyAccess.resourceType, "website"),
					eq(apikeyAccess.apikeyId, apiKey.id)
				)
			)
			.orderBy((table) => table.createdAt);
	}

	return [];
}

export const query = new Elysia({ prefix: "/v1/query" })
	.get("/websites", async ({ request }: { request: Request }) => {
		const authResult = await checkAuth(request);
		if (authResult) {
			return authResult;
		}

		try {
			const websites = await getAccessibleWebsites(request);
			return {
				success: true,
				websites,
				total: websites.length,
			};
		} catch (error) {
			return new Response(
				JSON.stringify({
					success: false,
					error:
						error instanceof Error ? error.message : "Failed to fetch websites",
					code: "INTERNAL_SERVER_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				}
			);
		}
	})
	.get(
		"/types",
		async ({
			query: params,
			request,
		}: {
			query: { include_meta?: string };
			request: Request;
		}) => {
			const authResult = await checkAuth(request);
			if (authResult) {
				return authResult;
			}

			const includeMeta = params.include_meta === "true";

			const configs = Object.fromEntries(
				Object.entries(QueryBuilders).map(([key, config]) => {
					const baseConfig = {
						allowedFilters:
							config.allowedFilters ??
							filterOptions.map((filter) => filter.value),
						customizable: config.customizable,
						defaultLimit: config.limit,
					};

					if (includeMeta) {
						return [key, { ...baseConfig, meta: config.meta }];
					}

					return [key, baseConfig];
				})
			);

			return {
				success: true,
				types: Object.keys(QueryBuilders),
				configs,
			};
		}
	)

	.post(
		"/compile",
		async ({
			body,
			query: queryParams,
		}: {
			body: CompileRequestType;
			query: { website_id?: string; timezone?: string };
		}) => {
			try {
				const { website_id } = queryParams;
				const timezone = queryParams.timezone || "UTC";
				const websiteDomain = website_id
					? await getWebsiteDomain(website_id)
					: null;

				const result = compileQuery(
					body as QueryRequest,
					websiteDomain,
					timezone
				);
				return {
					success: true,
					...result,
				};
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : "Compilation failed",
				};
			}
		},
		{
			body: CompileRequestSchema,
		}
	)

	.post(
		"/",
		async ({
			body,
			query: queryParams,
		}: {
			body: DynamicQueryRequestType | DynamicQueryRequestType[];
			query: { website_id?: string; timezone?: string };
		}) => {
			const timezone = queryParams.timezone || "UTC";

			try {
				if (Array.isArray(body)) {
					const uniqueWebsiteIds = [
						...new Set(
							body.flatMap((req) =>
								req.parameters.map((param) =>
									typeof param === "string" ? param : param.name
								)
							)
						),
					];
					const domainCache = await getCachedWebsiteDomain(uniqueWebsiteIds);

					const results = await Promise.all(
						body.map(async (queryRequest) => {
							try {
								return await executeDynamicQuery(
									queryRequest,
									{
										...queryParams,
										timezone,
									},
									domainCache
								);
							} catch (error) {
								return {
									success: false,
									error:
										error instanceof Error ? error.message : "Query failed",
								};
							}
						})
					);

					return {
						success: true,
						batch: true,
						results,
					};
				}

				const result = await executeDynamicQuery(body, {
					...queryParams,
					timezone,
				});
				return {
					success: true,
					...result,
				};
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : "Query failed",
				};
			}
		},
		{
			body: t.Union([
				DynamicQueryRequestSchema,
				t.Array(DynamicQueryRequestSchema),
			]),
		}
	);

async function executeDynamicQuery(
	request: DynamicQueryRequestType,
	queryParams: QueryParams,
	domainCache?: Record<string, string | null>
) {
	const startDate = queryParams.start_date || queryParams.startDate;
	const endDate = queryParams.end_date || queryParams.endDate;
	const websiteId = queryParams.website_id;

	const websiteDomain = websiteId
		? (domainCache?.[websiteId] ?? (await getWebsiteDomain(websiteId)))
		: null;

	const MAX_HOURLY_DAYS = 7;
	const MS_PER_DAY = 1000 * 60 * 60 * 24;

	const validateHourlyDateRange = (start: string, end: string) => {
		const rangeDays = Math.ceil(
			(new Date(end).getTime() - new Date(start).getTime()) / MS_PER_DAY
		);

		if (rangeDays > MAX_HOURLY_DAYS) {
			throw new Error(
				`Hourly granularity only supports ranges up to ${MAX_HOURLY_DAYS} days. Use daily granularity for longer periods.`
			);
		}
	};

	const getTimeUnit = (
		granularity?: string,
		startDate?: string,
		endDate?: string
	): "hour" | "day" => {
		const isHourly = ["hourly", "hour"].includes(granularity || "");

		if (isHourly) {
			if (startDate && endDate) {
				validateHourlyDateRange(startDate, endDate);
			}
			return "hour";
		}

		return "day";
	};

	function validateParameterRequest(
		parameter: string,
		siteId: string | undefined,
		start: string | undefined,
		end: string | undefined
	):
		| { success: true; siteId: string; start: string; end: string }
		| { success: false; error: string } {
		if (!QueryBuilders[parameter]) {
			return {
				success: false,
				error: `Unknown query type: ${parameter}`,
			};
		}

		if (!(siteId && start && end)) {
			return {
				success: false,
				error:
					"Missing required parameters: website_id, start_date, or end_date",
			};
		}

		return { success: true, siteId, start, end };
	}

	async function processParameter(
		parameterInput:
			| string
			| {
					name: string;
					start_date?: string;
					end_date?: string;
					granularity?: string;
					id?: string;
			  },
		dynamicRequest: DynamicQueryRequestType,
		params: QueryParams,
		siteId: string | undefined,
		defaultStart: string | undefined,
		defaultEnd: string | undefined,
		domain: string | null
	) {
		const isObject = typeof parameterInput === "object";
		const parameterName = isObject ? parameterInput.name : parameterInput;
		const customId =
			isObject && parameterInput.id ? parameterInput.id : parameterName;
		const paramStart =
			isObject && parameterInput.start_date
				? parameterInput.start_date
				: defaultStart;
		const paramEnd =
			isObject && parameterInput.end_date
				? parameterInput.end_date
				: defaultEnd;
		const paramGranularity =
			isObject && parameterInput.granularity
				? parameterInput.granularity
				: dynamicRequest.granularity;

		const validation = validateParameterRequest(
			parameterName,
			siteId,
			paramStart,
			paramEnd
		);
		if (!validation.success) {
			return {
				parameter: customId,
				success: false,
				error: validation.error,
				data: [],
			};
		}

		try {
			const queryRequest = {
				projectId: validation.siteId,
				type: parameterName,
				from: validation.start,
				to: validation.end,
				timeUnit: getTimeUnit(
					paramGranularity,
					validation.start,
					validation.end
				),
				filters: dynamicRequest.filters || [],
				limit: dynamicRequest.limit || 100,
				offset: dynamicRequest.page
					? (dynamicRequest.page - 1) * (dynamicRequest.limit || 100)
					: 0,
				timezone: params.timezone,
			};

			const data = await executeQuery(queryRequest, domain, params.timezone);

			return {
				parameter: customId,
				success: true,
				data: data || [],
			};
		} catch (error) {
			return {
				parameter: customId,
				success: false,
				error: error instanceof Error ? error.message : "Query failed",
				data: [],
			};
		}
	}

	const parameterResults = await Promise.all(
		request.parameters.map((param) =>
			processParameter(
				param,
				request,
				queryParams,
				websiteId,
				startDate,
				endDate,
				websiteDomain
			)
		)
	);

	return {
		queryId: request.id,
		data: parameterResults,
		meta: {
			parameters: request.parameters,
			total_parameters: request.parameters.length,
			page: request.page || 1,
			limit: request.limit || 100,
			filters_applied: request.filters?.length || 0,
		},
	};
}
