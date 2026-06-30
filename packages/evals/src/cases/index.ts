import type { EvalCase, EvalSurface } from "../types";
import { attributionCases } from "./attribution";
import { behavioralCases } from "./behavioral";
import { formatCases } from "./format";
import { insightsCases } from "./insights";
import { integrationCases } from "./integrations";
import { qualityCases } from "./quality";
import { slackThreadCases } from "./slack-thread";
import { toolRoutingCases } from "./tool-routing";

const DEFAULT_SURFACE: EvalSurface = "agent";

export const allCases: EvalCase[] = [
	...toolRoutingCases,
	...behavioralCases,
	...attributionCases,
	...qualityCases,
	...insightsCases,
	...formatCases,
	...integrationCases,
	...slackThreadCases,
];

export function getCasesByCategory(category: string): EvalCase[] {
	return allCases.filter((c) => c.category === category);
}

export function getCaseById(id: string): EvalCase | undefined {
	return allCases.find((c) => c.id === id);
}

export function getCaseSurfaces(evalCase: EvalCase): EvalSurface[] {
	return evalCase.surfaces?.length ? evalCase.surfaces : [DEFAULT_SURFACE];
}

export function getCaseTags(evalCase: EvalCase): string[] {
	return [...new Set([evalCase.category, ...(evalCase.tags ?? [])])].sort();
}

export function getCasesByFilters(filters: {
	category?: string;
	excludeTags?: string[];
	surfaces?: Array<EvalSurface | "all">;
	tags?: string[];
}): EvalCase[] {
	const surfaces = filters.surfaces?.length
		? filters.surfaces
		: [DEFAULT_SURFACE];
	const includeAllSurfaces = surfaces.includes("all");
	const tags = filters.tags ?? [];
	const excludeTags = filters.excludeTags ?? [];

	return allCases.filter((evalCase) => {
		if (filters.category && evalCase.category !== filters.category) {
			return false;
		}

		const caseSurfaces = getCaseSurfaces(evalCase);
		if (
			!(
				includeAllSurfaces ||
				caseSurfaces.some((surface) => surfaces.includes(surface))
			)
		) {
			return false;
		}

		const caseTags = getCaseTags(evalCase);
		if (tags.length > 0 && !tags.every((tag) => caseTags.includes(tag))) {
			return false;
		}
		return !excludeTags.some((tag) => caseTags.includes(tag));
	});
}

export function listCaseTags(): string[] {
	return [
		...new Set(allCases.flatMap((evalCase) => getCaseTags(evalCase))),
	].sort();
}

export function listCaseSurfaces(): EvalSurface[] {
	return [
		...new Set(allCases.flatMap((evalCase) => getCaseSurfaces(evalCase))),
	].sort();
}
