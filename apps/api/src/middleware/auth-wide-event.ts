import { AUTUMN_API_PREFIX } from "@/lib/autumn-mount";
import { applyAuthWideEvent } from "@/lib/auth-wide-event";

const AUTH_WIDE_EVENT_PUBLIC_PATHS = new Set(["/", "/health", "/spec.json"]);
const AUTH_WIDE_EVENT_PUBLIC_PREFIXES = [
	"/public/",
	"/webhooks/",
	"/.well-known/",
	AUTUMN_API_PREFIX,
] as const;

export async function enrichRequestAuthWideEvent(request: Request) {
	if (!shouldResolveAuthForWideEvent(request)) {
		return;
	}

	await applyAuthWideEvent(request.headers);
}

export function shouldResolveAuthForWideEvent(request: Request): boolean {
	if (request.method === "OPTIONS" || request.method === "HEAD") {
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
