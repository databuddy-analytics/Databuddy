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

export function normalizeFunnelSteps(steps: unknown): FunnelStep[] {
	const parsed = z.array(funnelStepSchema).safeParse(steps);
	return parsed.success ? parsed.data : [];
}

export function requireFunnelSteps(steps: unknown): FunnelStep[] {
	const normalized = normalizeFunnelSteps(steps);
	if (normalized.length < 2) {
		throw rpcError.badRequest(
			"Funnel must contain at least 2 valid steps and no malformed steps"
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
