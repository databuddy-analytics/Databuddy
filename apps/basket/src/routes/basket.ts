import { randomUUID } from 'node:crypto';
import { Elysia } from 'elysia';
import { logBlockedTraffic } from '../lib/blocked-traffic';
import {
	insertCustomEvent,
	insertError,
	insertOutgoingLink,
	insertTrackEvent,
	insertWebVitals,
} from '../lib/event-service';
import { validateRequest, checkForBot } from '../lib/request-validation';
import { getDailySalt, saltAnonymousId } from '../lib/security';
import {
	analyticsEventSchema,
	customEventSchema,
	errorEventSchema,
	outgoingLinkSchema,
	webVitalsEventSchema,
} from '../utils/event-schema';
import { FILTERED_ERROR_MESSAGES, VALIDATION_LIMITS } from '../utils/validation';

const app = new Elysia()
	.post('/', async (context) => {
		const { body, query, request } = context as {
			body: any;
			query: any;
			request: Request;
		};

		try {
			const validation = await validateRequest(body, query, request);
			if ('error' in validation) {
				console.error('Request validation failed:', validation.error);
				return validation.error;
			}

			const { clientId, userAgent, ip } = validation;

			const salt = await getDailySalt();
			if (body.anonymous_id) {
				body.anonymous_id = saltAnonymousId(body.anonymous_id, salt);
			}

			const eventType = body.type || 'track';

			if (eventType === 'track') {
				const botError = await checkForBot(
					request,
					body,
					query,
					clientId,
					userAgent
				);
				if (botError) {
					return botError.error;
				}

				let parseResult;
				if (process.env.NODE_ENV === 'development') {
					parseResult = { success: true, data: body };
				} else {
					parseResult = analyticsEventSchema.safeParse(body);
					if (!parseResult.success) {
						await logBlockedTraffic(
							request,
							body,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							errors: parseResult.error.issues,
						};
					}
				}
				insertTrackEvent(body, clientId, userAgent, ip);
				return { status: 'success', type: 'track' };
			}

			if (eventType === 'error') {
				if (FILTERED_ERROR_MESSAGES.has(body.payload?.message)) {
					return {
						status: 'ignored',
						type: 'error',
						reason: 'filtered_message',
					};
				}

				const botError = await checkForBot(
					request,
					body,
					query,
					clientId,
					userAgent
				);
				if (botError) {
					return botError.error;
				}

				let parseResult;
				if (process.env.NODE_ENV === 'development') {
					parseResult = { success: true, data: body };
				} else {
					parseResult = errorEventSchema.safeParse(body);
					if (!parseResult.success) {
						await logBlockedTraffic(
							request,
							body,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							errors: parseResult.error.issues,
						};
					}
				}
				insertError(body, clientId, userAgent, ip);
				return { status: 'success', type: 'error' };
			}

			if (eventType === 'web_vitals') {
				const botError = await checkForBot(
					request,
					body,
					query,
					clientId,
					userAgent
				);
				if (botError) {
					return botError.error;
				}

				let parseResult;
				if (process.env.NODE_ENV === 'development') {
					parseResult = { success: true, data: body };
				} else {
					parseResult = webVitalsEventSchema.safeParse(body);
					if (!parseResult.success) {
						await logBlockedTraffic(
							request,
							body,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							errors: parseResult.error.issues,
						};
					}
				}
				insertWebVitals(body, clientId, userAgent, ip);
				return { status: 'success', type: 'web_vitals' };
			}

			if (eventType === 'custom') {
				let parseResult;
				if (process.env.NODE_ENV === 'development') {
					parseResult = { success: true, data: body };
				} else {
					parseResult = customEventSchema.safeParse(body);
					if (!parseResult.success) {
						await logBlockedTraffic(
							request,
							body,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							errors: parseResult.error.issues,
						};
					}
				}

				const eventId = body.eventId || randomUUID();
				const customEventWithId = { ...body, eventId };

				await insertCustomEvent(customEventWithId, clientId, userAgent, ip);
				return { status: 'success', type: 'custom', eventId };
			}

			if (eventType === 'outgoing_link') {
				const botError = await checkForBot(
					request,
					body,
					query,
					clientId,
					userAgent
				);
				if (botError) {
					return botError.error;
				}

				let parseResult;
				if (process.env.NODE_ENV === 'development') {
					parseResult = { success: true, data: body };
				} else {
					parseResult = outgoingLinkSchema.safeParse(body);
					if (!parseResult.success) {
						await logBlockedTraffic(
							request,
							body,
							query,
							'invalid_schema',
							'Schema Validation',
							undefined,
							clientId
						);
						return {
							status: 'error',
							message: 'Invalid event schema',
							errors: parseResult.error.issues,
						};
					}
				}
				insertOutgoingLink(body, clientId, userAgent, ip);
				return { status: 'success', type: 'outgoing_link' };
			}

			return { status: 'error', message: 'Unknown event type' };
		} catch (error) {
			console.error('Error processing event:', error);
			return { status: 'error', message: 'Internal server error' };
		}
	})
	.post('/batch', async (context) => {
		const { body, query, request } = context as {
			body: any;
			query: any;
			request: Request;
		};

		try {
			if (!Array.isArray(body)) {
				console.error('Batch endpoint received non-array body');
				return {
					status: 'error',
					message: 'Batch endpoint expects array of events',
				};
			}

			if (body.length > VALIDATION_LIMITS.BATCH_MAX_SIZE) {
				return { status: 'error', message: 'Batch too large' };
			}

			const validation = await validateRequest(body, query, request);
			if ('error' in validation) {
				return { ...validation.error, batch: true };
			}

			const { clientId, userAgent, ip } = validation;

			const salt = await getDailySalt();
			for (const event of body) {
				if (event.anonymous_id) {
					event.anonymous_id = saltAnonymousId(event.anonymous_id, salt);
				}
			}

			const results: any[] = [];
			const processingPromises = body.map(async (event: any) => {
				const eventType = event.type || 'track';

				if (eventType === 'track') {
					const botError = await checkForBot(
						request,
						event,
						query,
						clientId,
						userAgent
					);
					if (botError) {
						return {
							status: 'error',
							message: 'Bot detected',
							eventType,
							error: 'ignored',
						};
					}

					let parseResult;
					if (process.env.NODE_ENV === 'development') {
						parseResult = { success: true, data: event };
					} else {
						parseResult = analyticsEventSchema.safeParse(event);
						if (!parseResult.success) {
							await logBlockedTraffic(
								request,
								event,
								query,
								'invalid_schema',
								'Schema Validation',
								undefined,
								clientId
							);
							return {
								status: 'error',
								message: 'Invalid event schema',
								eventType,
								errors: parseResult.error.issues,
								eventId: event.eventId || event.payload?.eventId,
							};
						}
					}
					try {
						await insertTrackEvent(event, clientId, userAgent, ip);
						return {
							status: 'success',
							type: 'track',
							eventId: event.eventId,
						};
					} catch (error) {
						return {
							status: 'error',
							message: 'Processing failed',
							eventType,
							error: String(error),
						};
					}
				}
				if (eventType === 'error') {
					if (FILTERED_ERROR_MESSAGES.has(event.payload?.message)) {
						return {
							status: 'ignored',
							type: 'error',
							reason: 'filtered_message',
						};
					}

					const botError = await checkForBot(
						request,
						event,
						query,
						clientId,
						userAgent
					);
					if (botError) {
						return {
							status: 'error',
							message: 'Bot detected',
							eventType,
							error: 'ignored',
						};
					}

					let parseResult;
					if (process.env.NODE_ENV === 'development') {
						parseResult = { success: true, data: event };
					} else {
						parseResult = errorEventSchema.safeParse(event);
						if (!parseResult.success) {
							await logBlockedTraffic(
								request,
								event,
								query,
								'invalid_schema',
								'Schema Validation',
								undefined,
								clientId
							);
							return {
								status: 'error',
								message: 'Invalid event schema',
								eventType,
								errors: parseResult.error.issues,
								eventId: event.payload?.eventId,
							};
						}
					}
					try {
						await insertError(event, clientId, userAgent, ip);
						return {
							status: 'success',
							type: 'error',
							eventId: event.payload?.eventId,
						};
					} catch (error) {
						return {
							status: 'error',
							message: 'Processing failed',
							eventType,
							error: String(error),
						};
					}
				}
				if (eventType === 'web_vitals') {
					const botError = await checkForBot(
						request,
						event,
						query,
						clientId,
						userAgent
					);
					if (botError) {
						return {
							status: 'error',
							message: 'Bot detected',
							eventType,
							error: 'ignored',
						};
					}

					let parseResult;
					if (process.env.NODE_ENV === 'development') {
						parseResult = { success: true, data: event };
					} else {
						parseResult = webVitalsEventSchema.safeParse(event);
						if (!parseResult.success) {
							await logBlockedTraffic(
								request,
								event,
								query,
								'invalid_schema',
								'Schema Validation',
								undefined,
								clientId
							);
							return {
								status: 'error',
								message: 'Invalid event schema',
								eventType,
								errors: parseResult.error.issues,
								eventId: event.payload?.eventId,
							};
						}
					}
					try {
						await insertWebVitals(event, clientId, userAgent, ip);
						return {
							status: 'success',
							type: 'web_vitals',
							eventId: event.payload?.eventId,
						};
					} catch (error) {
						return {
							status: 'error',
							message: 'Processing failed',
							eventType,
							error: String(error),
						};
					}
				}
				if (eventType === 'custom') {
					let parseResult;
					if (process.env.NODE_ENV === 'development') {
						parseResult = { success: true, data: event };
					} else {
						parseResult = customEventSchema.safeParse(event);
						if (!parseResult.success) {
							await logBlockedTraffic(
								request,
								event,
								query,
								'invalid_schema',
								'Schema Validation',
								undefined,
								clientId
							);
							return {
								status: 'error',
								message: 'Invalid event schema',
								eventType,
								errors: parseResult.error.issues,
								eventId: event.eventId,
							};
						}
					}
					try {
						const eventId = event.eventId || randomUUID();
						const customEventWithId = { ...event, eventId };

						await insertCustomEvent(customEventWithId, clientId, userAgent, ip);
						return {
							status: 'success',
							type: 'custom',
							eventId,
						};
					} catch (error) {
						return {
							status: 'error',
							message: 'Processing failed',
							eventType,
							error: String(error),
						};
					}
				}
				if (eventType === 'outgoing_link') {
					const botError = await checkForBot(
						request,
						event,
						query,
						clientId,
						userAgent
					);
					if (botError) {
						return {
							status: 'error',
							message: 'Bot detected',
							eventType,
							error: 'ignored',
						};
					}

					let parseResult;
					if (process.env.NODE_ENV === 'development') {
						parseResult = { success: true, data: event };
					} else {
						parseResult = outgoingLinkSchema.safeParse(event);
						if (!parseResult.success) {
							await logBlockedTraffic(
								request,
								event,
								query,
								'invalid_schema',
								'Schema Validation',
								undefined,
								clientId
							);
							return {
								status: 'error',
								message: 'Invalid event schema',
								eventType,
								errors: parseResult.error.issues,
								eventId: event.eventId,
							};
						}
					}
					try {
						await insertOutgoingLink(event, clientId, userAgent, ip);
						return {
							status: 'success',
							type: 'outgoing_link',
							eventId: event.eventId,
						};
					} catch (error) {
						return {
							status: 'error',
							message: 'Processing failed',
							eventType,
							error: String(error),
						};
					}
				}
				return {
					status: 'error',
					message: 'Unknown event type',
					eventType,
				};
			});

			results.push(...(await Promise.all(processingPromises)));

			return {
				status: 'success',
				batch: true,
				processed: results.length,
				results,
			};
		} catch (error) {
			console.error('Error processing batch event:', error);
			return { status: 'error', message: 'Internal server error' };
		}
	});

export default app;
