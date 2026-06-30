import { publicConfig } from "@databuddy/env/public";

export const APP_URL = publicConfig.urls.dashboard;

export const STATUS_URL = publicConfig.urls.status;

export function getStatusPageUrl(slug: string): string {
	return `${STATUS_URL}/${slug}`;
}
