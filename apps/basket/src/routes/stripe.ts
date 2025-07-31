import { clickHouse, db, eq, userStripeConfig } from '@databuddy/db';
import { Elysia } from 'elysia';
import Stripe from 'stripe';
import { logger } from '../lib/logger';

/**
 * STRIPE CHECKOUT SETUP GUIDE
 *
 * To properly track revenue analytics, you MUST include metadata in payment_intent_data
 * when creating Stripe Checkout sessions server-side:
 *
 * Example:
 * ```typescript
 * const session = await stripe.checkout.sessions.create({
 *   payment_method_types: ['card'],
 *   mode: 'payment',
 *   line_items: [{ price: 'price_abc123', quantity: 1 }],
 *   success_url: 'https://yourapp.com/success',
 *   cancel_url: 'https://yourapp.com/cancel',
 *   payment_intent_data: {
 *     metadata: {
 *       client_id: 'your_website_id',    // REQUIRED: Website/client identifier
 *       session_id: 'session_id',        // REQUIRED: Your analytics session_id
 *       user_id: 'user_123',             // Optional: Your internal user ID
 *       campaign: 'summer_sale',         // Optional: Marketing campaign
 *     }
 *   }
 * });
 * ```
 *
 * IMPORTANT:
 * - payment_intent_data.metadata is the ONLY metadata that propagates to webhooks
 * - client_id is required for linking payments to your analytics
 * - session_id is required for attribution to user sessions
 * - This links Stripe payments to your analytics events automatically
 */

const app = new Elysia();

interface StripeConfig {
	webhookSecret: string;
	userId: string;
	webhookToken: string;
	isLiveMode: boolean;
}

interface StripeObjectWithMetadata {
	metadata?: {
		client_id?: string;
		session_id?: string;
		[key: string]: string | undefined;
	} | null;
}

interface StripeDataRecord {
	[key: string]:
		| string
		| number
		| boolean
		| null
		| undefined
		| Record<string, string>
		| string[];
}

interface SecurityEventMetadata {
	eventLivemode?: boolean;
	configLivemode?: boolean;
	eventType?: string;
	[key: string]: unknown;
}

type StripeEventHandler = (
	data: Stripe.PaymentIntent | Stripe.Charge | Stripe.Refund,
	config: StripeConfig
) => Promise<void>;

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ENABLE_MODE_VALIDATION =
	process.env.ENABLE_MODE_VALIDATION === 'true' || IS_PRODUCTION;

// Secure webhook endpoint using webhook token: /stripe/webhook/{webhookToken}
app.post('/stripe/webhook/:webhookToken', async ({ params, request, set }) => {
	const clientIp = getClientIp(request);

	const config = await getStripeConfigByToken(params.webhookToken);
	if (!config) {
		logSecurityEvent('invalid_webhook_token', params.webhookToken, clientIp);
		set.status = 404;
		return { error: 'Webhook endpoint not found' };
	}

	return handleWebhook(request, set, config);
});

/**
 * Get client IP address from request
 */
function getClientIp(request: Request): string {
	return (
		request.headers.get('cf-connecting-ip') ||
		request.headers.get('x-forwarded-for')?.split(',')[0] ||
		request.headers.get('x-real-ip') ||
		'unknown'
	);
}
/**
 * Get Stripe configuration by webhook token
 */
async function getStripeConfigByToken(
	webhookToken: string
): Promise<StripeConfig | null> {
	try {
		const userConfig = await db
			.select({
				webhookSecret: userStripeConfig.webhookSecret,
				userId: userStripeConfig.userId,
				isLiveMode: userStripeConfig.isLiveMode,
				isActive: userStripeConfig.isActive,
			})
			.from(userStripeConfig)
			.where(eq(userStripeConfig.webhookToken, webhookToken))
			.limit(1);

		if (!(userConfig.length && userConfig[0].isActive)) {
			return null;
		}

		const config = userConfig[0];
		return {
			webhookSecret: config.webhookSecret,
			userId: config.userId,
			webhookToken,
			isLiveMode: config.isLiveMode,
		};
	} catch (error) {
		logger.error(`Error fetching Stripe config for token ${webhookToken}`, {
			error: error instanceof Error ? error.message : 'Unknown error',
		});
		return null;
	}
}

/**
 * Webhook handler with conditional security
 */
