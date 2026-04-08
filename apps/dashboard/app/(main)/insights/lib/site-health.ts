import type { Insight } from "@/lib/insight-types";

export type SiteHealthStatus = "healthy" | "attention" | "degraded";

export interface SiteHealth {
	reason: string | null;
	status: SiteHealthStatus;
}

export function deriveSiteHealth(
	websiteId: string,
	insights: Insight[]
): SiteHealth {
	const siteInsights = insights.filter((i) => i.websiteId === websiteId);
	if (siteInsights.length === 0) {
		return { status: "healthy", reason: null };
	}

	const critical = siteInsights.find((i) => i.severity === "critical");
	if (critical) {
		return { status: "degraded", reason: critical.title };
	}

	const warning = siteInsights.find((i) => i.severity === "warning");
	if (warning) {
		return { status: "attention", reason: warning.title };
	}

	return { status: "healthy", reason: null };
}
