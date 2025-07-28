import { chQuery } from '@databuddy/db';
import { TRPCError } from '@trpc/server';

export interface AnalyticsStep {
	step_number: number;
	name: string;
	type: 'PAGE_VIEW' | 'EVENT';
	target: string;
}

export interface ProcessedAnalytics {
	overall_conversion_rate: number;
	total_users_entered: number;
	total_users_completed: number;
	avg_completion_time: number;
	avg_completion_time_formatted: string;
	steps_analytics: Array<{
		step_number: number;
		step_name: string;
		users: number;
		total_users: number;
		conversion_rate: number;
		dropoffs: number;
		dropoff_rate: number;
		avg_time_to_complete: number;
	}>;
}

export interface FunnelAnalytics {
	overall_conversion_rate: number;
	total_users_entered: number;
	total_users_completed: number;
	avg_completion_time: number;
	avg_completion_time_formatted: string;
	biggest_dropoff_step: number;
	biggest_dropoff_rate: number;
	steps_analytics: Array<{
		step_number: number;
		step_name: string;
		users: number;
		total_users: number;
		conversion_rate: number;
		dropoffs: number;
		dropoff_rate: number;
		avg_time_to_complete: number;
	}>;
}

export interface ReferrerAnalytics {
	referrer: string;
	referrer_parsed: {
		name: string;
		type: string;
		domain: string;
		url: string;
	};
	total_users: number;
	completed_users: number;
	conversion_rate: number;
}

export const getTotalWebsiteUsers = async (
	websiteId: string,
	startDate: string,
	endDate: string
): Promise<number> => {
	const params = {
		websiteId,
		startDate,
		endDate: `${endDate} 23:59:59`,
	};

	const query = `
		SELECT COUNT(DISTINCT session_id) as total_users
		FROM analytics.events
		WHERE client_id = {websiteId:String}
			AND time >= parseDateTimeBestEffort({startDate:String})
			AND time <= parseDateTimeBestEffort({endDate:String})
	`;

	const result = await chQuery<{ total_users: number }>(query, params);
	return result[0]?.total_users ?? 0;
};

const buildWhereCondition = (
	step: AnalyticsStep,
	params: Record<string, unknown>
): string => {
	const targetKey = `target_${step.step_number - 1}`;

	if (step.type === 'PAGE_VIEW') {
		params[targetKey] = step.target;
		params[`${targetKey}_like`] = `%${step.target}%`;
		return `event_name = 'screen_view' AND (path = {${targetKey}:String} OR path LIKE {${targetKey}_like:String})`;
	}

	params[targetKey] = step.target;
	return `event_name = {${targetKey}:String}`;
};

const buildStepQuery = (
	step: AnalyticsStep,
	stepIndex: number,
	filterConditions: string,
	params: Record<string, unknown>,
	includeReferrer = false
): string => {
	const stepNameKey = `step_name_${stepIndex}`;
	params[stepNameKey] = step.name;

	const whereCondition = buildWhereCondition(step, params);
	const referrerSelect = includeReferrer ? ', any(referrer) as referrer' : '';

	return `
		SELECT 
			${stepIndex + 1} as step_number,
			{${stepNameKey}:String} as step_name,
			session_id,
			MIN(time) as first_occurrence${referrerSelect}
		FROM analytics.events
		WHERE client_id = {websiteId:String}
			AND time >= parseDateTimeBestEffort({startDate:String})
			AND time <= parseDateTimeBestEffort({endDate:String})
			AND ${whereCondition}${filterConditions}
		GROUP BY session_id`;
};

const processSessionEvents = (
	rawResults: Array<{
		step_number: number;
		step_name: string;
		session_id: string;
		first_occurrence: number;
		referrer?: string;
	}>
): Map<
	string,
	Array<{
		step_number: number;
		step_name: string;
		first_occurrence: number;
		referrer?: string;
	}>
> => {
	const sessionEvents = new Map<
		string,
		Array<{
			step_number: number;
			step_name: string;
			first_occurrence: number;
			referrer?: string;
		}>
	>();

	for (const event of rawResults) {
		const existing = sessionEvents.get(event.session_id);
		const eventData = {
			step_number: event.step_number,
			step_name: event.step_name,
			first_occurrence: event.first_occurrence,
			referrer: event.referrer,
		};

		if (existing) {
			existing.push(eventData);
		} else {
			sessionEvents.set(event.session_id, [eventData]);
		}
	}

	return sessionEvents;
};

