import { config } from "@databuddy/env/app";

const DATABUDDY_HOST_RE = /(?:^|\.)databuddy\.cc$/;
const allowedApiOrigins = new Set(config.cors.apiOrigins);

export function isAllowedApiOrigin(request: Request): boolean {
	const origin = request.headers.get("Origin");
	if (!origin) {
		return false;
	}

	try {
		const url = new URL(origin);
		return (
			DATABUDDY_HOST_RE.test(url.hostname) || allowedApiOrigins.has(url.origin)
		);
	} catch {
		return false;
	}
}
