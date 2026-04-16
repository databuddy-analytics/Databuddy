import type { EvalCase } from "../types";
import { behavioralCases } from "./behavioral";
import { formatCases } from "./format";
import { qualityCases } from "./quality";
import { toolRoutingCases } from "./tool-routing";

export const allCases: EvalCase[] = [
	...toolRoutingCases,
	...behavioralCases,
	...qualityCases,
	...formatCases,
];

export function getCasesByCategory(category: string): EvalCase[] {
	return allCases.filter((c) => c.category === category);
}

export function getCaseById(id: string): EvalCase | undefined {
	return allCases.find((c) => c.id === id);
}