const calculateStepCounts = (
	sessionEvents: Map<
		string,
		Array<{
			step_number: number;
			step_name: string;
			first_occurrence: number;
			referrer?: string;
		}>
	>
): Map<number, Set<string>> => {
	const stepCounts = new Map<number, Set<string>>();

	for (const [sessionId, events] of sessionEvents) {
		events.sort((a, b) => a.first_occurrence - b.first_occurrence);
		let currentStep = 1;

		for (const event of events) {
			if (event.step_number === currentStep) {
				const stepSet = stepCounts.get(event.step_number);
				if (stepSet) {
					stepSet.add(sessionId);
				} else {
					stepCounts.set(event.step_number, new Set([sessionId]));
				}
				currentStep++;
			}
		}
	}

	return stepCounts;
};

export const processGoalAnalytics = async (
	steps: AnalyticsStep[],
	filters: Array<{ field: string; operator: string; value: string | string[] }>,
	params: Record<string, unknown>,
	totalWebsiteUsers: number
): Promise<ProcessedAnalytics> => {
	const { conditions: filterConditions, errors } = buildFilterConditions(
		filters,
		'f',
		params
	);

	if (errors.length > 0) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: `Invalid filters: ${errors.join(', ')}`,
		});
	}

	const firstStep = steps[0];
	const stepQuery = buildStepQuery(firstStep, 0, filterConditions, params);

	const analysisQuery = `
		WITH all_step_events AS (
			${stepQuery}
		)
		SELECT 
			step_number,
			step_name,
			session_id,
			first_occurrence
		FROM all_step_events
		ORDER BY session_id, first_occurrence`;

	const rawResults = await chQuery<{
		step_number: number;
		step_name: string;
		session_id: string;
		first_occurrence: number;
	}>(analysisQuery, params);

	const sessionEvents = processSessionEvents(rawResults);
	const stepCounts = calculateStepCounts(sessionEvents);

	const goalCompletions = stepCounts.get(1)?.size ?? 0;
	const conversion_rate =
		totalWebsiteUsers > 0 ? (goalCompletions / totalWebsiteUsers) * 100 : 0;

	const analyticsResults = [
		{
			step_number: 1,
			step_name: firstStep.name,
			users: goalCompletions,
			total_users: totalWebsiteUsers,
			conversion_rate,
			dropoffs: 0,
			dropoff_rate: 0,
			avg_time_to_complete: 0,
		},
	];

	return {
		overall_conversion_rate: conversion_rate,
		total_users_entered: totalWebsiteUsers,
		total_users_completed: goalCompletions,
		avg_completion_time: 0,
		avg_completion_time_formatted: '0s',
		steps_analytics: analyticsResults,
	};
};

type AllowedField =
	| 'event_name'
	| 'path'
	| 'referrer'
	| 'user_agent'
	| 'ip_address'
	| 'country'
	| 'city'
	| 'device_type'
	| 'browser'
	| 'os'
	| 'screen_resolution'
	| 'language'
	| 'utm_source'
	| 'utm_medium'
	| 'utm_campaign'
	| 'utm_term'
	| 'utm_content';

type AllowedOperator =
	| 'equals'
	| 'not_equals'
	| 'contains'
	| 'not_contains'
	| 'starts_with'
	| 'ends_with'
	| 'in'
	| 'not_in'
	| 'is_null'
	| 'is_not_null'
	| 'greater_than'
	| 'less_than'
	| 'greater_than_or_equal'
	| 'less_than_or_equal';

const ALLOWED_FIELDS: readonly AllowedField[] = [
	'event_name',
	'path',
	'referrer',
	'user_agent',
	'ip_address',
	'country',
	'city',
	'device_type',
	'browser',
	'os',
	'screen_resolution',
	'language',
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_term',
	'utm_content',
] as const;

const ALLOWED_OPERATORS: readonly AllowedOperator[] = [
	'equals',
	'not_equals',
	'contains',
	'not_contains',
	'starts_with',
	'ends_with',
	'in',
	'not_in',
	'is_null',
	'is_not_null',
	'greater_than',
	'less_than',
	'greater_than_or_equal',
	'less_than_or_equal',
] as const;

interface Filter {
	field: string;
	operator: string;
	value: string | string[];
}

