import { describe, expect, it } from "vitest";
import {
	canReadQueryTypesPublicly,
	PUBLIC_QUERY_TYPES,
	QueryBuilders,
} from "./index";

const PUBLIC_OVERVIEW_QUERY_TYPES = [
	"summary_metrics",
	"today_metrics",
	"events_by_date",
	"top_pages",
	"entry_pages",
	"exit_pages",
	"page_time_analysis",
	"traffic_sources",
	"top_referrers",
	"utm_sources",
	"utm_mediums",
	"utm_campaigns",
	"device_types",
	"browsers",
	"operating_systems",
	"outbound_links",
	"outbound_domains",
	"country",
] as const;

const PUBLIC_EVENTS_QUERY_TYPES = [
	"custom_events",
	"custom_events_summary",
	"custom_events_trends",
	"custom_events_trends_by_event",
	"custom_events_property_classification",
	"custom_events_property_distribution",
	"custom_events_property_top_values",
	"custom_events_recent",
] as const;

const PUBLIC_ERROR_QUERY_TYPES = [
	"recent_errors",
	"error_types",
	"errors_by_page",
	"error_summary",
	"error_chart_data",
] as const;

const PUBLIC_VITALS_QUERY_TYPES = [
	"vitals_overview",
	"vitals_time_series",
	"vitals_by_page",
	"vitals_by_country",
	"vitals_by_browser",
	"vitals_by_region",
	"vitals_by_city",
] as const;

describe("query builder publicAccess", () => {
	it("keeps the public query registry in sync with real builders", () => {
		for (const type of PUBLIC_QUERY_TYPES) {
			expect(QueryBuilders[type], type).toBeDefined();
		}
	});

	it("marks public dashboard query families as public-readable", () => {
		const publicTypes = [
			...PUBLIC_OVERVIEW_QUERY_TYPES,
			...PUBLIC_EVENTS_QUERY_TYPES,
			...PUBLIC_ERROR_QUERY_TYPES,
			...PUBLIC_VITALS_QUERY_TYPES,
		];

		for (const type of publicTypes) {
			expect(QueryBuilders[type]?.publicAccess, type).toBe(true);
		}
	});

	it("keeps revenue builders private even for public websites", () => {
		const revenueTypes = Object.keys(QueryBuilders).filter((type) =>
			type.startsWith("revenue_") || type === "recent_transactions"
		);

		expect(revenueTypes.length).toBeGreaterThan(0);
		for (const type of revenueTypes) {
			expect(QueryBuilders[type]?.publicAccess, type).not.toBe(true);
		}
	});

	it("allows public reads only when every requested builder opts in", () => {
		expect(
			canReadQueryTypesPublicly([
				"summary_metrics",
				"top_pages",
				"custom_events_summary",
				"recent_errors",
				"vitals_overview",
			])
		).toBe(true);

		expect(canReadQueryTypesPublicly(["revenue_overview"])).toBe(false);
		expect(
			canReadQueryTypesPublicly(["summary_metrics", "revenue_overview"])
		).toBe(false);
		expect(canReadQueryTypesPublicly(["missing_query_type"])).toBe(false);
		expect(canReadQueryTypesPublicly([])).toBe(false);
	});
});
