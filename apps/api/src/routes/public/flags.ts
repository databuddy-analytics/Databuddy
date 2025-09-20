import { db, flags } from '@databuddy/db';
import { and, eq, isNull, or } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { logger } from '@/lib/logger';

const flagQuerySchema = t.Object({
	key: t.String(),
	clientId: t.String(),
	userId: t.Optional(t.String()),
	email: t.Optional(t.String()),
	properties: t.Optional(t.String()),
});

const bulkFlagQuerySchema = t.Object({
	clientId: t.String(),
	userId: t.Optional(t.String()),
	email: t.Optional(t.String()),
	properties: t.Optional(t.String()),
});

interface UserContext {
	userId?: string;
	email?: string;
	properties?: Record<string, unknown>;
}

interface FlagRule {
	type: 'user_id' | 'email' | 'property';
	operator: string;
	field?: string;
	value?: unknown;
	values?: unknown[];
	enabled: boolean;
	batch: boolean;
	batchValues?: string[];
}

interface FlagResult {
	enabled: boolean;
	value: boolean;
	payload: unknown;
	reason: string;
}

export function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
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
		logger.warn('Invalid properties JSON');
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
		case 'equals':
			return value === ruleValue;
		case 'contains':
			return value.includes(stringValue);
		case 'starts_with':
			return value.startsWith(stringValue);
		case 'ends_with':
			return value.endsWith(stringValue);
		case 'in':
			return Array.isArray(values) && values.includes(value);
		case 'not_in':
			return Array.isArray(values) && !values.includes(value);
		default:
			return false;
	}
}

export function evaluateValueRule(value: unknown, rule: FlagRule): boolean {
	const { operator, value: ruleValue, values } = rule;

	switch (operator) {
		case 'equals':
			return value === ruleValue;
		case 'contains':
			return String(value).includes(String(ruleValue));
		case 'in':
			return Array.isArray(values) && values.includes(value);
		case 'not_in':
			return Array.isArray(values) && !values.includes(value);
		case 'exists':
			return value !== undefined && value !== null;
		case 'not_exists':
			return value === undefined || value === null;
		default:
			return false;
	}
}

export function evaluateRule(rule: FlagRule, context: UserContext): boolean {
	if (rule.batch && rule.batchValues?.length) {
		switch (rule.type) {
			case 'user_id': {
				return context.userId
					? rule.batchValues.includes(context.userId)
					: false;
			}
			case 'email': {
				return context.email ? rule.batchValues.includes(context.email) : false;
			}
			case 'property': {
				if (!rule.field) {
					return false;
				}
				const propertyValue = context.properties?.[rule.field];
				return propertyValue
					? rule.batchValues.includes(String(propertyValue))
					: false;
			}
			default:
				return false;
		}
	}

	// Regular evaluation
	switch (rule.type) {
		case 'user_id':
			return evaluateStringRule(context.userId, rule);
		case 'email':
			return evaluateStringRule(context.email, rule);
		case 'property': {
			if (!rule.field) {
				return false;
			}
			const propertyValue = context.properties?.[rule.field];
			return evaluateValueRule(propertyValue, rule);
		}
		// case 'percentage': {
		// 	if (typeof rule.value !== 'number') {
		// 		return false;
		// 	}
		// 	const userId = context.userId || context.email || 'anonymous';
		// 	const hash = hashString(`percentage:${userId}`);
		// 	const percentage = hash % 100;
		// 	return percentage < rule.value;
		// }
		default:
			return false;
	}
}

