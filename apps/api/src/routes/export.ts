import { auth, websitesApi } from '@databuddy/auth';
import { db, eq, websites } from '@databuddy/db';
import { cacheable } from '@databuddy/redis';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Elysia, t } from 'elysia';
import { type ExportRequest, processExport } from '../lib/export';
import { logger } from '../lib/logger';

import { createRateLimitMiddleware } from '../middleware/rate-limit';

dayjs.extend(utc);

const _exportRateLimit = createRateLimitMiddleware({
	type: 'expensive',
	identifier: 'export',
	customConfig: {
		requests: 10,
		window: '1m',
	},
	skipAuth: false,
});

const getWebsiteById = cacheable(
	async (id: string) => {
		try {
			if (!id) {
				return null;
			}
			return await db.query.websites.findFirst({
				where: eq(websites.id, id),
			});
		} catch (error) {
			console.error('Error fetching website by ID:', error, { id });
			return null;
		}
	},
	{
		expireInSec: 600,
		prefix: 'website_by_id',
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

/**
 * Authorize website access using the same pattern as RPC routers
 */
async function authorizeWebsiteAccess(
	headers: Headers,
	websiteId: string,
	permission: 'read' | 'update' | 'delete' | 'transfer'
) {
	const website = await getWebsiteById(websiteId);

	if (!website) {
		throw new Error('Website not found');
	}

	// Public websites allow read access
	if (permission === 'read' && website.isPublic) {
		return website;
	}

	const session = await auth.api.getSession({ headers });
	const user = session?.user;

	if (!user) {
		throw new Error('Authentication is required for this action');
	}

	if (user.role === 'ADMIN') {
		return website;
	}

	if (website.organizationId) {
		const { success } = await websitesApi.hasPermission({
			headers,
			body: { permissions: { website: [permission] } },
		});
		if (!success) {
			throw new Error('You do not have permission to perform this action');
		}
	} else if (website.userId !== user.id) {
		// Check direct ownership
		throw new Error('You are not the owner of this website');
	}

	return website;
}

export const exportRoute = new Elysia({ prefix: '/v1/export' })
	// .use(exportRateLimit)
	.post(
		'/data',
		async ({ body, request }) => {
			const startTime = Date.now();
			const requestId = Math.random().toString(36).slice(2, 12);

			try {
				const websiteId = body.website_id;

				if (!websiteId) {
					return createErrorResponse(
						400,
						'MISSING_WEBSITE_ID',
						'Website ID is required'
					);
				}

				const _website = await authorizeWebsiteAccess(
					request.headers,
					websiteId,
					'read'
				);

				if (!_website) {
					return createErrorResponse(
						403,
						'ACCESS_DENIED',
						'Access denied. You may not have permission to export data for this website.'
					);
				}

				const { validatedDates, error: dateError } = validateDateRange(
					body.start_date,
					body.end_date
				);

				if (dateError) {
					logger.warn({
						message: 'Export request with invalid dates',
						requestId,
						websiteId,
						startDate: body.start_date,
						endDate: body.end_date,
						error: dateError,
					});
					return createErrorResponse(400, 'INVALID_DATE_RANGE', dateError);
				}

				const format = body.format || 'json';
				if (!['csv', 'json', 'txt', 'proto'].includes(format)) {
					logger.warn({
						message: 'Export request with invalid format',
						requestId,
						websiteId,
						format,
					});
					return createErrorResponse(
						400,
						'INVALID_FORMAT',
						'Invalid export format. Supported formats: csv, json, txt, proto'
					);
				}

				logger.info({
					message: 'Data export initiated',
					requestId,
					websiteId,
					startDate: validatedDates.startDate,
					endDate: validatedDates.endDate,
					format,
					userAgent: request.headers.get('user-agent'),
					ip:
						request.headers.get('x-forwarded-for') ||
						request.headers.get('x-real-ip'),
					timestamp: new Date().toISOString(),
				});

				const exportRequest: ExportRequest = {
					website_id: websiteId,
					start_date: validatedDates.startDate,
					end_date: validatedDates.endDate,
					format: format as ExportRequest['format'],
				};

				const result = await processExport(exportRequest);

				logger.info({
					message: 'Data export completed successfully',
					requestId,
					websiteId,
					filename: result.filename,
					fileSize: result.buffer.length,
					totalRecords: result.metadata.totalRecords,
					processingTime: Date.now() - startTime,
					timestamp: new Date().toISOString(),
				});

				return new Response(result.buffer, {
					headers: {
						'Content-Type': 'application/zip',
						'Content-Disposition': `attachment; filename="${result.filename}"`,
						'Content-Length': result.buffer.length.toString(),
					},
				});
			} catch (error) {
				logger.error({
					message: 'Data export failed',
					requestId,
					websiteId: body.website_id,
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					processingTime: Date.now() - startTime,
					userAgent: request.headers.get('user-agent'),
					ip:
						request.headers.get('x-forwarded-for') ||
						request.headers.get('x-real-ip'),
					timestamp: new Date().toISOString(),
				});

				if (error instanceof Error) {
					if (error.message.includes('not found')) {
						return createErrorResponse(
							404,
							'WEBSITE_NOT_FOUND',
							'Website not found',
							requestId
						);
					}
					if (error.message.includes('Authentication is required')) {
						return createErrorResponse(
							401,
							'AUTH_REQUIRED',
							'Authentication required',
							requestId
						);
					}
					if (
						error.message.includes('permission') ||
						error.message.includes('owner')
					) {
						return createErrorResponse(
							403,
							'ACCESS_DENIED',
							'Access denied. You may not have permission to export data for this website.',
							requestId
						);
					}
				}

				return createErrorResponse(
					500,
					'EXPORT_FAILED',
					'Export failed. Please try again later.',
					requestId
				);
			}
		},
		{
			body: t.Object({
				website_id: t.String({
					minLength: 1,
					maxLength: 100,
					pattern: '^[a-zA-Z0-9_-]+$',
					error: 'Website ID must be alphanumeric with dashes/underscores only',
				}),
				start_date: t.Optional(
					t.String({
						pattern: '^\\d{4}-\\d{2}-\\d{2}$',
						error: 'Start date must be in YYYY-MM-DD format',
					})
				),
				end_date: t.Optional(
					t.String({
						pattern: '^\\d{4}-\\d{2}-\\d{2}$',
						error: 'End date must be in YYYY-MM-DD format',
					})
				),
				format: t.Optional(
					t.Union(
						[
							t.Literal('csv'),
							t.Literal('json'),
							t.Literal('txt'),
							t.Literal('proto'),
						],
						{
							error: 'Format must be one of: csv, json, txt, proto',
						}
					)
				),
			}),
		}
	);

/**
 * Creates a standardized error response
 */
function createErrorResponse(
	status: number,
	code: string,
	message: string,
	requestId?: string
) {
	return new Response(
		JSON.stringify({
			success: false,
			error: message,
			code,
			...(requestId && { requestId }),
		}),
		{
			status,
			headers: { 'Content-Type': 'application/json' },
		}
	);
}

/**
 * Validates and sanitizes date range inputs
 * Prevents SQL injection and ensures reasonable date ranges
 */
function validateDateRange(
	startDate?: string,
	endDate?: string
): {
	validatedDates: { startDate?: string; endDate?: string };
	error?: string;
} {
	const now = dayjs.utc();
	const maxHistoryDays = 365 * 2; // 2 years max
	const maxRangeDays = 365; // 1 year max range

	if (!(startDate || endDate)) {
		return { validatedDates: {} };
	}

	let validatedStartDate: string | undefined;
	let validatedEndDate: string | undefined;

	if (startDate) {
		const start = dayjs.utc(startDate, 'YYYY-MM-DD', true);
		if (!start.isValid()) {
			return {
				validatedDates: {},
				error: 'Invalid start date format. Use YYYY-MM-DD.',
			};
		}
		if (start.isAfter(now)) {
			return {
				validatedDates: {},
				error: 'Start date cannot be in the future.',
			};
		}
		if (start.isBefore(now.subtract(maxHistoryDays, 'day'))) {
			return {
				validatedDates: {},
				error: `Start date cannot be more than ${maxHistoryDays} days ago.`,
			};
		}
		validatedStartDate = start.format('YYYY-MM-DD');
	}

	if (endDate) {
		const end = dayjs.utc(endDate, 'YYYY-MM-DD', true);
		if (!end.isValid()) {
			return {
				validatedDates: {},
				error: 'Invalid end date format. Use YYYY-MM-DD.',
			};
		}
		if (end.isAfter(now)) {
			return { validatedDates: {}, error: 'End date cannot be in the future.' };
		}
		if (end.isBefore(now.subtract(maxHistoryDays, 'day'))) {
			return {
				validatedDates: {},
				error: `End date cannot be more than ${maxHistoryDays} days ago.`,
			};
		}
		validatedEndDate = end.format('YYYY-MM-DD');
	}

	if (validatedStartDate && validatedEndDate) {
		const start = dayjs.utc(validatedStartDate);
		const end = dayjs.utc(validatedEndDate);

		if (start.isAfter(end)) {
			return {
				validatedDates: {},
				error: 'Start date must be before or equal to end date.',
			};
		}

		const rangeDays = end.diff(start, 'day');
		if (rangeDays > maxRangeDays) {
			return {
				validatedDates: {},
				error: `Date range cannot exceed ${maxRangeDays} days.`,
			};
		}
	}

	return {
		validatedDates: {
			startDate: validatedStartDate,
			endDate: validatedEndDate,
		},
	};
}
