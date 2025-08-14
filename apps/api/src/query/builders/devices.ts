import { Analytics } from '../../types/tables';
import type { SimpleQueryConfig } from '../types';

export const DevicesBuilders: Record<string, SimpleQueryConfig> = {
	browser_name: {
		meta: {
			title: 'Browser Usage',
			description:
				'Website traffic breakdown by browser type showing which browsers your visitors use most.',
			category: 'Technology',
			tags: ['browsers', 'technology', 'devices', 'compatibility'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'Browser Name',
					description: 'The browser name (Chrome, Firefox, Safari, etc.)',
				},
				{
					name: 'pageviews',
					type: 'number',
					label: 'Pageviews',
					description: 'Total pageviews from this browser',
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Visitors',
					description: 'Unique visitors using this browser',
				},
				{
					name: 'percentage',
					type: 'number',
					label: 'Usage %',
					description: 'Percentage of total browser usage',
					unit: '%',
				},
			],
			default_visualization: 'pie',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
		table: Analytics.events,
		fields: [
			'browser_name as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["browser_name != ''", "event_name = 'screen_view'"],
		groupBy: ['browser_name'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
	},

	os_name: {
		meta: {
			title: 'Operating Systems',
			description:
				'Distribution of visitors by operating system (Windows, macOS, iOS, Android, etc.).',
			category: 'Technology',
			tags: ['operating systems', 'technology', 'devices', 'platforms'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'Operating System',
					description: 'The operating system name',
				},
				{
					name: 'pageviews',
					type: 'number',
					label: 'Pageviews',
					description: 'Total pageviews from this OS',
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Visitors',
					description: 'Unique visitors using this OS',
				},
				{
					name: 'percentage',
					type: 'number',
					label: 'Usage %',
					description: 'Percentage of total OS usage',
					unit: '%',
				},
			],
			default_visualization: 'pie',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
		table: Analytics.events,
		fields: [
			'os_name as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["os_name != ''", "event_name = 'screen_view'"],
		groupBy: ['os_name'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
	},

	screen_resolution: {
		meta: {
			title: 'Screen Resolutions',
			description:
				'Distribution of visitor screen resolutions to optimize design for the most common display sizes.',
			category: 'Technology',
			tags: ['screen resolution', 'display', 'design', 'responsive'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'Screen Resolution',
					description: 'Screen resolution (width x height)',
				},
				{
					name: 'pageviews',
					type: 'number',
					label: 'Pageviews',
					description: 'Total pageviews from this resolution',
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Visitors',
					description: 'Unique visitors with this resolution',
				},
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
		table: Analytics.events,
		fields: [
			'screen_resolution as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
		],
		where: ["screen_resolution != ''", "event_name = 'screen_view'"],
		groupBy: ['screen_resolution'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
	},

	connection_type: {
		meta: {
			title: 'Connection Types',
			description:
				'Distribution of visitors by internet connection type (WiFi, Cellular, etc.).',
			category: 'Technology',
			tags: ['connection', 'network', 'speed', 'performance'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'Connection Type',
					description: 'The type of internet connection',
				},
				{
					name: 'pageviews',
					type: 'number',
					label: 'Pageviews',
					description: 'Total pageviews from this connection type',
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Visitors',
					description: 'Unique visitors with this connection type',
				},
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
		table: Analytics.events,
		fields: [
			'connection_type as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
		],
		where: ["connection_type != ''", "event_name = 'screen_view'"],
		groupBy: ['connection_type'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
	},

	browsers_grouped: {
		meta: {
			title: 'Browser Versions',
			description:
				'Detailed breakdown of browser usage including specific version numbers for compatibility testing.',
			category: 'Technology',
			tags: ['browsers', 'versions', 'compatibility', 'testing'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'Browser + Version',
					description: 'Browser name and version combined',
				},
				{
					name: 'browser_name',
					type: 'string',
					label: 'Browser Name',
					description: 'The browser name only',
				},
				{
					name: 'browser_version',
					type: 'string',
					label: 'Browser Version',
					description: 'The browser version only',
				},
				{
					name: 'pageviews',
					type: 'number',
					label: 'Pageviews',
					description: 'Total pageviews from this browser version',
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Visitors',
					description: 'Unique visitors using this browser version',
				},
				{
					name: 'sessions',
					type: 'number',
					label: 'Sessions',
					description: 'Total sessions from this browser version',
				},
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
		table: Analytics.events,
		fields: [
			"CONCAT(browser_name, ' ', browser_version) as name",
			'browser_name',
			'browser_version',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'COUNT(DISTINCT session_id) as sessions',
		],
		where: [
			"browser_name != ''",
			"browser_version != ''",
			'browser_version IS NOT NULL',
			"event_name = 'screen_view'",
		],
		groupBy: ['browser_name', 'browser_version'],
		orderBy: 'visitors DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
	},

	device_types: {
		meta: {
			title: 'Device Categories',
			description:
				'Traffic breakdown by device category (Desktop, Mobile, Tablet) based on screen resolution analysis.',
			category: 'Technology',
			tags: ['device types', 'mobile', 'desktop', 'tablet', 'responsive'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'Screen Resolution',
					description: 'The actual screen resolution',
				},
				{
					name: 'pageviews',
					type: 'number',
					label: 'Pageviews',
					description: 'Total pageviews from this resolution',
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Visitors',
					description: 'Unique visitors with this resolution',
				},
				{
					name: 'device_type',
					type: 'string',
					label: 'Device Type',
					description: 'Inferred device category (Desktop/Mobile/Tablet)',
				},
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
		table: Analytics.events,
		fields: [
			'screen_resolution as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["screen_resolution != ''", "event_name = 'screen_view'"],
		groupBy: ['screen_resolution', 'device_type'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
		plugins: { mapDeviceTypes: true },
	},

	browsers: {
		table: Analytics.events,
		fields: [
			'browser_name as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["browser_name != ''", "event_name = 'screen_view'"],
		groupBy: ['browser_name'],
		orderBy: 'pageviews DESC',
		limit: 25,
		timeField: 'time',
		customizable: true,
	},

	browser_versions: {
		table: Analytics.events,
		fields: [
			"CONCAT(browser_name, ' ', browser_version) as name",
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
		],
		where: [
			"browser_name != ''",
			"browser_version != ''",
			"event_name = 'screen_view'",
		],
		groupBy: ['browser_name', 'browser_version'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
	},

	operating_systems: {
		table: Analytics.events,
		fields: [
			'os_name as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["os_name != ''", "event_name = 'screen_view'"],
		groupBy: ['os_name'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
	},

	os_versions: {
		table: Analytics.events,
		fields: [
			"CONCAT(os_name, ' ', os_version) as name",
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
		],
		where: ["os_name != ''", "os_version != ''", "event_name = 'screen_view'"],
		groupBy: ['os_name', 'os_version'],
		orderBy: 'pageviews DESC',
		limit: 25,
		timeField: 'time',
		customizable: true,
	},

	screen_resolutions: {
		table: Analytics.events,
		fields: [
			'screen_resolution as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
		],
		where: ["screen_resolution != ''", "event_name = 'screen_view'"],
		groupBy: ['screen_resolution'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
	},
};
