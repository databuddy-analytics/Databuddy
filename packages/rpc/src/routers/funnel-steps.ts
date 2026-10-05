import { z } from "zod";
import { rpcError } from "../errors";
import type { AnalyticsStep } from "../lib/analytics-utils";

export const funnelStepSchema = z.object({
	type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
	target: z.string().min(1),
	name: z.string().min(1),
	conditions: z.record(z.string(), z.unknown()).optional(),
});

export type FunnelStep = z.infer<typeof funnelStepSchema>;

export const filterSchema = z.object({
	field: z.string(),
	operator: z.enum([
		"contains",
		"ends_with",
		"equals",
		"in",
		"not_contains",
		"not_equals",
		"not_in",
		"starts_with",
	]),
	value: z.union([z.string(), z.array(z.string())]),
});

const stepErrorInsightOutputSchema = z.object({
	message: z.string(),
	error_type: z.string(),
	count: z.number(),
});

const stepAnalyticsOutputSchema = z.object({
	step_number: z.number(),
	step_name: z.string(),
	users: z.number(),
	total_users: z.number(),
	conversion_rate: z.number(),
	dropoffs: z.number(),
	dropoff_rate: z.number(),
	avg_time_to_complete: z.number(),
	error_context_available: z.boolean(),
	error_count: z.number(),
	error_rate: z.number(),
	top_errors: z.array(stepErrorInsightOutputSchema),
});

const timeSeriesPointSchema = z.object({
	date: z.string(),
	users: z.number(),
	conversions: z.number(),
	conversion_rate: z.number(),
	dropoffs: z.number(),
	avg_time: z.number(),
});

export const conversionAnalyticsOutputSchema = z.object({
	overall_conversion_rate: z.number(),
	total_users_entered: z.number(),
	total_users_completed: z.number(),
	avg_completion_time: z.number(),
	avg_completion_time_formatted: z.string(),
	biggest_dropoff_step: z.number(),
	biggest_dropoff_rate: z.number(),
	duration_available: z.boolean(),
	steps_analytics: z.array(stepAnalyticsOutputSchema),
	time_series: z.array(timeSeriesPointSchema).optional(),
	error_insights: z.object({
		available: z.boolean(),
		total_errors: z.number(),
		sessions_with_errors: z.number(),
		dropoffs_with_errors: z.number(),
		error_correlation_rate: z.number(),
	}),
});

export function normalizeFunnelSteps(steps: unknown): FunnelStep[] {
	const parsed = z.array(funnelStepSchema).safeParse(steps);
	return parsed.success ? parsed.data : [];
}

export function requireFunnelSteps(steps: unknown): FunnelStep[] {
	const normalized = normalizeFunnelSteps(steps);
	if (normalized.length < 2) {
		throw rpcError.badRequest(
			"A funnel needs at least 2 steps, and every step needs a target. Fix the steps and try again."
		);
	}
	return normalized;
}

export function toAnalyticsSteps(steps: FunnelStep[]): AnalyticsStep[] {
	return steps.map((step, index) => ({
		step_number: index + 1,
		type: step.type === "PAGE_VIEW" ? "PAGE_VIEW" : "EVENT",
		target: step.target,
		name: step.name,
	}));
}
