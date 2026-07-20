import type { ComparisonData } from "@/lib/comparison-config";

const YEAR = 2026;
const DESC_MAX = 158;

function trimMetaDescription(text: string): string {
	const t = text.trim();
	if (t.length <= DESC_MAX) {
		return t;
	}
	return `${t.slice(0, DESC_MAX - 1).trimEnd()}…`;
}

export type ProgrammaticComparisonVariant = "alternative" | "switch-from";

export function getProgrammaticComparisonSeo(
	variant: ProgrammaticComparisonVariant,
	data: ComparisonData
): { title: string; description: string } {
	const { competitor } = data;
	const name = competitor.name;

	if (variant === "alternative") {
		const description = trimMetaDescription(
			`Best ${name} alternative (${YEAR}): cookieless analytics, automatic investigations, and product analytics. Compare pricing (${competitor.pricing.starting} vs free), features, and migration.`
		);
		return {
			title: `Alternative to ${name} (${YEAR}) [Pricing & Features] | Databuddy`,
			description,
		};
	}

	const description = trimMetaDescription(
		`Switch from ${name} to Databuddy (${YEAR}). Compare features, pricing, automatic investigations, and migration steps before you move.`
	);
	return {
		title: `Switch from ${name} to Databuddy (${YEAR}) - Migration & Comparison`,
		description,
	};
}

export function getProgrammaticIntroText(
	variant: ProgrammaticComparisonVariant,
	data: ComparisonData
): string {
	const name = data.competitor.name;
	if (variant === "alternative") {
		return `Searching for an alternative to ${name}? Below is the same side-by-side breakdown teams use to compare privacy-first analytics, pricing, and features before they choose Databuddy.`;
	}
	return `Planning to move off ${name}? This page mirrors our full comparison - pricing tiers, feature parity, and FAQs - framed for teams actively switching tools.`;
}
