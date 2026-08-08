import { publicConfig } from "@databuddy/env/public";
import {
	isHttpUrl,
	PUBLIC_LINK_SLUG_REGEX,
} from "@databuddy/shared/constants/links";

const linksUrl = new URL(publicConfig.urls.links);

export const LINKS_BASE_URL = linksUrl.host;

export function isPublicLinkSlug(slug: string): boolean {
	return PUBLIC_LINK_SLUG_REGEX.test(slug);
}

export function getPublicLinkUrl(slug: string): string {
	return new URL(`/${encodeURIComponent(slug)}`, linksUrl).toString();
}

export function getSafeHttpUrl(
	value: string | null | undefined
): string | null {
	if (!value) {
		return null;
	}
	return isHttpUrl(value) ? value : null;
}
