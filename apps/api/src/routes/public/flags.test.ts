import { describe, expect, it } from 'vitest';
import {
	evaluateFlag,
	evaluateRule,
	hashString,
	parseProperties,
} from './flags';

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

describe('Flag Evaluation System', () => {
	describe('Rollout Percentage Distribution', () => {
		it('should distribute users roughly according to percentage', () => {
			const flag = {
				key: 'test-rollout',
				type: 'rollout',
				defaultValue: false,
				rolloutPercentage: 25,
				payload: null,
				rules: [],
			};

			let enabledCount = 0;
			const totalUsers = 200;

			for (let i = 0; i < totalUsers; i++) {
				const userId = `user_${i}`;
				const context: UserContext = { userId };
				const result = evaluateFlag(flag, context);

				if (result.enabled) {
					enabledCount++;
				}
			}

			const enabledPercentage = (enabledCount / totalUsers) * 100;

			expect(enabledPercentage).toBeGreaterThan(15);
			expect(enabledPercentage).toBeLessThan(35);
		});

		it('should distribute users consistently', () => {
			const flag = {
				key: 'test-rollout',
				type: 'rollout',
				defaultValue: false,
				rolloutPercentage: 50,
				payload: null,
				rules: [],
			};

			const userId = 'test-user-123';
			const results: boolean[] = [];

			for (let i = 0; i < 10; i++) {
				const context: UserContext = { userId };
				const result = evaluateFlag(flag, context);
				results.push(result.enabled);
			}

			const firstResult = results[0];
			expect(results.every((result) => result === firstResult)).toBe(true);
		});

		it('should handle 0% rollout', () => {
			const flag = {
				key: 'test-rollout',
				type: 'rollout',
				defaultValue: false,
				rolloutPercentage: 0,
				payload: null,
				rules: [],
			};

			for (let i = 0; i < 50; i++) {
				const userId = `user_${i}`;
				const context: UserContext = { userId };
				const result = evaluateFlag(flag, context);
				expect(result.enabled).toBe(false);
				expect(result.reason).toBe('ROLLOUT_DISABLED');
			}
		});

		it('should handle 100% rollout', () => {
			const flag = {
				key: 'test-rollout',
				type: 'rollout',
				defaultValue: false,
				rolloutPercentage: 100,
				payload: null,
				rules: [],
			};

			for (let i = 0; i < 50; i++) {
				const userId = `user_${i}`;
				const context: UserContext = { userId };
				const result = evaluateFlag(flag, context);
				expect(result.enabled).toBe(true);
				expect(result.reason).toBe('ROLLOUT_ENABLED');
			}
		});

		it('should handle anonymous users consistently', () => {
			const flag = {
				key: 'test-rollout',
				type: 'rollout',
				defaultValue: false,
				rolloutPercentage: 30,
				payload: null,
				rules: [],
			};

			const results: boolean[] = [];
			for (let i = 0; i < 10; i++) {
				const context: UserContext = {};
				const result = evaluateFlag(flag, context);
				results.push(result.enabled);
			}

			const firstResult = results[0];
			expect(results.every((result) => result === firstResult)).toBe(true);
		});
	});

	describe('User ID Rules', () => {
		it('should match exact user ID', () => {
			const rule: FlagRule = {
				type: 'user_id',
				operator: 'equals',
				value: 'user_123',
				enabled: true,
				batch: false,
			};

			const context: UserContext = { userId: 'user_123' };
			expect(evaluateRule(rule, context)).toBe(true);

			const context2: UserContext = { userId: 'user_456' };
			expect(evaluateRule(rule, context2)).toBe(false);
		});

		it('should match user ID containing substring', () => {
			const rule: FlagRule = {
				type: 'user_id',
				operator: 'contains',
				value: 'test',
				enabled: true,
				batch: false,
			};

			const context: UserContext = { userId: 'user_test_123' };
			expect(evaluateRule(rule, context)).toBe(true);

			const context2: UserContext = { userId: 'user_prod_456' };
			expect(evaluateRule(rule, context2)).toBe(false);
		});

		it('should handle batch mode for user IDs', () => {
			const rule: FlagRule = {
				type: 'user_id',
				operator: 'equals',
				enabled: true,
				batch: true,
				batchValues: ['user_1', 'user_3', 'user_5'],
			};

			expect(evaluateRule(rule, { userId: 'user_1' })).toBe(true);
			expect(evaluateRule(rule, { userId: 'user_2' })).toBe(false);
			expect(evaluateRule(rule, { userId: 'user_3' })).toBe(true);
		});

		it('should handle empty user ID', () => {
			const rule: FlagRule = {
				type: 'user_id',
				operator: 'equals',
				value: 'user_123',
				enabled: true,
				batch: false,
			};

			const context: UserContext = {};
			expect(evaluateRule(rule, context)).toBe(false);
		});
	});

	describe('Email Rules', () => {
		it('should match exact email', () => {
			const rule: FlagRule = {
				type: 'email',
				operator: 'equals',
				value: 'user@example.com',
				enabled: true,
				batch: false,
			};

			expect(evaluateRule(rule, { email: 'user@example.com' })).toBe(true);
			expect(evaluateRule(rule, { email: 'other@example.com' })).toBe(false);
		});

		it('should match email domain', () => {
			const rule: FlagRule = {
				type: 'email',
				operator: 'ends_with',
				value: '@company.com',
				enabled: true,
				batch: false,
			};

			expect(evaluateRule(rule, { email: 'john@company.com' })).toBe(true);
			expect(evaluateRule(rule, { email: 'jane@personal.com' })).toBe(false);
		});

		it('should handle batch mode for emails', () => {
			const rule: FlagRule = {
				type: 'email',
				operator: 'equals',
				enabled: true,
				batch: true,
				batchValues: ['admin@company.com', 'dev@company.com'],
			};

			expect(evaluateRule(rule, { email: 'admin@company.com' })).toBe(true);
			expect(evaluateRule(rule, { email: 'user@company.com' })).toBe(false);
		});
	});

	describe('Property Rules', () => {
		it('should match property value', () => {
			const rule: FlagRule = {
				type: 'property',
				field: 'plan',
				operator: 'equals',
				value: 'premium',
				enabled: true,
				batch: false,
			};

			const context: UserContext = {
				properties: { plan: 'premium', region: 'us' },
			};
			expect(evaluateRule(rule, context)).toBe(true);

			const context2: UserContext = {
				properties: { plan: 'free', region: 'us' },
			};
			expect(evaluateRule(rule, context2)).toBe(false);
		});

		it('should handle property existence', () => {
			const rule: FlagRule = {
				type: 'property',
				field: 'beta_user',
				operator: 'exists',
				enabled: true,
				batch: false,
			};

			expect(evaluateRule(rule, { properties: { beta_user: true } })).toBe(
				true
			);
			expect(evaluateRule(rule, { properties: { beta_user: false } })).toBe(
				true
			);
			expect(evaluateRule(rule, { properties: { plan: 'free' } })).toBe(false);
			expect(evaluateRule(rule, { properties: {} })).toBe(false);
		});

		it('should handle batch mode for properties', () => {
			const rule: FlagRule = {
				type: 'property',
				field: 'region',
				operator: 'equals',
				enabled: true,
				batch: true,
				batchValues: ['us', 'ca', 'uk'],
			};

			expect(evaluateRule(rule, { properties: { region: 'us' } })).toBe(true);
			expect(evaluateRule(rule, { properties: { region: 'de' } })).toBe(false);
		});

		it('should handle missing field gracefully', () => {
			const rule: FlagRule = {
				type: 'property',
				operator: 'equals',
				value: 'test',
				enabled: true,
				batch: false,
			};

			const context: UserContext = { properties: { other_field: 'value' } };
			expect(evaluateRule(rule, context)).toBe(false);
		});
	});

	describe('Percentage Rules', () => {
		it('should enable users within percentage threshold', () => {
			const rule: FlagRule = {
				type: 'property',
				operator: 'equals',
				value: 50,
				enabled: true,
				batch: false,
			};

			let enabledCount = 0;
			const totalUsers = 200;

			for (let i = 0; i < totalUsers; i++) {
				const context: UserContext = { userId: `user_${i}` };
				if (evaluateRule(rule, context)) {
					enabledCount++;
				}
			}

			const percentage = (enabledCount / totalUsers) * 100;
			expect(percentage).toBeGreaterThan(35);
			expect(percentage).toBeLessThan(65);
		});

		it('should be consistent for same user', () => {
			const rule: FlagRule = {
				type: 'property',
				operator: 'equals',
				value: 25,
				enabled: true,
				batch: false,
			};

			const context: UserContext = { userId: 'test-user' };
			const results: boolean[] = [];

			for (let i = 0; i < 10; i++) {
				results.push(evaluateRule(rule, context));
			}

			expect(results.every((result) => result === results[0])).toBe(true);
		});

		it('should handle invalid percentage values', () => {
			const rule: FlagRule = {
				type: 'property',
				operator: 'equals',
				value: 'invalid',
				enabled: true,
				batch: false,
			};

			const context: UserContext = { userId: 'test-user' };
			expect(evaluateRule(rule, context)).toBe(false);
		});
	});

	describe('Flag Evaluation Flow', () => {
		it('should prioritize user rules over default value', () => {
			const flag = {
				key: 'test-flag',
				type: 'boolean',
				defaultValue: false,
				payload: { message: 'default' },
				rules: [
					{
						type: 'user_id',
						operator: 'equals',
						value: 'vip_user',
						enabled: true,
						batch: false,
					},
				],
			};

			const vipContext: UserContext = { userId: 'vip_user' };
			const result = evaluateFlag(flag, vipContext);

			expect(result.enabled).toBe(true);
			expect(result.reason).toBe('USER_RULE_MATCH');
		});

		it('should fall back to default value when no rules match', () => {
			const flag = {
				key: 'test-flag',
				type: 'boolean',
				defaultValue: true,
				payload: { message: 'enabled' },
				rules: [
					{
						type: 'user_id',
						operator: 'equals',
						value: 'vip_user',
						enabled: true,
						batch: false,
					},
				],
			};

			const regularContext: UserContext = { userId: 'regular_user' };
			const result = evaluateFlag(flag, regularContext);

			expect(result.enabled).toBe(true);
			expect(result.reason).toBe('BOOLEAN_DEFAULT');
		});

		it('should handle rollout type with user rules', () => {
			const flag = {
				key: 'rollout-with-rules',
				type: 'rollout',
				defaultValue: false,
				rolloutPercentage: 100, // 100% rollout
				payload: { feature: 'new-ui' },
				rules: [
					{
						type: 'user_id',
						operator: 'equals',
						value: 'beta_user',
						enabled: false,
						batch: false,
					},
				],
			};

			const betaResult = evaluateFlag(flag, { userId: 'beta_user' });
			expect(betaResult.enabled).toBe(false);
			expect(betaResult.reason).toBe('USER_RULE_MATCH');

			const regularResult = evaluateFlag(flag, { userId: 'regular_user' });
			expect(regularResult.enabled).toBe(true);
			expect(regularResult.reason).toBe('ROLLOUT_ENABLED');
		});

		it('should return correct payload based on enabled state', () => {
			const flag = {
				key: 'payload-test',
				type: 'boolean',
				defaultValue: false,
				payload: { feature: 'test-payload' },
				rules: [],
			};

			const enabledFlag = { ...flag, defaultValue: true };
			const disabledFlag = { ...flag, defaultValue: false };

			const enabledResult = evaluateFlag(enabledFlag, {});
			const disabledResult = evaluateFlag(disabledFlag, {});

			expect(enabledResult.payload).toEqual({ feature: 'test-payload' });
			expect(disabledResult.payload).toBe(null);
		});
	});

	describe('Edge Cases and Error Handling', () => {
		it('should handle missing or invalid context', () => {
			const rule: FlagRule = {
				type: 'user_id',
				operator: 'equals',
				value: 'test',
				enabled: true,
				batch: false,
			};

			expect(evaluateRule(rule, {})).toBe(false);
			expect(evaluateRule(rule, { userId: undefined })).toBe(false);
			expect(evaluateRule(rule, { userId: null as any })).toBe(false);
		});

		it('should handle invalid rule types', () => {
			const rule: FlagRule = {
				type: 'invalid_type' as any,
				operator: 'equals',
				value: 'test',
				enabled: true,
				batch: false,
			};

			const context: UserContext = { userId: 'test' };
			expect(evaluateRule(rule, context)).toBe(false);
		});

		it('should handle invalid operators', () => {
			const rule: FlagRule = {
				type: 'user_id',
				operator: 'invalid_operator',
				value: 'test',
				enabled: true,
				batch: false,
			};

			const context: UserContext = { userId: 'test' };
			expect(evaluateRule(rule, context)).toBe(false);
		});

		it('should handle malformed properties JSON gracefully', () => {
			const result = parseProperties('invalid json');
			expect(result).toEqual({});
		});

		it('should handle empty properties JSON', () => {
			const result = parseProperties('');
			expect(result).toEqual({});

			const result2 = parseProperties(undefined);
			expect(result2).toEqual({});
		});

		it('should handle batch mode with empty batch values', () => {
			const rule: FlagRule = {
				type: 'user_id',
				operator: 'equals',
				enabled: true,
				batch: true,
				batchValues: [],
			};

			const context: UserContext = { userId: 'test' };
			expect(evaluateRule(rule, context)).toBe(false);
		});

		it('should handle batch mode with undefined batch values', () => {
			const rule: FlagRule = {
				type: 'user_id',
				operator: 'equals',
				enabled: true,
				batch: true,
				batchValues: undefined,
			};

			const context: UserContext = { userId: 'test' };
			expect(evaluateRule(rule, context)).toBe(false);
		});

		it('should handle rule precedence (first matching rule wins)', () => {
			const flag = {
				key: 'precedence-test',
				type: 'boolean',
				defaultValue: false,
				payload: { default: true },
				rules: [
					{
						type: 'user_id',
						operator: 'equals',
						value: 'vip_user',
						enabled: true,
						batch: false,
					},
					{
						type: 'user_id',
						operator: 'equals',
						value: 'vip_user',
						enabled: false,
						batch: false,
					},
				],
			};

			const result = evaluateFlag(flag, { userId: 'vip_user' });
			expect(result.enabled).toBe(true);
			expect(result.reason).toBe('USER_RULE_MATCH');
		});

		it('should handle disabled rules', () => {
			const flag = {
				key: 'disabled-rule-test',
				type: 'boolean',
				defaultValue: true,
				payload: { enabled: true },
				rules: [
					{
						type: 'user_id',
						operator: 'equals',
						value: 'test_user',
						enabled: false,
						batch: false,
					},
				],
			};

			const result = evaluateFlag(flag, { userId: 'test_user' });
			expect(result.enabled).toBe(false);
			expect(result.reason).toBe('USER_RULE_MATCH');
		});

		it('should handle null/undefined flag properties', () => {
			const flag = {
				key: 'null-test',
				type: 'rollout',
				defaultValue: null,
				rolloutPercentage: undefined,
				payload: undefined,
				rules: [],
			};

			const result = evaluateFlag(flag, { userId: 'test' });
			expect(result.enabled).toBe(false);
			expect(result.payload).toBe(null);
			expect(result.reason).toBe('ROLLOUT_DISABLED');
		});
	});

	describe('Hash Function Consistency', () => {
		it('should produce consistent hash values', () => {
			const input = 'test-string';
			const hash1 = hashString(input);
			const hash2 = hashString(input);

			expect(hash1).toBe(hash2);
		});

		it('should produce different hash values for different inputs', () => {
			const hash1 = hashString('input1');
			const hash2 = hashString('input2');

			expect(hash1).not.toBe(hash2);
		});
	});

	describe('Integration Tests', () => {
		it('should handle complex flag evaluation with multiple rules', () => {
			const flag = {
				key: 'complex-flag',
				type: 'boolean',
				defaultValue: false,
				payload: { feature: 'complex' },
				rules: [
					{
						type: 'user_id',
						operator: 'equals',
						value: 'admin',
						enabled: true,
						batch: false,
					},
					{
						type: 'email',
						operator: 'ends_with',
						value: '@company.com',
						enabled: true,
						batch: false,
					},
					{
						type: 'property',
						field: 'plan',
						operator: 'equals',
						value: 'premium',
						enabled: true,
						batch: false,
					},
				],
			};

			const adminResult = evaluateFlag(flag, { userId: 'admin' });
			expect(adminResult.enabled).toBe(true);
			expect(adminResult.reason).toBe('USER_RULE_MATCH');

			const companyResult = evaluateFlag(flag, {
				userId: 'user1',
				email: 'user@company.com',
			});
			expect(companyResult.enabled).toBe(true);

			const premiumResult = evaluateFlag(flag, {
				userId: 'user2',
				properties: { plan: 'premium' },
			});
			expect(premiumResult.enabled).toBe(true);

			const regularResult = evaluateFlag(flag, {
				userId: 'user3',
				email: 'user@gmail.com',
				properties: { plan: 'free' },
			});
			expect(regularResult.enabled).toBe(false);
			expect(regularResult.reason).toBe('BOOLEAN_DEFAULT');
		});

		it('should handle rollout with percentage rules', () => {
			const flag = {
				key: 'rollout-percentage',
				type: 'rollout',
				defaultValue: false,
				rolloutPercentage: 80,
				payload: { rollout: true },
				rules: [
					{
						type: 'property',
						operator: 'equals',
						value: 30,
						enabled: false,
						batch: false,
					},
				],
			};

			let _enabledByRollout = 0;
			let disabledByRule = 0;
			let totalEnabled = 0;

			for (let i = 0; i < 150; i++) {
				const context: UserContext = { userId: `user_${i}` };
				const result = evaluateFlag(flag, context);

				if (result.enabled) {
					totalEnabled++;
					if (result.reason === 'ROLLOUT_ENABLED') {
						_enabledByRollout++;
					}
				} else if (result.reason === 'USER_RULE_MATCH') {
					disabledByRule++;
				}
			}

			const enabledPercentage = (totalEnabled / 150) * 100;
			const disabledByRulePercentage = (disabledByRule / 150) * 100;

			expect(disabledByRulePercentage).toBeGreaterThan(15);
			expect(disabledByRulePercentage).toBeLessThan(45);

			expect(enabledPercentage).toBeLessThan(85);
			expect(totalEnabled).toBeGreaterThan(0);
		});
	});

	describe('Comprehensive User Consistency', () => {
		it('should always return the same result for the same user across 1000 evaluations', () => {
			const testUserIds = [
				'user_001',
				'user_002',
				'user_003',
				'user_004',
				'user_005',
				'user_006',
				'user_007',
				'user_008',
				'user_009',
				'user_010',
			];

			const flags = [
				{
					key: 'boolean-flag',
					type: 'boolean',
					defaultValue: false,
					payload: { feature: 'test' },
					rules: [
						{
							type: 'user_id',
							operator: 'equals',
							value: 'user_001',
							enabled: true,
							batch: false,
						},
						{
							type: 'email',
							operator: 'ends_with',
							value: '@test.com',
							enabled: true,
							batch: false,
						},
					],
				},
				{
					key: 'rollout-flag',
					type: 'rollout',
					defaultValue: false,
					rolloutPercentage: 50,
					payload: { rollout: true },
					rules: [],
				},
				{
					key: 'percentage-flag',
					type: 'boolean',
					defaultValue: false,
					payload: { percentage: true },
					rules: [
						{
							type: 'property',
							operator: 'equals',
							value: 25,
							enabled: true,
							batch: false,
						},
					],
				},
				{
					key: 'property-flag',
					type: 'boolean',
					defaultValue: false,
					payload: { property: true },
					rules: [
						{
							type: 'property',
							field: 'plan',
							operator: 'equals',
							value: 'premium',
							enabled: true,
							batch: false,
						},
					],
				},
			];

			const contexts: UserContext[] = testUserIds.map((userId) => ({
				userId,
				email: `${userId}@test.com`,
				properties: { plan: userId === 'user_001' ? 'premium' : 'free' },
			}));

			const baselineResults: Record<string, boolean> = {};

			// First evaluation - establish baseline
			for (const userId of testUserIds) {
				for (const flag of flags) {
					const context = contexts.find((c) => c.userId === userId);
					const result = evaluateFlag(flag, context);
					baselineResults[`${userId}-${flag.key}`] = result.enabled;
				}
			}

			for (let evaluation = 0; evaluation < 1000; evaluation++) {
				for (const userId of testUserIds) {
					for (const flag of flags) {
						const context = contexts.find((c) => c.userId === userId);
						const result = evaluateFlag(flag, context);
						const key = `${userId}-${flag.key}`;

						expect(result.enabled).toBe(baselineResults[key]);
					}
				}
			}
		});
	});
});
