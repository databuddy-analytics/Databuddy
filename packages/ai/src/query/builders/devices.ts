import { Analytics } from "../../types/tables";
import { Expressions } from "../expressions";
import { appendFilterClause } from "../simple-builder";
import type { SimpleQueryConfig } from "../types";

export const DevicesBuilders = {
	browser_name: {
		meta: {
			title: "Browser Usage",
			description:
				"Website traffic breakdown by browser type showing which browsers your visitors use most.",
			category: "Technology",
			tags: ["browsers", "technology", "devices", "compatibility"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Browser Name",
					description: "The browser name (Chrome, Firefox, Safari, etc.)",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this browser",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors using this browser",
				},
				{
					name: "percentage",
					type: "number",
					label: "Usage %",
					description:
						"Share of summed visitor counts across all browser groups",
					unit: "%",
				},
			],
			default_visualization: "pie",
		},
		table: Analytics.events,
		fields: [
			"browser_name as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["browser_name != ''", "event_name = 'screen_view'"],
		groupBy: ["browser_name"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	os_name: {
		meta: {
			title: "Operating Systems",
			description:
				"Distribution of visitors by operating system (Windows, macOS, iOS, Android, etc.).",
			category: "Technology",
			tags: ["operating systems", "technology", "devices", "platforms"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Operating System",
					description: "The operating system name",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this OS",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors using this OS",
				},
				{
					name: "percentage",
					type: "number",
					label: "Usage %",
					description: "Share of summed visitor counts across all OS groups",
					unit: "%",
				},
			],
			default_visualization: "pie",
		},
		table: Analytics.events,
		fields: [
			"os_name as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["os_name != ''", "event_name = 'screen_view'"],
		groupBy: ["os_name"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	screen_resolution: {
		meta: {
			title: "Viewport Sizes",
			description:
				"Distribution of visitor viewport sizes to optimize design for the most common browser dimensions.",
			category: "Technology",
			tags: ["viewport", "display", "design", "responsive"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Viewport Size",
					description: "Viewport size (width x height)",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this viewport",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors with this viewport",
				},
				{
					name: "device_type",
					type: "string",
					label: "Device Type",
					description: "Device category (Desktop, Mobile, Tablet)",
				},
				{
					name: "percentage",
					type: "number",
					label: "Traffic %",
					description:
						"Share of summed visitor counts across all viewport and device groups",
					unit: "%",
				},
			],
			default_visualization: "table",
		},
		table: Analytics.events,
		fields: [
			"viewport_size as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
			"device_type",
		],
		percentageOf: { of: "visitors" },
		where: ["viewport_size != ''", "event_name = 'screen_view'"],
		groupBy: ["viewport_size", "device_type"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	browsers_grouped: {
		meta: {
			title: "Browser Versions",
			description:
				"Detailed breakdown of browser usage including specific version numbers for compatibility testing.",
			category: "Technology",
			tags: ["browsers", "versions", "compatibility", "testing"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Browser + Version",
					description: "Browser name and version combined",
				},
				{
					name: "browser_name",
					type: "string",
					label: "Browser Name",
					description: "The browser name only",
				},
				{
					name: "browser_version",
					type: "string",
					label: "Browser Version",
					description: "The browser version only",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this browser version",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors using this browser version",
				},
				{
					name: "sessions",
					type: "number",
					label: "Sessions",
					description: "Total sessions from this browser version",
				},
			],
			default_visualization: "table",
		},
		table: Analytics.events,
		fields: [
			"CONCAT(browser_name, ' ', browser_version) as name",
			"browser_name",
			"browser_version",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
			"uniq(session_id) as sessions",
		],
		where: [
			"browser_name != ''",
			"browser_version != ''",
			"browser_version IS NOT NULL",
			"event_name = 'screen_view'",
		],
		groupBy: ["browser_name", "browser_version"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	device_types: {
		meta: {
			title: "Device Categories",
			description:
				"Traffic breakdown by device category (Desktop, Mobile, Tablet) based on user agent detection.",
			category: "Technology",
			tags: ["device types", "mobile", "desktop", "tablet", "responsive"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Device Type",
					description: "The device category (Desktop, Mobile, Tablet, etc.)",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this device type",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors with this device type",
				},
				{
					name: "percentage",
					type: "number",
					label: "Share",
					description: "Percentage of total visitors",
					unit: "%",
				},
			],
			default_visualization: "pie",
		},
		table: Analytics.events,
		fields: [
			"if(ifNull(device_type, '') = '', 'Desktop', initCap(device_type)) as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["event_name = 'screen_view'"],
		groupBy: ["name"],
		orderBy: "visitors DESC",
		limit: 20,
		timeField: "time",
		customizable: true,
	},

	browsers: {
		meta: {
			description:
				"Detailed browser usage breakdown including specific browser names.",
			category: "Technology",
			tags: ["browsers", "technology", "devices"],
		},
		table: Analytics.events,
		fields: [
			"browser_name as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["browser_name != ''", "event_name = 'screen_view'"],
		groupBy: ["browser_name"],
		orderBy: "visitors DESC",
		limit: 25,
		timeField: "time",
		customizable: true,
	},

	browser_versions: {
		meta: {
			description: "Browser usage broken down by specific version numbers.",
			category: "Technology",
			tags: ["browsers", "versions", "compatibility"],
		},
		table: Analytics.events,
		fields: [
			"browser_name",
			"browser_version",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: [
			"browser_name != ''",
			"browser_version != ''",
			"event_name = 'screen_view'",
		],
		groupBy: ["browser_name", "browser_version"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	operating_systems: {
		meta: {
			description: "OS usage breakdown by operating system name.",
			category: "Technology",
			tags: ["operating systems", "technology", "devices"],
		},
		table: Analytics.events,
		fields: [
			"os_name as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		percentageOf: { of: "visitors" },
		where: ["os_name != ''", "event_name = 'screen_view'"],
		groupBy: ["os_name"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	os_versions: {
		meta: {
			description: "OS usage broken down by specific version numbers.",
			category: "Technology",
			tags: ["operating systems", "versions", "compatibility"],
		},
		table: Analytics.events,
		fields: [
			"CONCAT(os_name, ' ', os_version) as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		where: ["os_name != ''", "os_version != ''", "event_name = 'screen_view'"],
		groupBy: ["os_name", "os_version"],
		orderBy: "visitors DESC",
		limit: 25,
		timeField: "time",
		customizable: true,
	},

	screen_resolutions: {
		meta: {
			description: "Distribution of viewport sizes across visitors.",
			category: "Technology",
			tags: ["screen", "display", "devices"],
		},
		table: Analytics.events,
		fields: [
			"viewport_size as name",
			"COUNT(*) as pageviews",
			"uniq(anonymous_id) as visitors",
		],
		where: ["viewport_size != ''", "event_name = 'screen_view'"],
		groupBy: ["viewport_size"],
		orderBy: "visitors DESC",
		limit: 100,
		timeField: "time",
		customizable: true,
	},

	viewport_vs_resolution: {
		meta: {
			title: "Viewport Sizes by Device",
			description:
				"Distribution of browser viewport sizes across different device types.",
			category: "Technology",
			tags: ["viewport", "browser", "responsive", "devices"],
			output_fields: [
				{
					name: "viewport_size",
					type: "string",
					label: "Viewport Size",
					description: "Browser viewport dimensions",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors with this viewport",
				},
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews from this viewport",
				},
				{
					name: "device_type",
					type: "string",
					label: "Device Type",
					description: "Device category",
				},
			],
			default_visualization: "table",
		},
		table: Analytics.events,
		fields: [
			"viewport_size",
			"uniq(anonymous_id) as visitors",
			"COUNT(*) as pageviews",
			"device_type",
		],
		where: [
			"event_name = 'screen_view'",
			"viewport_size != ''",
			"viewport_size IS NOT NULL",
		],
		groupBy: ["viewport_size", "device_type"],
		orderBy: "visitors DESC",
		limit: 200,
		timeField: "time",
		customizable: true,
	},

	viewport_patterns: {
		meta: {
			title: "Common Viewport Sizes",
			description:
				"Analysis of the most common viewport sizes used by visitors.",
			category: "Technology",
			tags: ["viewport", "browsing patterns", "user behavior"],
			output_fields: [
				{
					name: "viewport_size",
					type: "string",
					label: "Viewport Size",
					description: "Browser viewport dimensions",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors with this viewport",
				},
				{
					name: "sessions",
					type: "number",
					label: "Sessions",
					description: "Total sessions with this viewport",
				},
				{
					name: "percentage",
					type: "number",
					label: "Share",
					description: "Percentage of total visitors",
					unit: "%",
				},
			],
			default_visualization: "pie",
		},
		table: Analytics.events,
		fields: [
			"viewport_size",
			"uniq(anonymous_id) as visitors",
			"uniq(session_id) as sessions",
		],
		percentageOf: { of: "visitors" },
		where: [
			"event_name = 'screen_view'",
			"viewport_size != ''",
			"viewport_size IS NOT NULL",
		],
		groupBy: ["viewport_size"],
		orderBy: "visitors DESC",
		limit: 50,
		timeField: "time",
		customizable: true,
	},

	traffic_segments: {
		meta: {
			description:
				"Pageviews and sessions per browser, browser major version, operating system, device type and country, for localizing a traffic change. Top 50 values per dimension.",
			category: "Audience",
			tags: ["segments", "browsers", "devices", "internal"],
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					pair.1 AS dimension,
					pair.2 AS value,
					countIf(event_name = 'screen_view') AS pageviews,
					uniq(session_id) AS sessions
				FROM ${Analytics.events}
				ARRAY JOIN ${Expressions.segments()} AS pair
				WHERE client_id = {websiteId:String}
					AND time >= toDateTime({startDate:String})
					AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					AND session_id != ''
					${appendFilterClause(ctx.filterConditions)}
				GROUP BY dimension, value
				ORDER BY dimension, sessions DESC
				LIMIT 50 BY dimension
			`,
			params: {
				websiteId: ctx.websiteId,
				startDate: ctx.startDate,
				endDate: ctx.endDate,
				...ctx.filterParams,
			},
		}),
		timeField: "time",
		commonFilters: false,
		allowedFilters: ["path"],
	},
} satisfies Record<string, SimpleQueryConfig>;