async function handleWebhook(
	request: Request,
	set: { status?: number | string },
	config: StripeConfig
) {
	const sig = request.headers.get('stripe-signature');
	const body = await request.text();

	if (!sig) {
		set.status = 400;
		return { error: 'Missing stripe-signature header' };
	}

	try {
		const event = await Stripe.webhooks.constructEventAsync(
			body,
			sig,
			config.webhookSecret
		);

		// Validate live/test mode consistency (conditional)
		if (ENABLE_MODE_VALIDATION && event.livemode !== config.isLiveMode) {
			logSecurityEvent(
				'livemode_mismatch',
				config.webhookToken,
				getClientIp(request),
				{
					eventLivemode: event.livemode,
					configLivemode: config.isLiveMode,
					eventType: event.type,
				}
			);
			set.status = 400;
			return { error: 'Live/test mode mismatch' };
		}

		logger.info(`📦 Stripe webhook received for user ${config.userId}:`, {
			type: event.type,
			id: event.id,
			livemode: event.livemode,
		});

		try {
			await processWebhookEvent(event, config);
			logger.info(`✅ Successfully processed ${event.type}`);
		} catch (processingError) {
			logger.error('❌ Error processing webhook event:', {
				error:
					processingError instanceof Error
						? processingError.message
						: 'Unknown error',
			});
			set.status = 500;
			return { error: 'Error processing webhook event' };
		}

		set.status = 200;
		return { received: true, eventType: event.type };
	} catch (err) {
		logger.error('⚠️ Webhook signature verification failed:', {
			error: err instanceof Error ? err.message : 'Unknown error',
		});
		logSecurityEvent(
			'signature_verification_failed',
			config.webhookToken,
			getClientIp(request)
		);
		// updateWebhookFailure(config.webhookToken) // Commented out - no DB fields yet

		set.status = 400;
		return { error: 'Invalid signature' };
	}
}

/**
 * Process webhook events and store data
 */
async function processWebhookEvent(event: Stripe.Event, config: StripeConfig) {
	const handlers: Record<string, StripeEventHandler> = {
		'payment_intent.succeeded': (data, stripeConfig) =>
			insertPaymentIntent(data as Stripe.PaymentIntent, stripeConfig),
		'payment_intent.created': (data, stripeConfig) =>
			insertPaymentIntent(data as Stripe.PaymentIntent, stripeConfig),
		'payment_intent.canceled': (data, stripeConfig) =>
			insertPaymentIntent(data as Stripe.PaymentIntent, stripeConfig),
		'payment_intent.payment_failed': (data, stripeConfig) =>
			insertPaymentIntent(data as Stripe.PaymentIntent, stripeConfig),
		'payment_intent.requires_action': (data, stripeConfig) =>
			insertPaymentIntent(data as Stripe.PaymentIntent, stripeConfig),
		'charge.succeeded': (data, stripeConfig) =>
			insertCharge(data as Stripe.Charge, stripeConfig),
		'charge.failed': (data, stripeConfig) =>
			insertCharge(data as Stripe.Charge, stripeConfig),
		'charge.captured': (data, stripeConfig) =>
			insertCharge(data as Stripe.Charge, stripeConfig),
		'charge.dispute.created': (data, stripeConfig) =>
			insertCharge(data as Stripe.Charge, stripeConfig),
		'refund.created': (data, stripeConfig) =>
			insertRefund(data as Stripe.Refund, stripeConfig),
		'refund.updated': (data, stripeConfig) =>
			insertRefund(data as Stripe.Refund, stripeConfig),
		'refund.failed': (data, stripeConfig) =>
			insertRefund(data as Stripe.Refund, stripeConfig),
	};

	const handler = handlers[event.type];
	if (handler) {
		await handler(
			event.data.object as Stripe.PaymentIntent | Stripe.Charge | Stripe.Refund,
			config
		);
	} else {
		logger.info(`🔄 Unhandled event type: ${event.type}`);
	}
}

function extractClientId(
	stripeObject: StripeObjectWithMetadata
): string | null {
	return stripeObject.metadata?.client_id || null;
}

function extractSessionId(
	stripeObject: StripeObjectWithMetadata
): string | null {
	return stripeObject.metadata?.session_id || null;
}

function validateClientId(
	clientId: string | null,
	objectId: string,
	objectType: string
): void {
	if (!clientId) {
		throw new Error(
			`Missing required client_id in ${objectType} ${objectId} metadata. Please include client_id in your Stripe Checkout session metadata.`
		);
	}
}

async function insertStripeData(
	table: string,
	data: StripeDataRecord
): Promise<void> {
	await clickHouse.insert({
		table,
		values: [data],
		format: 'JSONEachRow',
	});
}

