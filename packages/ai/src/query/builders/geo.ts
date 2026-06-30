import { Analytics } from "../../types/tables";
import type { SimpleQueryConfig } from "../types";

export const GeoBuilders: Record<string, SimpleQueryConfig> = {
	country: {
		meta: {
			title: "Countries",
			description:
				"Website traffic breakdown by country to understand your global audience distribution.",
			category: "Geography",
			tags: ["countries", "geography", "international", "audience"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Country",
					description: "Country name",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this country",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors from this country",
				},
				{
					name: "percentage",
					type: "number",
					label: "Traffic %",
					description: "Percentage of total traffic",
					unit: "%",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"country as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["country != ''", "event_name = 'screen_view'"],
		groupBy: ["country"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
		plugins: { normalizeGeo: true, deduplicateGeo: true },
	},

	region: {
		meta: {
			title: "Regions",
			description:
				"Traffic breakdown by region/state to understand local audience within countries.",
			category: "Geography",
			tags: ["regions", "states", "local", "geography"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Region/State",
					description: "Region or state name",
				},
				{
					name: "country",
					type: "string",
					label: "Country",
					description: "Country containing this region",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this region",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors from this region",
				},
				{
					name: "percentage",
					type: "number",
					label: "Traffic %",
					description: "Percentage of total traffic",
					unit: "%",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"region as name",
			"country",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["region != ''", "event_name = 'screen_view'"],
		groupBy: ["region", "country"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
		plugins: { normalizeGeo: true },
	},

	timezone: {
		meta: {
			description: "Visitor distribution by timezone.",
			category: "Geography",
			tags: ["timezone", "geography", "audience"],
		},
		table: Analytics.events,
		fields: [
			"timezone as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["timezone != ''", "event_name = 'screen_view'"],
		groupBy: ["timezone"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	language: {
		meta: {
			description: "Visitor distribution by browser language setting.",
			category: "Audience",
			tags: ["language", "audience", "demographics"],
		},
		table: Analytics.events,
		fields: [
			"language as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["language != ''", "event_name = 'screen_view'"],
		groupBy: ["language"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	city: {
		meta: {
			title: "Cities",
			description:
				"Detailed city-level traffic breakdown for hyperlocal audience analysis and targeting.",
			category: "Geography",
			tags: ["cities", "local", "hyperlocal", "targeting"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "City",
					description: "City name",
				},
				{
					name: "country",
					type: "string",
					label: "Country",
					description: "Country containing this city",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this city",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors from this city",
				},
				{
					name: "percentage",
					type: "number",
					label: "Traffic %",
					description: "Percentage of total traffic",
					unit: "%",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"city as name",
			"country",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["city != ''", "event_name = 'screen_view'"],
		groupBy: ["city", "country"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
		plugins: { normalizeGeo: true },
	},
};
