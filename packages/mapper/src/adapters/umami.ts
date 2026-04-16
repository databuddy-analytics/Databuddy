import type { AnalyticsEvent } from "@databuddy/db/clickhouse/schema";
import { randomUUIDv7 } from "bun";
import type { ImportContext } from "../types";

export interface UmamiCsvRow {
	browser: string;
	city: string;
	country: string;
	created_at: string;
	device: string;
	distinct_id: string;
	event_id: string;
	event_name: string;
	event_type: string;
	fbclid: string;
	gclid: string;
	hostname: string;
	job_id: string;
	language: string;
	li_fat_id: string;
	msclkid: string;
	os: string;
	page_title: string;
	referrer_domain: string;
	referrer_path: string;
	referrer_query: string;
	region: string;
	screen: string;
	session_id: string;
	tag: string;
	ttclid: string;
	twclid: string;
	url_path: string;
	url_query: string;
	utm_campaign: string;
	utm_content: string;
	utm_medium: string;
	utm_source: string;
	utm_term: string;
	visit_id: string;
	website_id: string;
}

function formatBrowserName(browser: string): string {
	if (!browser) {
		return "";
	}
	return browser
		.replace(/-/g, " ")
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

export function mapUmamiRow(
	row: UmamiCsvRow,
	ctx: ImportContext
): AnalyticsEvent {
	return {
		id: randomUUIDv7(),
		client_id: ctx.clientId,
		event_name: ctx.isLastInSession(row.event_id) ? "page_exit" : "screen_view",
		anonymous_id: row.distinct_id || `anon_${randomUUIDv7()}`,
		time: new Date(row.created_at).getTime(),
		session_id: row.session_id || "",
		event_type: "track",
		event_id: row.event_id,
		referrer: row.referrer_domain?.trim() || "direct",
		url: row.url_path,
		path: row.url_path,
		title: row.page_title || "",
		ip: "",
		user_agent: "",
		browser_name: formatBrowserName(row.browser),
		os_name: row.os || "",
		device_type: row.device || "",
		country: row.country || "",
		region: row.region || "",
		city: row.city || "",
		screen_resolution: row.screen || "",
		language: row.language || "",
		page_count: 1,
		utm_source: row.utm_source || "",
		utm_medium: row.utm_medium || "",
		utm_campaign: row.utm_campaign || "",
		utm_term: row.utm_term || "",
		utm_content: row.utm_content || "",
		properties: "",
		created_at: new Date(row.created_at).getTime(),
	};
}
