/** Public demo dashboard id (embeddable routes under /demo/:id on the app host). */
export const DATABUDDY_DEMO_EMBED_ID = "OXmNQsViBT-FOS_wZCTHc";

const PREVIEW_DOCS_HOST = "preview.databuddy.cc";
const STAGING_APP_ORIGIN = "https://staging.databuddy.cc";
const PROD_APP_ORIGIN = "https://app.databuddy.cc";
const LOCAL_APP_ORIGIN = "http://localhost:3000";

function normalizeHostname(raw: string | null | undefined): string {
	if (!raw) {
		return "";
	}
	const first = raw.split(",")[0]?.trim() ?? "";
	const withoutPort = first.split(":")[0]?.trim() ?? "";
	return withoutPort.toLowerCase();
}

/** Host for routing (first entry of x-forwarded-host or host), no port. */
export function hostFromNextHeaders(headerList: Headers): string {
	const forwarded = headerList.get("x-forwarded-host");
	const host = forwarded ?? headerList.get("host") ?? "";
	return normalizeHostname(host);
}

/**
 * Base URL for the embedded demo iframe (no query).
 * - Local dev → localhost app
 * - Docs on preview.databuddy.cc → staging app (matches preview backend)
 * - Otherwise → production app
 */
export function getDemoEmbedBaseUrl(
	hostname: string | null | undefined
): string {
	const h = normalizeHostname(hostname ?? "");
	if (h === "localhost" || h === "127.0.0.1") {
		return `${LOCAL_APP_ORIGIN}/demo/${DATABUDDY_DEMO_EMBED_ID}`;
	}
	if (h === PREVIEW_DOCS_HOST) {
		return `${STAGING_APP_ORIGIN}/demo/${DATABUDDY_DEMO_EMBED_ID}`;
	}
	return `${PROD_APP_ORIGIN}/demo/${DATABUDDY_DEMO_EMBED_ID}`;
}
