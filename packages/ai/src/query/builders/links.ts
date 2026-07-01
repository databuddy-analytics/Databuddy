import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { SimpleQueryConfig } from "../types";

// Link Shortener Query Builders

const OUTBOUND_LINK_CONTEXT_CTES = `
	WITH session_dimensions AS (
		SELECT
			client_id,
			session_id,
			argMinIf(path, time, event_name = 'screen_view' AND ifNull(path, '') != '') as path,
			argMinIf(url, time, event_name = 'screen_view' AND ifNull(url, '') != '') as url,
			argMinIf(referrer, time, ifNull(referrer, '') != '') as referrer,
			argMinIf(country, time, ifNull(country, '') != '') as country,
			argMinIf(region, time, ifNull(region, '') != '') as region,
			argMinIf(city, time, ifNull(city, '') != '') as city,
			argMinIf(timezone, time, ifNull(timezone, '') != '') as timezone,
			argMinIf(language, time, ifNull(language, '') != '') as language,
			argMinIf(device_type, time, ifNull(device_type, '') != '') as device_type,
			argMinIf(browser_name, time, ifNull(browser_name, '') != '') as browser_name,
			argMinIf(os_name, time, ifNull(os_name, '') != '') as os_name,
			argMinIf(utm_source, time, ifNull(utm_source, '') != '') as utm_source,
			argMinIf(utm_medium, time, ifNull(utm_medium, '') != '') as utm_medium,
			argMinIf(utm_campaign, time, ifNull(utm_campaign, '') != '') as utm_campaign
		FROM analytics.events
		WHERE
			client_id = {websiteId:String}
			AND time >= toDateTime({startDate:String})
			AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
			AND session_id != ''
		GROUP BY client_id, session_id
	),
	outgoing_with_context AS (
		SELECT
			ol.*,
			sd.path,
			sd.url,
			sd.referrer,
			sd.country,
			sd.region,
			sd.city,
			sd.timezone,
			sd.language,
			sd.device_type,
			sd.browser_name,
			sd.os_name,
			sd.utm_source,
			sd.utm_medium,
			sd.utm_campaign
		FROM analytics.outgoing_links ol
		LEFT JOIN session_dimensions sd
			ON sd.client_id = ol.client_id
			AND sd.session_id = ol.session_id
		WHERE
			ol.client_id = {websiteId:String}
			AND ol.timestamp >= toDateTime({startDate:String})
			AND ol.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
			AND ol.href != ''
			AND ol.href NOT LIKE '%undefined%'
			AND ol.href NOT LIKE '%null%'
			AND length(ol.href) > 7
			AND ol.href LIKE 'http%'
			AND position('.' IN ol.href) > 0
			AND ol.text != 'undefined'
			AND ol.text != 'null'
	)
`;

