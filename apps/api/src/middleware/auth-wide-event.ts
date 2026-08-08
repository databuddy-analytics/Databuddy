import { isApiKeyPresent } from "@databuddy/api-keys/resolve";
import { AUTUMN_API_PREFIX } from "@/lib/autumn-mount";
import { applyAuthWideEvent } from "@/lib/auth-wide-event";
import { createApiKeyDependencyUnavailableResponse } from "./api-key-rate-limit";

const AUTH_WIDE_EVENT_PUBLIC_PATHS = new Set(["/", "/health", "/spec.json"]);
const AUTH_WIDE_EVENT_PUBLIC_PREFIXES = [
	"/public/",
	"/webhooks/",
	"/.well-known/",
	AUTUMN_API_PREFIX,
] as const;

export async function enrichRequestAuthWideEvent(
	request: Request,
	applyAuth: (headers: Headers) => Promise<void> = applyAuthWideEvent
): Promise<Response | undefined> {
	if (!shouldResolveAuthForWideEvent(request)) {
		return;
	}

	try {
		await applyAuth(request.headers);
	} catch (error) {
		if (!isApiKeyPresent(request.headers)) {
			throw error;
		}
		return createApiKeyDependencyUnavailableResponse(request);
	}
}

export function shouldResolveAuthForWideEvent(request: Request): boolean {
	if (request.method === "OPTIONS") {
		return false;
	}

	const pathname = getRequestPathname(request);
	if (AUTH_WIDE_EVENT_PUBLIC_PATHS.has(pathname)) {
		return false;
	}

	return !AUTH_WIDE_EVENT_PUBLIC_PREFIXES.some((prefix) =>
		pathname.startsWith(prefix)
	);
}

function getRequestPathname(request: Request): string {
	try {
		return new URL(request.url).pathname;
	} catch {
		return request.url;
	}
}