const validateFilter = (filter: Filter): string | null => {
	if (!ALLOWED_FIELDS.includes(filter.field as AllowedField)) {
		return `Invalid field: ${filter.field}`;
	}

	if (!ALLOWED_OPERATORS.includes(filter.operator as AllowedOperator)) {
		return `Invalid operator: ${filter.operator}`;
	}

	if (
		!['is_null', 'is_not_null'].includes(filter.operator) &&
		(!filter.value ||
			(Array.isArray(filter.value) && filter.value.length === 0))
	) {
		return `Value is required for operator: ${filter.operator}`;
	}

	return null;
};

const escapeSqlWildcards = (value: string): string => {
	return value.replace(/[%_]/g, '\\$&');
};

const buildStringCondition = (
	field: string,
	operator: AllowedOperator,
	value: string,
	prefix: string,
	params: Record<string, unknown>
): string => {
	const paramKey = `${prefix}_${field}_${operator}`;

	let processedValue = value;

	if (operator === 'contains') {
		processedValue = `%${escapeSqlWildcards(value)}%`;
	} else if (operator === 'not_contains') {
		processedValue = `%${escapeSqlWildcards(value)}%`;
	} else if (operator === 'starts_with') {
		processedValue = `${escapeSqlWildcards(value)}%`;
	} else if (operator === 'ends_with') {
		processedValue = `%${escapeSqlWildcards(value)}`;
	} else {
		processedValue = escapeSqlWildcards(value);
	}

	params[paramKey] = processedValue;

	const conditions: Record<AllowedOperator, string> = {
		equals: `${field} = {${paramKey}:String}`,
		not_equals: `${field} != {${paramKey}:String}`,
		contains: `${field} LIKE {${paramKey}:String}`,
		not_contains: `${field} NOT LIKE {${paramKey}:String}`,
		starts_with: `${field} LIKE {${paramKey}:String}`,
		ends_with: `${field} LIKE {${paramKey}:String}`,
		greater_than: `${field} > {${paramKey}:String}`,
		less_than: `${field} < {${paramKey}:String}`,
		greater_than_or_equal: `${field} >= {${paramKey}:String}`,
		less_than_or_equal: `${field} <= {${paramKey}:String}`,
		is_null: `${field} IS NULL`,
		is_not_null: `${field} IS NOT NULL`,
		in: '',
		not_in: '',
	};

	return conditions[operator] || '';
};

const buildArrayCondition = (
	field: string,
	operator: AllowedOperator,
	values: string[],
	prefix: string,
	params: Record<string, unknown>
): string => {
	const paramKey = `${prefix}_${field}_${operator}`;
	params[paramKey] = values;

	if (operator === 'in') {
		return `${field} IN {${paramKey}:Array(String)}`;
	}

	if (operator === 'not_in') {
		return `${field} NOT IN {${paramKey}:Array(String)}`;
	}

	return '';
};

const buildFilterCondition = (
	filter: Filter,
	prefix: string,
	params: Record<string, unknown>
): string => {
	const validationError = validateFilter(filter);
	if (validationError) {
		throw new Error(validationError);
	}

	if (Array.isArray(filter.value)) {
		const condition = buildArrayCondition(
			filter.field,
			filter.operator as AllowedOperator,
			filter.value,
			prefix,
			params
		);
		if (condition) {
			return condition;
		}
	}

	return buildStringCondition(
		filter.field,
		filter.operator as AllowedOperator,
		filter.value as string,
		prefix,
		params
	);
};

export const buildFilterConditions = (
	filters: Filter[],
	prefix: string,
	params: Record<string, unknown>
): { conditions: string; errors: string[] } => {
	const conditions: string[] = [];
	const errors: string[] = [];

	for (const filter of filters) {
		try {
			const condition = buildFilterCondition(filter, prefix, params);
			if (condition) {
				conditions.push(condition);
			}
		} catch (error) {
			errors.push(
				error instanceof Error ? error.message : 'Unknown filter error'
			);
		}
	}

	return {
		conditions: conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '',
		errors,
	};
};

const parseReferrer = (referrer: string) => {
	if (!referrer || referrer === 'Direct') {
		return { name: 'Direct', type: 'direct', domain: '', url: '' };
	}

	try {
		const url = new URL(referrer);
		return {
			name: url.hostname,
			type: 'referrer',
			domain: url.hostname,
			url: referrer,
		};
	} catch {
		return { name: referrer, type: 'referrer', domain: '', url: referrer };
	}
};

