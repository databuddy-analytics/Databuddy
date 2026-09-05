import { isDeepStrictEqual } from "node:util";
import {
	insightDefinitionEditError,
	type InsightDefinitionEditChanges,
} from "@databuddy/shared/insights";
import { z } from "zod";
import { funnelStepSchema, toAnalyticsSteps } from "./funnel-steps";

const goalSchema = z.object({
	id: z.string(),
	target: z.string().min(1),
	type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
	filters: z.array(z.unknown()).nullable(),
});
const funnelSchema = z.object({
	id: z.string(),
	steps: z.array(funnelStepSchema).min(2),
	filters: z.array(z.unknown()).nullable(),
});

/** Shared by proposal validation and the transactional Apply boundary. */
export function insightRepairError(
	entity: { id: string; type: "goal" | "funnel" },
	current: unknown,
	changes?: InsightDefinitionEditChanges
): string | null {
	if (changes) {
		const error = insightDefinitionEditError(entity.type, changes);
		if (error) {
			return error;
		}
	}
	if (entity.type === "goal") {
		const parsed = goalSchema.safeParse(current);
		if (!parsed.success || parsed.data.id !== entity.id) {
			return "The exact current goal definition was not inspected. Read the goal with the signal's id, target, type, and filters.";
		}
		if (!changes) {
			return null;
		}
		const goal = parsed.data;
		if (
			(changes.target ?? goal.target) === goal.target &&
			((changes.type ?? goal.type) === "PAGE_VIEW") ===
				(goal.type === "PAGE_VIEW") &&
			isDeepStrictEqual(
				changes.filters ?? goal.filters ?? [],
				goal.filters ?? []
			)
		) {
			return "This repair does not change what the goal measures.";
		}
		return null;
	}
	const parsed = funnelSchema.safeParse(current);
	if (!parsed.success || parsed.data.id !== entity.id) {
		return "The exact current funnel definition was not inspected. Read the funnel with the signal's id, complete steps, and filters.";
	}
	if (!changes) {
		return null;
	}
	const funnel = parsed.data;
	const steps = changes.steps ?? funnel.steps;
	if (
		[...funnel.steps, ...steps].some(
			(step) => Object.keys(step.conditions ?? {}).length > 0
		) &&
		!isDeepStrictEqual(
			funnel.steps.map((step) => step.conditions ?? {}),
			steps.map((step) => step.conditions ?? {})
		)
	) {
		return "Automatic funnel repairs must preserve existing step conditions and cannot add conditions that analytics does not evaluate.";
	}
	if (
		isDeepStrictEqual(
			toAnalyticsSteps(steps).map(({ name: _name, ...step }) => step),
			toAnalyticsSteps(funnel.steps).map(({ name: _name, ...step }) => step)
		) &&
		isDeepStrictEqual(
			changes.filters ?? funnel.filters ?? [],
			funnel.filters ?? []
		)
	) {
		return "This repair does not change what the funnel measures.";
	}
	return null;
}
