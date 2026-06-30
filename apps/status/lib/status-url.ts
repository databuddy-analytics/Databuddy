import { publicConfig } from "@databuddy/env/public";

export const STATUS_URL = publicConfig.urls.status;

export const DATABUDDY_URL = "https://www.databuddy.cc";
export const DATABUDDY_UPTIME_URL = `${DATABUDDY_URL}/uptime`;

export function getStatusPageUrl(slug: string): string {
	return `${STATUS_URL}/${slug}`;
}
