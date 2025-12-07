import type {
	AnalyticsEvent,
	BlockedTraffic,
	CustomEventSpan,
	CustomEventsHourlyAggregate,
	CustomOutgoingLink,
	ErrorHourlyAggregate,
	ErrorSpanRow,
	UptimeMonitor,
	WebVitalsHourlyAggregate,
	WebVitalsSpan,
} from "@databuddy/db";

export const Analytics = {
	events: "analytics.events",
	error_spans: "analytics.error_spans",
	error_hourly: "analytics.error_hourly",
	web_vitals_spans: "analytics.web_vitals_spans",
	web_vitals_hourly: "analytics.web_vitals_hourly",
	custom_event_spans: "analytics.custom_event_spans",
	custom_events_hourly: "analytics.custom_events_hourly",
	blocked_traffic: "analytics.blocked_traffic",
	outgoing_links: "analytics.outgoing_links",
	uptime_monitor: "uptime.uptime_monitor",
} as const;

export type AnalyticsTable = (typeof Analytics)[keyof typeof Analytics];

export type TableFieldsMap = {
	"analytics.events": keyof AnalyticsEvent;
	"analytics.error_spans": keyof ErrorSpanRow;
	"analytics.error_hourly": keyof ErrorHourlyAggregate;
	"analytics.web_vitals_spans": keyof WebVitalsSpan;
	"analytics.web_vitals_hourly": keyof WebVitalsHourlyAggregate;
	"analytics.custom_event_spans": keyof CustomEventSpan;
	"analytics.custom_events_hourly": keyof CustomEventsHourlyAggregate;
	"analytics.blocked_traffic": keyof BlockedTraffic;
	"analytics.outgoing_links": keyof CustomOutgoingLink;
	"uptime.uptime_monitor": keyof UptimeMonitor;
};
