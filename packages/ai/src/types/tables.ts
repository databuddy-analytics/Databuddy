import type {
	BlockedTrafficRow,
	CustomEventsRow,
	ErrorSpansRow,
	EventsRow,
	OutgoingLinksRow,
	RevenueRow,
	UptimeMonitorRow,
	WebVitalsHourlyRow,
	WebVitalsSpansRow,
} from "@databuddy/db/clickhouse/tables";

export const Analytics = {
	events: "analytics.events",
	error_spans: "analytics.error_spans",
	web_vitals_spans: "analytics.web_vitals_spans",
	web_vitals_hourly: "analytics.web_vitals_hourly",
	custom_events: "analytics.custom_events",
	blocked_traffic: "analytics.blocked_traffic",
	outgoing_links: "analytics.outgoing_links",
	link_visits: "analytics.link_visits",
	uptime_monitor: "uptime.uptime_monitor",
	revenue: "analytics.revenue",
} as const;

export type AnalyticsTable = (typeof Analytics)[keyof typeof Analytics];

export interface TableFieldsMap {
	"analytics.blocked_traffic": keyof BlockedTrafficRow;
	"analytics.custom_events": keyof CustomEventsRow;
	"analytics.error_spans": keyof ErrorSpansRow;
	"analytics.events": keyof EventsRow;
	"analytics.outgoing_links": keyof OutgoingLinksRow;
	"analytics.revenue": keyof RevenueRow;
	"analytics.web_vitals_hourly": keyof WebVitalsHourlyRow;
	"analytics.web_vitals_spans": keyof WebVitalsSpansRow;
	"uptime.uptime_monitor": keyof UptimeMonitorRow;
}