export const processFunnelAnalytics = async (
	steps: AnalyticsStep[],
	filters: Array<{ field: string; operator: string; value: string | string[] }>,
	params: Record<string, unknown>
): Promise<FunnelAnalytics> => {
	const { conditions: filterConditions, errors } = buildFilterConditions(
		filters,
		'f',
		params
	);

	if (errors.length > 0) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: `Invalid filters: ${errors.join(', ')}`,
		});
	}

	const stepQueries = steps.map((step, index) =>
		buildStepQuery(step, index, filterConditions, params)
	);

	const analysisQuery = `
		WITH all_step_events AS (
			${stepQueries.join('\n			UNION ALL\n')}
		)
		SELECT 
			step_number,
			step_name,
			session_id,
			first_occurrence
		FROM all_step_events
		ORDER BY session_id, first_occurrence`;

	const rawResults = await chQuery<{
		step_number: number;
		step_name: string;
		session_id: string;
		first_occurrence: number;
	}>(analysisQuery, params);

	const sessionEvents = processSessionEvents(rawResults);
	const stepCounts = calculateStepCounts(sessionEvents);

	const analyticsResults = steps.map((step, index) => {
		const stepNumber = index + 1;
		const users = stepCounts.get(stepNumber)?.size || 0;
		const prevStepUsers = index > 0 ? stepCounts.get(index)?.size || 0 : users;
		const totalUsers = stepCounts.get(1)?.size || 0;

		let conversion_rate = 100.0;
		if (index > 0 && prevStepUsers > 0) {
			conversion_rate = Math.round((users / prevStepUsers) * 100 * 100) / 100;
		}

		const dropoffs = index > 0 ? prevStepUsers - users : 0;
		let dropoff_rate = 0;
		if (index > 0 && prevStepUsers > 0) {
			dropoff_rate = Math.round((dropoffs / prevStepUsers) * 100 * 100) / 100;
		}

		return {
			step_number: stepNumber,
			step_name: step.name,
			users,
			total_users: totalUsers,
			conversion_rate,
			dropoffs,
			dropoff_rate,
			avg_time_to_complete: 0,
		};
	});

	const firstStep = analyticsResults[0];
	const lastStep = analyticsResults.at(-1);
	const biggestDropoff = analyticsResults.reduce(
		(max, step) => (step.dropoff_rate > max.dropoff_rate ? step : max),
		analyticsResults[1] || analyticsResults[0]
	);

	let overall_conversion_rate = 0;
	if (lastStep && stepCounts.get(1)?.size) {
		const firstStepSize = stepCounts.get(1)?.size || 0;
		if (firstStepSize > 0) {
			overall_conversion_rate =
				Math.round((lastStep.users / firstStepSize) * 100 * 100) / 100;
		}
	}

	return {
		overall_conversion_rate,
		total_users_entered: firstStep ? firstStep.total_users : 0,
		total_users_completed: lastStep ? lastStep.users : 0,
		avg_completion_time: 0,
		avg_completion_time_formatted: '0s',
		biggest_dropoff_step: biggestDropoff ? biggestDropoff.step_number : 1,
		biggest_dropoff_rate: biggestDropoff ? biggestDropoff.dropoff_rate : 0,
		steps_analytics: analyticsResults,
	};
};

const calculateReferrerStepCounts = (
	group: {
		parsed: { name: string; type: string; domain: string; url: string };
		sessionIds: Set<string>;
	},
	sessionEvents: Map<
		string,
		Array<{
			step_number: number;
			step_name: string;
			first_occurrence: number;
			referrer?: string;
		}>
	>
): Map<number, Set<string>> => {
	const stepCounts = new Map<number, Set<string>>();

	for (const sessionId of group.sessionIds) {
		const events = sessionEvents
			.get(sessionId)
			?.sort((a, b) => a.first_occurrence - b.first_occurrence);

		if (!events) {
			continue;
		}

		let currentStep = 1;
		for (const event of events) {
			if (event.step_number === currentStep) {
				const stepSet = stepCounts.get(currentStep);
				if (stepSet) {
					stepSet.add(sessionId);
				} else {
					stepCounts.set(currentStep, new Set([sessionId]));
				}
				currentStep++;
			}
		}
	}

	return stepCounts;
};

const calculateReferrerConversionRate = (
	total_users: number,
	completed_users: number
): number => {
	if (total_users === 0) {
		return 0;
	}
	return Math.round((completed_users / total_users) * 100 * 100) / 100;
};