export function evaluateFlag(flag: any, context: UserContext): FlagResult {
	if (flag.rules && Array.isArray(flag.rules) && flag.rules.length > 0) {
		for (const rule of flag.rules as FlagRule[]) {
			if (evaluateRule(rule, context)) {
				return {
					enabled: rule.enabled,
					value: rule.enabled,
					payload: rule.enabled ? flag.payload : null,
					reason: 'USER_RULE_MATCH',
				};
			}
		}
	}

	let enabled = Boolean(flag.defaultValue);
	let value = enabled;
	let reason = 'DEFAULT_VALUE';

	if (flag.type === 'rollout') {
		const identifier = context.userId || context.email || 'anonymous';
		const hash = hashString(`${flag.key}:${identifier}`);
		const percentage = hash % 100;
		const rolloutPercentage = flag.rolloutPercentage || 0;

		enabled = percentage < rolloutPercentage;
		value = enabled;
		reason = enabled ? 'ROLLOUT_ENABLED' : 'ROLLOUT_DISABLED';
	} else {
		enabled = Boolean(flag.defaultValue);
		value = enabled;
		reason = 'BOOLEAN_DEFAULT';
	}

	return {
		enabled,
		value,
		payload: enabled ? flag.payload : null,
		reason,
	};
}

export const flagsRoute = new Elysia({ prefix: '/v1/flags' })
	.get(
		'/evaluate',
		async ({ query, set }) => {
			try {
				const context: UserContext = {
					userId: query.userId,
					email: query.email,
					properties: parseProperties(query.properties),
				};

				// Temporarily more permissive: check both websiteId and organizationId
				const scopeCondition = or(
					eq(flags.websiteId, query.clientId),
					eq(flags.organizationId, query.clientId)
				);

				logger.info({
					message: 'Flag evaluation request',
					key: query.key,
					clientId: query.clientId,
					userId: query.userId,
					email: query.email,
				});

				const flag = await db.query.flags.findFirst({
					where: and(
						eq(flags.key, query.key),
						isNull(flags.deletedAt),
						eq(flags.status, 'active'),
						scopeCondition
					),
				});

				if (!flag) {
					// Debug: Let's check if the flag exists with any websiteId
					const allFlags = await db.query.flags.findMany({
						where: and(
							eq(flags.key, query.key),
							isNull(flags.deletedAt),
							eq(flags.status, 'active')
						),
					});

					logger.info({
						message: 'Flag debug info',
						key: query.key,
						clientId: query.clientId,
						foundFlags: allFlags.map((f) => ({
							id: f.id,
							websiteId: f.websiteId,
							organizationId: f.organizationId,
						})),
					});
				}

				if (!flag) {
					return {
						enabled: false,
						value: false,
						payload: null,
						reason: 'FLAG_NOT_FOUND',
					};
				}

				const result = evaluateFlag(flag, context);
				return {
					...result,
					flagId: flag.id,
					flagType: flag.type,
				};
			} catch (error) {
				logger.error({
					message: 'Flag evaluation failed',
					error,
				});
				set.status = 500;
				return {
					enabled: false,
					value: false,
					payload: null,
					reason: 'EVALUATION_ERROR',
				};
			}
		},
		{ query: flagQuerySchema }
	)

	.get(
		'/bulk',
		async ({ query, set }) => {
			try {
				const context: UserContext = {
					userId: query.userId,
					email: query.email,
					properties: parseProperties(query.properties),
				};

				// Temporarily more permissive: check both websiteId and organizationId
				const scopeCondition = or(
					eq(flags.websiteId, query.clientId),
					eq(flags.organizationId, query.clientId)
				);

				const allFlags = await db.query.flags.findMany({
					where: and(
						isNull(flags.deletedAt),
						eq(flags.status, 'active'),
						scopeCondition
					),
				});

				const enabledFlags: Record<string, FlagResult> = {};

				for (const flag of allFlags) {
					const result = evaluateFlag(flag, context);
					if (result.enabled) {
						enabledFlags[flag.key] = result;
					}
				}

				return {
					flags: enabledFlags,
					count: Object.keys(enabledFlags).length,
					timestamp: new Date().toISOString(),
				};
			} catch (_error) {
				logger.error('Bulk flag evaluation failed');
				set.status = 500;
				return {
					flags: {},
					count: 0,
					error: 'Bulk evaluation failed',
				};
			}
		},
		{ query: bulkFlagQuerySchema }
	)

	.get('/health', () => ({
		service: 'flags',
		status: 'ok',
		version: '1.0.0',
		timestamp: new Date().toISOString(),
	}));
