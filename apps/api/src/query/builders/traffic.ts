import { Analytics } from '../../types/tables';
import type { SimpleQueryConfig } from '../types';

export const TrafficBuilders: Record<string, SimpleQueryConfig> = {
	top_referrers: {
		meta: {
			title: 'Top Referrers',
			description:
				'Top external websites and domains that drive traffic to your site, excluding direct visits.',
			category: 'Acquisition',
			tags: ['referrers', 'traffic sources', 'external', 'backlinks'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'Referrer Domain',
					description: 'The referring domain or website',
				},
				{
					name: 'pageviews',
					type: 'number',
					label: 'Pageviews',
					description: 'Total pageviews from this referrer',
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Visitors',
					description: 'Unique visitors from this referrer',
				},
				{
					name: 'percentage',
					type: 'number',
					label: 'Traffic %',
					description: 'Percentage of total referral traffic',
					unit: '%',
				},
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
		table: Analytics.events,
		fields: [
			'CASE ' +
				"WHEN domain(referrer) LIKE '%.google.com%' OR domain(referrer) LIKE 'google.com%' THEN 'https://google.com' " +
				"WHEN domain(referrer) LIKE '%.facebook.com%' OR domain(referrer) LIKE 'facebook.com%' THEN 'https://facebook.com' " +
				"WHEN domain(referrer) LIKE '%.twitter.com%' OR domain(referrer) LIKE 'twitter.com%' OR domain(referrer) LIKE 't.co%' THEN 'https://twitter.com' " +
				"WHEN domain(referrer) LIKE '%.instagram.com%' OR domain(referrer) LIKE 'instagram.com%' OR domain(referrer) LIKE 'l.instagram.com%' THEN 'https://instagram.com' " +
				"ELSE concat('https://', domain(referrer)) " +
				'END as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: [
			"referrer != ''",
			'referrer IS NOT NULL',
			"event_name = 'screen_view'",
			"domain(referrer) != '{websiteDomain}'",
			"NOT domain(referrer) ILIKE '%.{websiteDomain}'",
			"domain(referrer) NOT IN ('localhost', '127.0.0.1')",
		],
		groupBy: ['name'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: [
			'path',
			'country',
			'device_type',
			'browser_name',
			'os_name',
			'referrer',
			'utm_source',
			'utm_medium',
			'utm_campaign',
		],
		customizable: true,
		plugins: { parseReferrers: true },
	},

	utm_sources: {
		meta: {
			title: 'UTM Sources',
			description:
				'Traffic breakdown by UTM source parameters from your marketing campaigns and tracked links.',
			category: 'Acquisition',
			tags: ['utm', 'campaigns', 'marketing', 'sources'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'UTM Source',
					description: 'The UTM source parameter value',
				},
				{
					name: 'pageviews',
					type: 'number',
					label: 'Pageviews',
					description: 'Total pageviews from this source',
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Visitors',
					description: 'Unique visitors from this source',
				},
				{
					name: 'percentage',
					type: 'number',
					label: 'Traffic %',
					description: 'Percentage of total UTM traffic',
					unit: '%',
				},
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
		table: Analytics.events,
		fields: [
			'utm_source as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["utm_source != ''", "event_name = 'screen_view'"],
		groupBy: ['utm_source'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: [
			'path',
			'country',
			'device_type',
			'browser_name',
			'os_name',
			'referrer',
			'utm_source',
			'utm_medium',
			'utm_campaign',
		],
		customizable: true,
	},

	utm_mediums: {
		table: Analytics.events,
		fields: [
			'utm_medium as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["utm_medium != ''", "event_name = 'screen_view'"],
		groupBy: ['utm_medium'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: [
			'path',
			'country',
			'device_type',
			'browser_name',
			'os_name',
			'referrer',
			'utm_source',
			'utm_medium',
			'utm_campaign',
		],
		customizable: true,
	},

	utm_campaigns: {
		meta: {
			title: 'UTM Campaigns',
			description:
				'Performance breakdown by UTM campaign parameters to track individual marketing campaign effectiveness.',
			category: 'Acquisition',
			tags: ['utm', 'campaigns', 'marketing', 'performance'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'Campaign Name',
					description: 'The UTM campaign parameter value',
				},
				{
					name: 'pageviews',
					type: 'number',
					label: 'Pageviews',
					description: 'Total pageviews from this campaign',
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Visitors',
					description: 'Unique visitors from this campaign',
				},
				{
					name: 'percentage',
					type: 'number',
					label: 'Traffic %',
					description: 'Percentage of total campaign traffic',
					unit: '%',
				},
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
		table: Analytics.events,
		fields: [
			'utm_campaign as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["utm_campaign != ''", "event_name = 'screen_view'"],
		groupBy: ['utm_campaign'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: [
			'path',
			'country',
			'device_type',
			'browser_name',
			'os_name',
			'referrer',
			'utm_source',
			'utm_medium',
			'utm_campaign',
		],
		customizable: true,
	},

	traffic_sources: {
		table: Analytics.events,
		fields: [
			'CASE ' +
				"WHEN referrer = '' OR referrer IS NULL THEN 'direct' " +
				"WHEN domain(referrer) LIKE '%.google.com%' OR domain(referrer) LIKE 'google.com%' THEN 'https://google.com' " +
				"WHEN domain(referrer) LIKE '%.facebook.com%' OR domain(referrer) LIKE 'facebook.com%' THEN 'https://facebook.com' " +
				"WHEN domain(referrer) LIKE '%.twitter.com%' OR domain(referrer) LIKE 'twitter.com%' OR domain(referrer) LIKE 't.co%' THEN 'https://twitter.com' " +
				"WHEN domain(referrer) LIKE '%.instagram.com%' OR domain(referrer) LIKE 'instagram.com%' OR domain(referrer) LIKE 'l.instagram.com%' THEN 'https://instagram.com' " +
				"ELSE concat('https://', domain(referrer)) " +
				'END as source',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
		],
		where: ["event_name = 'screen_view'"],
		groupBy: ['source'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
		plugins: { parseReferrers: true },
	},
};
