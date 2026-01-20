import { Analytics } from "../../types/tables";
import type { Filter, SimpleQueryConfig, TimeUnit } from "../types";

// ============================================================================
// Link Shortener Query Builders
// ============================================================================

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
		plugins: { parseReferrers: true },
	},

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
					name: "country_code",
					type: "string",
					label: "Country Code",
					description: "The country code",
				},
				{
					name: "country_name",
					type: "string",
					label: "Country Name",
					description: "The country name (same as name for countries)",
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
					name: "country_code",
					type: "string",
					label: "Country Code",
					description: "The country code",
				},
				{
					name: "country_name",
					type: "string",
					label: "Country Name",
					description: "The country name",
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
					name: "country_code",
					type: "string",
					label: "Country Code",
					description: "The country code",
				},
				{
					name: "country_name",
					type: "string",
					label: "Country Name",
					description: "The country name",
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
			description: "Device type breakdown for a shortened link (mobile, desktop, tablet).",
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

// ============================================================================
// Outbound Links Query Builders (Website Analytics)
// ============================================================================

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
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit || 100;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					WITH enriched_links AS (
						SELECT 
							ol.href,
							ol.text,
							ol.anonymous_id,
							ol.session_id,
							ol.timestamp,
							-- Get context from events table using session_id
							e.path,
							e.country,
							e.device_type,
							e.browser_name,
							e.os_name,
							e.referrer,
							e.utm_source,
							e.utm_medium,
							e.utm_campaign
						FROM analytics.outgoing_links ol
						LEFT JOIN analytics.events e ON (
							ol.session_id = e.session_id 
							AND ol.client_id = e.client_id
							AND abs(dateDiff('second', ol.timestamp, e.time)) < 60
						)
						WHERE 
							ol.client_id = {websiteId:String}
							AND ol.timestamp >= toDateTime({startDate:String})
							AND ol.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND ol.href IS NOT NULL
							AND ol.href != ''
							AND ol.href NOT LIKE '%undefined%'
							AND ol.href NOT LIKE '%null%'
							AND length(ol.href) > 7
							AND ol.href LIKE 'http%'
							AND position('.' IN ol.href) > 0
							AND ol.text != 'undefined'
							AND ol.text != 'null'
							AND length(trim(ol.text)) >= 0
							${combinedWhereClause}
					)
					SELECT 
						href,
						text,
						COUNT(*) as total_clicks,
						COUNT(DISTINCT anonymous_id) as unique_users,
						COUNT(DISTINCT session_id) as unique_sessions,
						ROUND((COUNT(DISTINCT anonymous_id) / SUM(COUNT(DISTINCT anonymous_id)) OVER()) * 100, 2) as percentage,
						MAX(timestamp) as last_clicked
					FROM enriched_links
					GROUP BY href, text
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
		allowedFilters: [
			"path",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
			"utm_source",
			"utm_medium",
			"utm_campaign",
			"client_id",
			"anonymous_id",
			"session_id",
			"href",
			"text",
		],
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

		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit || 100;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					WITH enriched_links AS (
						SELECT 
							ol.href,
							ol.text,
							ol.anonymous_id,
							ol.session_id,
							ol.timestamp,
							-- Get context from events table using session_id
							e.path,
							e.country,
							e.device_type,
							e.browser_name,
							e.os_name,
							e.referrer,
							e.utm_source,
							e.utm_medium,
							e.utm_campaign
						FROM analytics.outgoing_links ol
						LEFT JOIN analytics.events e ON (
							ol.session_id = e.session_id 
							AND ol.client_id = e.client_id
							AND abs(dateDiff('second', ol.timestamp, e.time)) < 60
						)
						WHERE 
							ol.client_id = {websiteId:String}
							AND ol.timestamp >= toDateTime({startDate:String})
							AND ol.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND ol.href IS NOT NULL
							AND ol.href != ''
							AND ol.href NOT LIKE '%undefined%'
							AND ol.href NOT LIKE '%null%'
							AND length(ol.href) > 7
							AND ol.href LIKE 'http%'
							AND position('.' IN ol.href) > 0
							AND ol.text != 'undefined'
							AND ol.text != 'null'
							AND length(trim(ol.text)) >= 0
							${combinedWhereClause}
					)
					SELECT 
						domain(href) as domain,
						COUNT(*) as total_clicks,
						COUNT(DISTINCT anonymous_id) as unique_users,
						COUNT(DISTINCT href) as unique_links,
						ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage
					FROM enriched_links
					GROUP BY domain(href)
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
		allowedFilters: [
			"path",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
			"utm_source",
			"utm_medium",
			"utm_campaign",
			"client_id",
			"anonymous_id",
			"session_id",
			"href",
			"text",
		],
		customizable: true,
	},
};