async function insertPaymentIntent(
	pi: Stripe.PaymentIntent,
	config: StripeConfig
) {
	const clientId = extractClientId(pi);
	const sessionId = extractSessionId(pi);

	validateClientId(clientId, pi.id, 'PaymentIntent');

	await insertStripeData('analytics.stripe_payment_intents', {
		id: pi.id,
		client_id: clientId,
		webhook_token: config.webhookToken,
		created: new Date(pi.created * 1000)
			.toISOString()
			.replace('T', ' ')
			.replace('Z', ''),
		status: pi.status,
		currency: pi.currency,
		amount: pi.amount,
		amount_received: pi.amount_received,
		amount_capturable: pi.amount_capturable,
		livemode: pi.livemode ? 1 : 0,
		metadata: pi.metadata,
		payment_method_types: pi.payment_method_types,
		failure_reason: pi.last_payment_error?.message || null,
		canceled_at: pi.canceled_at
			? new Date(pi.canceled_at * 1000)
					.toISOString()
					.replace('T', ' ')
					.replace('Z', '')
			: null,
		cancellation_reason: pi.cancellation_reason,
		description: pi.description,
		application_fee_amount: pi.application_fee_amount,
		setup_future_usage: pi.setup_future_usage,
		session_id: sessionId,
	});

	logger.info(`✅ PaymentIntent ${pi.id} processed for client ${clientId}`);
}

async function insertCharge(charge: Stripe.Charge, config: StripeConfig) {
	const clientId = extractClientId(charge);
	const sessionId = extractSessionId(charge);
	const card = charge.payment_method_details?.card;

	validateClientId(clientId, charge.id, 'Charge');

	await insertStripeData('analytics.stripe_charges', {
		id: charge.id,
		client_id: clientId,
		webhook_token: config.webhookToken,
		created: new Date(charge.created * 1000)
			.toISOString()
			.replace('T', ' ')
			.replace('Z', ''),
		status: charge.status,
		currency: charge.currency,
		amount: charge.amount,
		amount_captured: charge.amount_captured,
		amount_refunded: charge.amount_refunded,
		paid: charge.paid ? 1 : 0,
		refunded: charge.refunded ? 1 : 0,
		livemode: charge.livemode ? 1 : 0,
		failure_code: charge.failure_code,
		failure_message: charge.failure_message,
		outcome_type: charge.outcome?.type || null,
		risk_level: charge.outcome?.risk_level || null,
		card_brand: card?.brand || null,
		payment_intent_id: (charge.payment_intent as string) || null,
		session_id: sessionId,
	});

	logger.info(`✅ Charge ${charge.id} processed for client ${clientId}`);
}

async function insertRefund(refund: Stripe.Refund, config: StripeConfig) {
	const clientId = extractClientId(refund);
	const sessionId = extractSessionId(refund);

	validateClientId(clientId, refund.id, 'Refund');

	await insertStripeData('analytics.stripe_refunds', {
		id: refund.id,
		client_id: clientId,
		webhook_token: config.webhookToken,
		created: new Date(refund.created * 1000)
			.toISOString()
			.replace('T', ' ')
			.replace('Z', ''),
		amount: refund.amount,
		status: refund.status,
		reason: refund.reason,
		currency: refund.currency,
		charge_id: refund.charge as string,
		payment_intent_id: (refund.payment_intent as string) || null,
		metadata: refund.metadata,
		session_id: sessionId,
	});

	logger.info(`✅ Refund ${refund.id} processed for client ${clientId}`);
}

function logSecurityEvent(
	eventType: string,
	webhookToken: string,
	ip: string,
	metadata?: SecurityEventMetadata
) {
	const logData = {
		webhookToken,
		ip,
		timestamp: new Date().toISOString(),
		metadata,
	};

	if (IS_PRODUCTION) {
		logger.warn(`🚨 Security Event: ${eventType}`, logData);
	} else {
		logger.info(`🔍 Security Event (disabled): ${eventType}`, logData);
	}
}

// Commented out until DB fields are added
// /**
//  * Update webhook success tracking
//  */
// async function updateWebhookSuccess(webhookToken: string) {
//     if (webhookToken === 'global') return
//
//     try {
//         await db
//             .update(userStripeConfig)
//             .set({
//                 lastWebhookAt: new Date().toISOString(),
//                 webhookFailureCount: 0,
//                 updatedAt: new Date().toISOString()
//             })
//             .where(eq(userStripeConfig.webhookToken, webhookToken))
//     } catch (error) {
//         logger.error('Error updating webhook success:', {
//             error: error instanceof Error ? error.message : 'Unknown error',
//         });
//     }
// }

// /**
//  * Update webhook failure tracking
//  */
// async function updateWebhookFailure(webhookToken: string) {
//     if (webhookToken === 'global') return
//
//     try {
//         await db
//             .update(userStripeConfig)
//             .set({
//                 webhookFailureCount: sql`${userStripeConfig.webhookFailureCount} + 1`,
//                 updatedAt: new Date().toISOString()
//             })
//             .where(eq(userStripeConfig.webhookToken, webhookToken))
//     } catch (error) {
//         logger.error('Error updating webhook failure:', {
//             error: error instanceof Error ? error.message : 'Unknown error',
//         });
//     }
// }

export default app;
