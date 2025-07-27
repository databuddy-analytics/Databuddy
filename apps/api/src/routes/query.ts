import { auth } from '@databuddy/auth';
import { db, userPreferences, websites } from '@databuddy/db';
import { cacheable } from '@databuddy/redis';
import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { logger } from '../lib/logger';
import { createRateLimitMiddleware } from '../middleware/rate-limit';
import { compileQuery, executeQuery } from '../query';
import { QueryBuilders } from '../query/builders';

const FilterSchema = t.Object({
	field: t.String(),
	op: t.Enum({
		eq: 'eq',
		ne: 'ne',
		like: 'like',
		gt: 'gt',
		lt: 'lt',
		in: 'in',
		notIn: 'notIn',
	}),
	value: t.Union([
		t.String(),
		t.Number(),
		t.Array(t.Union([t.String(), t.Number()])),
	]),
});

const DynamicQueryRequestSchema = t.Object({
	id: t.Optional(t.String()),
	parameters: t.Array(t.String()),
	limit: t.Optional(t.Number()),
	page: t.Optional(t.Number()),
	filters: t.Optional(t.Array(FilterSchema)),
	granularity: t.Optional(
		t.Union([
			t.Literal('hourly'),
			t.Literal('daily'),
			t.Literal('hour'),
			t.Literal('day'),
		])
	),
	groupBy: t.Optional(t.String()),
});

const CompileRequestSchema = t.Object({
	projectId: t.String(),
	type: t.Enum(
		Object.fromEntries(Object.keys(QueryBuilders).map((k) => [k, k]))
	),
	from: t.String(),
	to: t.String(),
	timeUnit: t.Optional(
		t.Enum({
			minute: 'minute',
			hour: 'hour',
			day: 'day',
			week: 'week',
			month: 'month',
		})
	),
	filters: t.Optional(t.Array(FilterSchema)),
	groupBy: t.Optional(t.Array(t.String())),
	orderBy: t.Optional(t.String()),
	limit: t.Optional(t.Number({ minimum: 1, maximum: 1000 })),
	offset: t.Optional(t.Number({ minimum: 0 })),
});

export const query = new Elysia({ prefix: '/v1/query' })
	.use(createRateLimitMiddleware({ type: 'api' }))
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({
			headers: request.headers,
		});

		const url = new URL(request.url);
		const website_id = url.searchParams.get('website_id');

		if (!website_id) {
			if (!session?.user) {
				throw new Error('Unauthorized');
			}
			let timezone = 'UTC';
			if (session.user) {
				const pref = await db.query.userPreferences.findFirst({
					where: eq(userPreferences.userId, session.user.id),
				});
				if (pref?.timezone && pref.timezone !== 'auto') {
					timezone = pref.timezone;
				} else {
					timezone =
						request.headers.get('x-timezone') ||
						url.searchParams.get('timezone') ||
						'UTC';
				}
			} else {
				timezone =
					request.headers.get('x-timezone') ||
					url.searchParams.get('timezone') ||
					'UTC';
			}
			return { user: session.user, session, timezone };
		}

		const website = await db.query.websites.findFirst({
			where: eq(websites.id, website_id),
		});

		if (!website) {
			throw new Error('Website not found');
		}

		if (website.isPublic) {
			const timezone =
				request.headers.get('x-timezone') ||
				url.searchParams.get('timezone') ||
				'UTC';
			return { user: null, session: null, website, timezone };
		}

		if (!session?.user) {
			throw new Error('Unauthorized');
		}

		let timezone = 'UTC';
		if (session.user) {
			const pref = await db.query.userPreferences.findFirst({
				where: eq(userPreferences.userId, session.user.id),
			});
			if (pref?.timezone && pref.timezone !== 'auto') {
				timezone = pref.timezone;
			} else {
				timezone =
					request.headers.get('x-timezone') ||
					url.searchParams.get('timezone') ||
					'UTC';
			}
		} else {
			timezone =
				request.headers.get('x-timezone') ||
				url.searchParams.get('timezone') ||
				'UTC';
		}
		return { user: session.user, session, website, timezone };
	})
	.get('/types', () => ({
		success: true,
		types: Object.keys(QueryBuilders),
		configs: Object.fromEntries(
			Object.entries(QueryBuilders).map(([key, config]) => [
				key,
				{
					allowedFilters: config.allowedFilters || [],
					customizable: config.customizable,
					defaultLimit: config.limit,
				},
			])
		),
	}))

	.post(
		'/compile',
		async ({ body, query: { website_id } }) => {
			try {
				const websiteDomain = website_id
					? await getWebsiteDomain(website_id)
					: null;

				const result = compileQuery(body, websiteDomain);
				return {
					success: true,
					...result,
				};
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : 'Compilation failed',
				};
			}
		},
		{
			body: CompileRequestSchema,
		}
	)

	.post(
		'/',
		async ({ body, timezone }) => {
			try {
				if (Array.isArray(body)) {
					const results = await Promise.all(
						body.map(async (queryRequest) => {
							try {
								return await executeDynamicQuery(queryRequest, {
									...query,
									timezone,
								});
							} catch (error) {
								return {
									success: false,
									error:
										error instanceof Error ? error.message : 'Query failed',
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

				const result = await executeDynamicQuery(body, { ...query, timezone });
				return {
					success: true,
					...result,
				};
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : 'Query failed',
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

const getWebsiteDomain = cacheable(
	async (websiteId: string): Promise<string | null> => {
		try {
			const website = await db.query.websites.findFirst({
				where: eq(websites.id, websiteId),
			});
			return website?.domain || null;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			logger.error('Error fetching website domain:', {
				errorMessage,
				websiteId,
			});
			return null;
		}
	},
	{
		expireInSec: 300,
		prefix: 'website-domain',
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

async function executeDynamicQuery(request: any, queryParams: any) {
	const start_date = queryParams.start_date || queryParams.startDate;
	const end_date = queryParams.end_date || queryParams.endDate;
	const website_id = queryParams.website_id;
	const websiteDomain = website_id ? await getWebsiteDomain(website_id) : null;

	const getTimeUnit = (granularity?: string): 'hour' | 'day' => {
		if (['hourly', 'hour'].includes(granularity || '')) {
			return 'hour';
		}
		return 'day';
	};

	const parameterResults = await Promise.all(
		request.parameters.map(async (parameter: string) => {
			try {
				if (!QueryBuilders[parameter]) {
					return {
						parameter,
						success: false,
						error: `Unknown query type: ${parameter}`,
						data: [],
					};
				}

				const queryRequest = {
					projectId: website_id,
					type: parameter,
					from: start_date,
					to: end_date,
					timeUnit: getTimeUnit(request.granularity),
					filters: request.filters || [],
					limit: request.limit || 100,
					offset: request.page
						? (request.page - 1) * (request.limit || 100)
						: 0,
					timezone: queryParams.timezone,
				};

				const data = await executeQuery(
					queryRequest,
					websiteDomain,
					queryParams.timezone
				);

				return {
					parameter,
					success: true,
					data: data || [],
				};
			} catch (error) {
				return {
					parameter,
					success: false,
					error: error instanceof Error ? error.message : 'Query failed',
					data: [],
				};
			}
		})
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
