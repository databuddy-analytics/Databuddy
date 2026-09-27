import { isSelfHosted, publicConfig } from "@databuddy/env/public";

export const APP_URL = publicConfig.urls.dashboard;

const STATUS_URL = publicConfig.urls.status;

export function getStatusPageUrl(slug: string): string | null {
	return isSelfHosted && !process.env.NEXT_PUBLIC_STATUS_URL?.trim()
		? null
		: `${STATUS_URL}/${slug}`;
}
