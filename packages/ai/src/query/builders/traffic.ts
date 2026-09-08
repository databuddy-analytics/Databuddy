import { Analytics } from "../../types/tables";
import { Expressions } from "../expressions";
import type { SimpleQueryConfig } from "../types";

const UTM_BASE_FILTERS = [
	"path",
	"query_string",
	"country",
	"device_type",
	"browser_name",
	"os_name",
	"referrer",
	"utm_source",
	"utm_medium",
	"utm_campaign",
];

function utmDimension(options: {
	column: string;
	title: string;
	label: string;
	noun: string;
	description: string;
	tags: string[];
}): SimpleQueryConfig {
	const { column, title, label, noun, description, tags } = options;
	return {
		meta: {
			title,
			description,
			category: "Acquisition",
			tags,
			output_fields: [
				{
					name: "name",
					type: "string",
					label,
					description: `The UTM ${noun} parameter value`,
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: `Total pageviews from this ${noun}`,
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: `Unique visitors from this ${noun}`,
				},
				{
					name: "percentage",
					type: "number",
					label: "Traffic %",
					description: "Percentage of total UTM traffic",
					unit: "%",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
		},
		table: Analytics.events,
		fields: [
			`${column} as name`,
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: [`${column} != ''`, "event_name = 'screen_view'"],
		groupBy: [column],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		allowedFilters: UTM_BASE_FILTERS.includes(column)
			? UTM_BASE_FILTERS
			: [...UTM_BASE_FILTERS, column],
		customizable: true,
		plugins: { sessionAttribution: true },
	};
}

export const TrafficBuilders: Record<string, SimpleQueryConfig> = {
	// SQL output only; parseReferrers plugin adds referrer/source/domain/referrer_type/parsed_referrer at runtime.
	top_referrers: {
		meta: {
			title: "Top Referrers",
			description:
				"Top external websites and domains that drive traffic to your site, excluding direct visits.",
			category: "Acquisition",
			tags: ["referrers", "traffic sources", "external", "backlinks"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Referrer Domain",
					description: "The referring domain or website",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this referrer",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors from this referrer",
				},
				{
					name: "percentage",
					type: "number",
					label: "Traffic %",
					description: "Percentage of total referral traffic",
					unit: "%",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
		},
		table: Analytics.events,
		fields: [
			`${Expressions.referrer.normalized} as name`,
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: [
			"referrer != ''",
			"referrer IS NOT NULL",
			"event_name = 'screen_view'",
			"domain(referrer) != '{websiteDomain}'",
			"NOT domain(referrer) ILIKE '%.{websiteDomain}'",
			"domain(referrer) NOT IN ('localhost', '127.0.0.1')",
		],
		groupBy: ["name"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		allowedFilters: [
			"path",
			"query_string",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
			"utm_source",
			"utm_medium",
			"utm_campaign",
		],
		customizable: true,
		plugins: {
			deduplicateReferrers: true,
			parseReferrers: true,
			sessionAttribution: true,
		},
	},

	utm_sources: utmDimension({
		column: "utm_source",
		title: "UTM Sources",
		label: "UTM Source",
		noun: "source",
		description:
			"Traffic breakdown by UTM source parameters from your marketing campaigns and tracked links.",
		tags: ["utm", "campaigns", "marketing", "sources"],
	}),

	utm_mediums: utmDimension({
		column: "utm_medium",
		title: "UTM Mediums",
		label: "UTM Medium",
		noun: "medium",
		description:
			"Traffic breakdown by UTM medium parameters (e.g. cpc, email, social).",
		tags: ["utm", "medium", "acquisition"],
	}),

	utm_campaigns: utmDimension({
		column: "utm_campaign",
		title: "UTM Campaigns",
		label: "Campaign Name",
		noun: "campaign",
		description:
			"Performance breakdown by UTM campaign parameters to track individual marketing campaign effectiveness.",
		tags: ["utm", "campaigns", "marketing", "performance"],
	}),

	utm_terms: utmDimension({
		column: "utm_term",
		title: "UTM Terms",
		label: "UTM Term",
		noun: "term",
		description:
			"Traffic breakdown by UTM term parameters, typically used for keyword tracking in paid campaigns.",
		tags: ["utm", "campaigns", "keywords", "terms"],
	}),

	utm_content: utmDimension({
		column: "utm_content",
		title: "UTM Content",
		label: "UTM Content",
		noun: "content",
		description:
			"Traffic breakdown by UTM content parameters, used to differentiate similar content or links within the same campaign.",
		tags: ["utm", "campaigns", "content", "creative"],
	}),

	// SQL output only; parseReferrers plugin adds referrer/source/domain/referrer_type/parsed_referrer at runtime.
	traffic_sources: {
		meta: {
			title: "Traffic Sources",
			description:
				"Traffic breakdown by direct visits and referring sources, with self-referrals folded into Direct.",
			category: "Acquisition",
			tags: ["traffic sources", "direct", "referrers", "acquisition"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Source",
					description: "The traffic source name or referrer domain",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this source",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors from this source",
				},
				{
					name: "percentage",
					type: "number",
					label: "Traffic %",
					description: "Percentage of all source-attributed traffic",
					unit: "%",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
		},
		table: Analytics.events,
		fields: [
			`${Expressions.referrer.sourceWithDirect()} as name`,
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["event_name = 'screen_view'"],
		groupBy: ["name"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		allowedFilters: [
			"path",
			"query_string",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
			"utm_source",
			"utm_medium",
			"utm_campaign",
		],
		customizable: true,
		plugins: {
			deduplicateReferrers: true,
			parseReferrers: true,
			sessionAttribution: true,
		},
	},
};