export const LinkShortenerBuilders: Record<string, SimpleQueryConfig> = {
	link_total_clicks: {
		meta: {
			title: "Link Total Clicks",
			description: "Total clicks for a shortened link within the date range.",
			category: "Links",
			tags: ["links", "shortener", "clicks", "total"],
			output_fields: [
				{
					name: "total",
					type: "number",
					label: "Total Clicks",
					description: "Total number of clicks on this link",
				},
			],
			default_visualization: "metric",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.link_visits,
		fields: ["count() as total"],
		timeField: "timestamp",
		idField: "link_id",
		customizable: false,
	},

	link_clicks_by_day: {
		meta: {
			title: "Link Clicks by Day",
			description: "Daily breakdown of clicks for a shortened link.",
			category: "Links",
			tags: ["links", "shortener", "clicks", "daily", "timeseries"],
			output_fields: [
				{
					name: "date",
					type: "string",
					label: "Date",
					description: "Date of the clicks",
				},
				{
					name: "clicks",
					type: "number",
					label: "Clicks",
					description: "Number of clicks on this date",
				},
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.link_visits,
		fields: ["count() as clicks"],
		groupBy: ["date"],
		orderBy: "date ASC",
		timeField: "timestamp",
		idField: "link_id",
		timeBucket: {
			field: "timestamp",
			granularity: "day",
			alias: "date",
		},
		customizable: false,
	},

	link_referrers_by_day: {
		meta: {
			title: "Link Unique Referrers by Day",
			description: "Daily count of unique referrers for a shortened link.",
			category: "Links",
			tags: ["links", "shortener", "referrers", "daily", "timeseries"],
			output_fields: [
				{
					name: "date",
					type: "string",
					label: "Date",
					description: "Date",
				},
				{
					name: "value",
					type: "number",
					label: "Unique Referrers",
					description: "Number of unique referrers on this date",
				},
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.link_visits,
		fields: ["uniq(referrer) as value"],
		groupBy: ["date"],
		orderBy: "date ASC",
		timeField: "timestamp",
		idField: "link_id",
		timeBucket: {
			field: "timestamp",
			granularity: "day",
			alias: "date",
		},
		customizable: false,
	},

	link_countries_by_day: {
		meta: {
			title: "Link Unique Countries by Day",
			description: "Daily count of unique countries for a shortened link.",
			category: "Links",
			tags: ["links", "shortener", "countries", "daily", "timeseries"],
			output_fields: [
				{
					name: "date",
					type: "string",
					label: "Date",
					description: "Date",
				},
				{
					name: "value",
					type: "number",
					label: "Unique Countries",
					description: "Number of unique countries on this date",
				},
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.link_visits,
		fields: ["uniq(country) as value"],
		groupBy: ["date"],
		orderBy: "date ASC",
		timeField: "timestamp",
		idField: "link_id",
		timeBucket: {
			field: "timestamp",
			granularity: "day",
			alias: "date",
		},
		customizable: false,
	},

	// SQL output only; parseReferrers plugin adds source/domain/referrer_type/parsed_referrer at runtime.
	link_top_referrers: {
		meta: {
			title: "Link Top Referrers",
			description: "Top referrers for a shortened link.",
			category: "Links",
			tags: ["links", "shortener", "referrers", "traffic"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Name",
					description: "The referring source name",
				},
				{
					name: "referrer",
					type: "string",
					label: "Referrer",
					description: "The referring source URL",
				},
				{
					name: "clicks",
					type: "number",
					label: "Clicks",
					description: "Number of clicks from this referrer",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.link_visits,
		fields: [
			"coalesce(nullIf(referrer, ''), 'Direct') as name",
			"coalesce(nullIf(referrer, ''), 'Direct') as referrer",
			"count() as clicks",
		],
		groupBy: ["referrer"],
		orderBy: "clicks DESC",
		limit: 10,
		timeField: "timestamp",
		idField: "link_id",
		customizable: false,
		plugins: { deduplicateReferrers: true, parseReferrers: true },
	},

	// SQL output only; normalizeGeo plugin adds country_code/country_name at runtime.
	link_top_countries: {
		meta: {
			title: "Link Top Countries",
			description: "Top countries for a shortened link.",
			category: "Links",
			tags: ["links", "shortener", "countries", "geo"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Country",
					description: "The country name",
				},
				{
					name: "country",
					type: "string",
					label: "Country",
					description: "Raw country value from the query",
				},
				{
					name: "clicks",
					type: "number",
					label: "Clicks",
					description: "Number of clicks from this country",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.link_visits,
		fields: [
			"coalesce(nullIf(country, ''), 'Unknown') as name",
			"coalesce(nullIf(country, ''), 'Unknown') as country",
			"count() as clicks",
		],
		groupBy: ["country"],
		orderBy: "clicks DESC",
		limit: 10,
		timeField: "timestamp",
		idField: "link_id",
		customizable: false,
		plugins: { normalizeGeo: true },
	},

	// SQL output only; normalizeGeo plugin adds country_code/country_name at runtime.
	link_top_regions: {
		meta: {
			title: "Link Top Regions",
			description: "Top regions for a shortened link.",
			category: "Links",
			tags: ["links", "shortener", "regions", "geo"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Region",
					description: "The region name",
				},
				{
					name: "country",
					type: "string",
					label: "Country",
					description: "Raw country value from the query",
				},
				{
					name: "clicks",
					type: "number",
					label: "Clicks",
					description: "Number of clicks from this region",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.link_visits,
		fields: [
			"coalesce(nullIf(region, ''), 'Unknown') as name",
			"coalesce(nullIf(country, ''), 'Unknown') as country",
			"count() as clicks",
		],
		groupBy: ["region", "country"],
		orderBy: "clicks DESC",
		limit: 10,
		timeField: "timestamp",
		idField: "link_id",
		customizable: false,
		plugins: { normalizeGeo: true },
	},

	// SQL output only; normalizeGeo plugin adds country_code/country_name at runtime.
	link_top_cities: {
		meta: {
			title: "Link Top Cities",
			description: "Top cities for a shortened link.",
			category: "Links",
			tags: ["links", "shortener", "cities", "geo"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "City",
					description: "The city name",
				},
				{
					name: "country",
					type: "string",
					label: "Country",
					description: "Raw country value from the query",
				},
				{
					name: "clicks",
					type: "number",
					label: "Clicks",
					description: "Number of clicks from this city",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.link_visits,
		fields: [
			"coalesce(nullIf(city, ''), 'Unknown') as name",
			"coalesce(nullIf(country, ''), 'Unknown') as country",
			"count() as clicks",
		],
		groupBy: ["city", "country"],
		orderBy: "clicks DESC",
		limit: 10,
		timeField: "timestamp",
		idField: "link_id",
		customizable: false,
		plugins: { normalizeGeo: true },
	},

	link_top_devices: {
		meta: {
			title: "Link Top Devices",
			description:
				"Device type breakdown for a shortened link (mobile, desktop, tablet).",
			category: "Links",
			tags: ["links", "shortener", "devices", "mobile", "desktop"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Device Type",
					description: "The device type (mobile, desktop, tablet)",
				},
				{
					name: "clicks",
					type: "number",
					label: "Clicks",
					description: "Number of clicks from this device type",
				},
			],
			default_visualization: "pie",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.link_visits,
		fields: [
			"coalesce(nullIf(device_type, ''), 'Unknown') as name",
			"count() as clicks",
		],
		groupBy: ["device_type"],
		orderBy: "clicks DESC",
		timeField: "timestamp",
		idField: "link_id",
		customizable: false,
	},

	link_top_browsers: {
		meta: {
			title: "Link Top Browsers",
			description: "Browser breakdown for a shortened link.",
			category: "Links",
			tags: ["links", "shortener", "browsers"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Browser",
					description: "The browser name",
				},
				{
					name: "clicks",
					type: "number",
					label: "Clicks",
					description: "Number of clicks from this browser",
				},
			],
			default_visualization: "table",
			supports_granularity: [],
			version: "1.0",
		},
		table: Analytics.link_visits,
		fields: [
			"coalesce(nullIf(browser_name, ''), 'Unknown') as name",
			"count() as clicks",
		],
		groupBy: ["browser_name"],
		orderBy: "clicks DESC",
		limit: 10,
		timeField: "timestamp",
		idField: "link_id",
		customizable: false,
	},
};

// Outbound Links Query Builders (Website Analytics)

export const LinksBuilders: Record<string, SimpleQueryConfig> = {
	outbound_links: {
		meta: {
			title: "Outbound Links",
			description:
				"Track external links clicked by users, showing which outbound destinations are most popular.",
			category: "Behavior",
			tags: ["links", "outbound", "external", "clicks", "engagement"],
			output_fields: [
				{
					name: "href",
					type: "string",
					label: "Destination URL",
					description: "The external URL that was clicked",
				},
				{
					name: "text",
					type: "string",
					label: "Link Text",
					description: "The visible text of the clicked link",
				},
				{
					name: "total_clicks",
					type: "number",
					label: "Total Clicks",
					description: "Total number of clicks on this link",
				},
				{
					name: "unique_users",
					type: "number",
					label: "Unique Users",
					description: "Number of unique users who clicked this link",
				},
				{
					name: "unique_sessions",
					type: "number",
					label: "Unique Sessions",
					description: "Number of unique sessions with clicks on this link",
				},
				{
					name: "percentage",
					type: "number",
					label: "Click Share",
					description: "Percentage of total outbound link clicks",
					unit: "%",
				},
				{
					name: "last_clicked",
					type: "string",
					label: "Last Clicked",
					description: "Most recent time this link was clicked",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filterConditions, filterParams } =
				ctx;
			const limit = ctx.limit || 100;
			const filterClause = appendFilterClause(filterConditions);

			return {
				sql: `
					${OUTBOUND_LINK_CONTEXT_CTES}
					SELECT
						href,
						text,
						total_clicks,
						unique_users,
						unique_sessions,
						ROUND(total_clicks / sum(total_clicks) OVER () * 100, 2) as percentage,
						last_clicked
					FROM (
						SELECT
							href,
							text,
							count() as total_clicks,
							uniq(anonymous_id) as unique_users,
							uniq(session_id) as unique_sessions,
							max(timestamp) as last_clicked
						FROM outgoing_with_context
						WHERE 1 = 1
							${filterClause}
						GROUP BY href, text
					)
					ORDER BY total_clicks DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					websiteId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["client_id", "anonymous_id", "session_id", "href", "text"],
		customizable: true,
	},

	outbound_domains: {
		meta: {
			title: "Outbound Domains",
			description:
				"Aggregate outbound link clicks by destination domain to see which external sites users visit most.",
			category: "Behavior",
			tags: ["links", "domains", "external", "clicks", "destinations"],
			output_fields: [
				{
					name: "domain",
					type: "string",
					label: "Domain",
					description: "The external domain that was clicked",
				},
				{
					name: "total_clicks",
					type: "number",
					label: "Total Clicks",
					description: "Total number of clicks to this domain",
				},
				{
					name: "unique_users",
					type: "number",
					label: "Unique Users",
					description:
						"Number of unique users who clicked links to this domain",
				},
				{
					name: "unique_links",
					type: "number",
					label: "Unique Links",
					description: "Number of different links clicked to this domain",
				},
				{
					name: "percentage",
					type: "number",
					label: "Click Share",
					description: "Percentage of total outbound link clicks",
					unit: "%",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},

		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filterConditions, filterParams } =
				ctx;
			const limit = ctx.limit || 100;
			const filterClause = appendFilterClause(filterConditions);

			return {
				sql: `
					${OUTBOUND_LINK_CONTEXT_CTES}
					SELECT
						domain,
						total_clicks,
						unique_users,
						unique_links,
						ROUND(total_clicks / sum(total_clicks) OVER () * 100, 2) as percentage
					FROM (
						SELECT
							domain(href) as domain,
							count() as total_clicks,
							uniq(anonymous_id) as unique_users,
							uniq(href) as unique_links
						FROM outgoing_with_context
						WHERE 1 = 1
							${filterClause}
						GROUP BY domain(href)
					)
					ORDER BY total_clicks DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					websiteId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["client_id", "anonymous_id", "session_id", "href", "text"],
		customizable: true,
	},
};
