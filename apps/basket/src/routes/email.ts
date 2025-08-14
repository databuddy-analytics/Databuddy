import { createHash, randomUUID } from 'node:crypto';
import { clickHouse, type EmailEvent } from '@databuddy/db';
import { redis } from '@databuddy/redis';
import {
	batchEmailEventSchema,
	type EmailEventInput,
	emailEventSchema,
} from '@databuddy/validation';
import { Elysia } from 'elysia';
import { logger } from '../lib/logger';

const expectedKey = process.env.EMAIL_API_KEY;

function validateApiKey(request: Request): boolean {
	const apiKey = request.headers.get('x-api-key');

	if (!expectedKey) {
		logger.error('EMAIL_API_KEY not configured');
		return false;
	}

	return apiKey === expectedKey;
}

function hashEmailId(emailId: string, domain: string): string {
	return createHash('sha256').update(`${emailId}:${domain}`).digest('hex');
}

async function insertEmailEvent(emailData: EmailEventInput): Promise<void> {
	const now = Date.now();

	const emailHash = hashEmailId(emailData.email_id, emailData.domain);

	const emailEvent: EmailEvent = {
		event_id: randomUUID(),
		email_hash: emailHash,
		domain: emailData.domain,
		labels: emailData.labels || [],
		event_time: emailData.event_time || now,
		received_at: emailData.received_at || now,
		ingestion_time: now,
		metadata_json: emailData.metadata || {},
	};

	try {
		await clickHouse.insert({
			table: 'analytics.email_events',
			values: [emailEvent],
			format: 'JSONEachRow',
		});

		logger.info('Email event inserted successfully', {
			domain: emailEvent.domain,
			labels: emailEvent.labels,
			eventId: emailEvent.event_id,
		});
	} catch (err) {
		logger.error('Failed to insert email event', {
			error: err as Error,
			domain: emailEvent.domain,
			eventId: emailEvent.event_id,
		});
		throw err;
	}
}

async function checkEmailDuplicate(
	emailHash: string,
	eventTime: number
): Promise<boolean> {
	const key = `email_dedup:${emailHash}:${eventTime}`;
	if (await redis.exists(key)) {
		return true;
	}

	await redis.setex(key, 604_800, '1');
	return false;
}

const app = new Elysia()
	.post(
		'/email',
		async ({ body, request }: { body: unknown; request: Request }) => {
			// Validate API key
			if (!validateApiKey(request)) {
				return {
					status: 'error',
					message: 'Invalid or missing API key',
				};
			}

			// Validate schema
			const parseResult = emailEventSchema.safeParse(body);
			if (!parseResult.success) {
				return {
					status: 'error',
					message: 'Invalid email event schema',
					errors: parseResult.error.issues,
				};
			}

			const emailData = parseResult.data;
			const emailHash = hashEmailId(emailData.email_id, emailData.domain);
			const eventTime = emailData.event_time || Date.now();

			if (await checkEmailDuplicate(emailHash, eventTime)) {
				return { status: 'success', message: 'Duplicate event ignored' };
			}

			try {
				await insertEmailEvent(emailData);
				return {
					status: 'success',
					type: 'email',
					event_id: emailHash,
				};
			} catch (error) {
				logger.error('Email event processing failed', {
					error: error as Error,
					domain: emailData.domain,
				});
				return {
					status: 'error',
					message: 'Failed to process email event',
				};
			}
		}
	)
	.post(
		'/email/batch',
		async ({ body, request }: { body: unknown; request: Request }) => {
			// Validate API key
			if (!validateApiKey(request)) {
				return {
					status: 'error',
					message: 'Invalid or missing API key',
				};
			}

			// Validate schema
			const parseResult = batchEmailEventSchema.safeParse(body);
			if (!parseResult.success) {
				return {
					status: 'error',
					message: 'Invalid batch email event schema',
					errors: parseResult.error.issues,
				};
			}

			const emailEvents = parseResult.data;
			const results: unknown[] = [];
			const processingPromises = emailEvents.map(
				async (emailData: EmailEventInput) => {
					const emailHash = hashEmailId(emailData.email_id, emailData.domain);
					const eventTime = emailData.event_time || Date.now();

					if (await checkEmailDuplicate(emailHash, eventTime)) {
						return {
							status: 'success',
							message: 'Duplicate event ignored',
							email_hash: emailHash,
						};
					}

					try {
						await insertEmailEvent(emailData);
						return {
							status: 'success',
							type: 'email',
							email_hash: emailHash,
						};
					} catch (error) {
						return {
							status: 'error',
							message: 'Processing failed',
							error: String(error),
							email_hash: emailHash,
						};
					}
				}
			);

			results.push(...(await Promise.all(processingPromises)));

			return {
				status: 'success',
				batch: true,
				processed: results.length,
				results,
			};
		}
	);

export default app;