const processReferrerGroup = (
	groupKey: string,
	group: {
		parsed: { name: string; type: string; domain: string; url: string };
		sessionIds: Set<string>;
	},
	sessionEvents: Map<
		string,
		Array<{
			step_number: number;
			step_name: string;
			first_occurrence: number;
			referrer?: string;
		}>
	>,
	steps: AnalyticsStep[]
): ReferrerAnalytics | null => {
	const stepCounts = calculateReferrerStepCounts(group, sessionEvents);

	const total_users = stepCounts.get(1)?.size || 0;
	if (total_users === 0) {
		return null;
	}

	const completed_users = stepCounts.get(steps.length)?.size || 0;
	const conversion_rate = calculateReferrerConversionRate(
		total_users,
		completed_users
	);

	return {
		referrer: groupKey,
		referrer_parsed: group.parsed,
		total_users,
		completed_users,
		conversion_rate,
	};
};

const aggregateReferrerAnalytics = (
	referrerAnalytics: ReferrerAnalytics[]
): ReferrerAnalytics[] => {
	const aggregated = new Map<
		string,
		{
			parsed: { name: string; type: string; domain: string; url: string };
			total_users: number;
			completed_users: number;
			conversion_rate_sum: number;
			conversion_rate_count: number;
		}
	>();

	for (const {
		referrer,
		referrer_parsed,
		total_users,
		completed_users,
		conversion_rate,
	} of referrerAnalytics) {
		if (!aggregated.has(referrer)) {
			aggregated.set(referrer, {
				parsed: referrer_parsed,
				total_users: 0,
				completed_users: 0,
				conversion_rate_sum: 0,
				conversion_rate_count: 0,
			});
		}

		const agg = aggregated.get(referrer);
		if (agg) {
			agg.total_users += total_users;
			agg.completed_users += completed_users;
			agg.conversion_rate_sum += conversion_rate;
			agg.conversion_rate_count += 1;
		}
	}

	return Array.from(aggregated.entries())
		.map(([key, agg]) => {
			let conversion_rate = 0;
			if (agg.conversion_rate_count > 0) {
				conversion_rate =
					Math.round(
						(agg.conversion_rate_sum / agg.conversion_rate_count) * 100
					) / 100;
			}

			return {
				referrer: key,
				referrer_parsed: agg.parsed,
				total_users: agg.total_users,
				completed_users: agg.completed_users,
				conversion_rate,
			};
		})
		.sort((a, b) => b.total_users - a.total_users);
};

export const processFunnelAnalyticsByReferrer = async (
	steps: AnalyticsStep[],
	filters: Array<{ field: string; operator: string; value: string | string[] }>,
	params: Record<string, unknown>
): Promise<{ referrer_analytics: ReferrerAnalytics[] }> => {
	const { conditions: filterConditions, errors } = buildFilterConditions(
		filters,
		'f',
		params
	);

	if (errors.length > 0) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: `Invalid filters: ${errors.join(', ')}`,
		});
	}

	const stepQueries = steps.map((step, index) =>
		buildStepQuery(step, index, filterConditions, params, true)
	);

	const sessionReferrerQuery = `
		WITH all_step_events AS (
			${stepQueries.join('\n			UNION ALL\n')}
		)
		SELECT 
			step_number,
			step_name,
			session_id,
			first_occurrence,
			referrer
		FROM all_step_events
		ORDER BY session_id, first_occurrence`;

	const rawResults = await chQuery<{
		step_number: number;
		step_name: string;
		session_id: string;
		first_occurrence: number;
		referrer: string;
	}>(sessionReferrerQuery, params);

	const sessionEvents = processSessionEvents(rawResults);

	const referrerGroups = new Map<
		string,
		{
			parsed: { name: string; type: string; domain: string; url: string };
			sessionIds: Set<string>;
		}
	>();

	for (const [sessionId, events] of sessionEvents) {
		if (events.length > 0) {
			const referrer = events[0].referrer || 'Direct';
			const parsed = parseReferrer(referrer);
			const groupKey = parsed.domain ? parsed.domain.toLowerCase() : 'direct';

			if (!referrerGroups.has(groupKey)) {
				referrerGroups.set(groupKey, { parsed, sessionIds: new Set() });
			}
			referrerGroups.get(groupKey)?.sessionIds.add(sessionId);
		}
	}

	const referrerAnalytics: ReferrerAnalytics[] = [];

	for (const [groupKey, group] of referrerGroups) {
		const analytics = processReferrerGroup(
			groupKey,
			group,
			sessionEvents,
			steps
		);
		if (analytics) {
			referrerAnalytics.push(analytics);
		}
	}

	const referrer_analytics = aggregateReferrerAnalytics(referrerAnalytics);

	return { referrer_analytics };
};
