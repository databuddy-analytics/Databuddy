import { db, flags } from '@databuddy/db';
import { and, eq, isNull } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { logger } from '../lib/logger';

const evaluateFlagSchema = t.Object({
	key: t.String(),
	websiteId: t.Optional(t.String()),
	organizationId: t.Optional(t.String()),
	userId: t.Optional(t.String()),
	email: t.Optional(t.String()),
	properties: t.Optional(t.Record(t.String(), t.Any())),
});

interface UserContext {
	userId?: string;
	email?: string;
	properties?: Record<string, any>;
}

interface UserRule {
	type: 'user_id' | 'email' | 'property' | 'percentage';
	operator: string;
	field?: string;
	value?: any;
	values?: any[];
	enabled: boolean;
	batch: boolean;
	batchValues?: string[];
}

interface RuleEvaluationResult {
	matched: boolean;
	enabled: boolean;
	hasRules: boolean;
}

function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash &= hash;
	}
	return Math.abs(hash);
}

function evaluateUserRules(
	rules: UserRule[],
	userContext: UserContext
): RuleEvaluationResult {
	if (!rules || rules.length === 0) {
		return { matched: false, enabled: false, hasRules: false };
	}

	for (const rule of rules) {
		if (evaluateRule(rule, userContext)) {
			return { matched: true, enabled: rule.enabled, hasRules: true };
		}
	}

	return { matched: false, enabled: false, hasRules: true };
}

function evaluateRule(rule: UserRule, userContext: UserContext): boolean {
	if (rule.batch && rule.batchValues?.length) {
		switch (rule.type) {
			case 'user_id': {
				return userContext.userId
					? rule.batchValues.includes(userContext.userId)
					: false;
			}
			case 'email': {
				return userContext.email
					? rule.batchValues.includes(userContext.email)
					: false;
			}
			case 'property': {
				if (!rule.field) {
					return false;
				}
				const propertyValue = userContext.properties?.[rule.field];
				return propertyValue
					? rule.batchValues.includes(String(propertyValue))
					: false;
			}
			default: {
				return false;
			}
		}
	}

	switch (rule.type) {
		case 'user_id': {
			return evaluateStringRule(userContext.userId, rule);
		}
		case 'email': {
			return evaluateStringRule(userContext.email, rule);
		}
		case 'property': {
			if (!rule.field) {
				return false;
			}
			const propertyValue = userContext.properties?.[rule.field];
			return evaluateValueRule(propertyValue, rule);
		}
		case 'percentage': {
			if (typeof rule.value !== 'number') {
				return false;
			}
			const userId = userContext.userId || userContext.email || 'anonymous';
			const hash = hashString(`percentage:${userId}`);
			const percentage = hash % 100;
			return percentage < rule.value;
		}
		default: {
			return false;
		}
	}
}

function evaluateStringRule(
	value: string | undefined,
	rule: UserRule
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

function evaluateValueRule(value: any, rule: UserRule): boolean {
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

export const flagsRoute = new Elysia({ prefix: '/v1/flags' })
	.post(
		'/evaluate',
		async ({ body, set }) => {
			try {
				const input = body as {
					key: string;
					websiteId?: string;
					organizationId?: string;
					userId?: string;
					email?: string;
					properties?: Record<string, any>;
				};

				const flag = await db.query.flags.findFirst({
					where: and(
						eq(flags.key, input.key),
						isNull(flags.deletedAt),
						input.websiteId
							? eq(flags.websiteId, input.websiteId)
							: input.organizationId
								? eq(flags.organizationId, input.organizationId)
								: undefined
					),
				});

				if (!flag || flag.status !== 'active') {
					return {
						enabled: false,
						value: false,
						payload: null,
						reason: 'FLAG_NOT_FOUND_OR_INACTIVE',
					};
				}

				// Simple evaluation logic for SDK
				let enabled = Boolean(flag.defaultValue);
				let value: any = flag.defaultValue;
				let reason = 'DEFAULT_VALUE';

				// Handle different flag types
				if (flag.type === 'boolean') {
					enabled = Boolean(flag.defaultValue);
					value = enabled;
				} else if (flag.type === 'rollout' && input.userId) {
					// Simple hash-based rollout
					const hash = hashString(`${flag.key}:${input.userId}`);
					const percentage = hash % 100;
					enabled = percentage < (flag.rolloutPercentage || 0);
					value = enabled;
					reason = enabled ? 'ROLLOUT_ENABLED' : 'ROLLOUT_DISABLED';
				}

				// Check user targeting rules if present
				if (flag.rules && Array.isArray(flag.rules) && flag.rules.length > 0) {
					const userContext = {
						userId: input.userId,
						email: input.email,
						properties: input.properties || {},
					};

					const ruleResult = evaluateUserRules(
						flag.rules as UserRule[],
						userContext
					);
					if (ruleResult.matched) {
						enabled = ruleResult.enabled;
						value = ruleResult.enabled;
						reason = 'USER_RULE_MATCH';
					}
				}

				return {
					enabled,
					value,
					payload: enabled ? flag.payload : null,
					reason,
					flagId: flag.id,
					flagType: flag.type,
				};
			} catch (error) {
				logger.error({ error }, 'Flag evaluation error');
				set.status = 500;
				return {
					success: false,
					error: 'Failed to evaluate flag',
					enabled: false,
					value: false,
					payload: null,
					reason: 'EVALUATION_ERROR',
				};
			}
		},
		{
			body: evaluateFlagSchema,
		}
	)

	.get('/health', () => {
		return {
			service: 'flags',
			status: 'ok',
			timestamp: new Date().toISOString(),
		};
	});
