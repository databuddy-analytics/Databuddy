const MAX_CANONICAL_EVENT_LENGTH = 64;
const MAX_CANONICAL_ROUTE_LENGTH = 120;
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d.+-]*:\/\//i;
const CANONICAL_EVENT_PATTERN = /^[a-z][a-z_]{0,63}$/;
const QUERY_OR_FRAGMENT_PATTERN = /[?#]/;
const STATIC_ROUTE_SEGMENT_PATTERN = /^[a-z\d][a-z\d_-]{0,47}$/i;
const DYNAMIC_ROUTE_SEGMENT_PATTERN =
	/^(?:\d+|[a-f\d]{16,}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i;
const TRAILING_SLASH_PATTERN = /\/+$/;

const SAFE_EVENT_SEGMENTS = new Set([
	"account",
	"activated",
	"application",
	"book",
	"booking",
	"button",
	"checkout",
	"click",
	"clicked",
	"complete",
	"completed",
	"confirmation",
	"contact",
	"created",
	"demo",
	"download",
	"form",
	"lead",
	"login",
	"logged",
	"order",
	"paid",
	"payment",
	"plan",
	"purchase",
	"purchased",
	"register",
	"registered",
	"registration",
	"request",
	"requested",
	"screen",
	"sign",
	"signed",
	"signup",
	"started",
	"submit",
	"submitted",
	"subscribe",
	"subscribed",
	"subscription",
	"success",
	"succeeded",
	"trial",
	"up",
	"upgrade",
	"user",
	"view",
	"welcome",
]);

const SAFE_ROUTE_SEGMENTS = new Set([
	"account",
	"accounts",
	"app",
	"auth",
	"billing",
	"book",
	"booking",
	"cart",
	"checkout",
	"complete",
	"confirmation",
	"contact",
	"demo",
	"home",
	"login",
	"onboarding",
	"order",
	"payment",
	"plans",
	"pricing",
	"purchase",
	"register",
	"registration",
	"settings",
	"sign-in",
	"sign-up",
	"signin",
	"signup",
	"shop",
	"store",
	"subscribe",
	"subscription",
	"success",
	"thank-you",
	"trial",
	"upgrade",
	"welcome",
]);

export function canonicalMeasurementEventTarget(value: string): string | null {
	return isCanonicalMeasurementEventTarget(value) &&
		value.split("_").every((segment) => SAFE_EVENT_SEGMENTS.has(segment))
		? value
		: null;
}

export function isCanonicalMeasurementEventTarget(value: string): boolean {
	return (
		value.length <= MAX_CANONICAL_EVENT_LENGTH &&
		CANONICAL_EVENT_PATTERN.test(value)
	);
}

export function canonicalMeasurementRouteTarget(value: string): string | null {
	const pathname = normalizeInspectedMeasurementRouteTarget(value);
	if (!pathname || pathname === "/") {
		return null;
	}
	const segments = pathname.split("/").filter(Boolean);
	if (segments.some((segment) => !SAFE_ROUTE_SEGMENTS.has(segment))) {
		return null;
	}
	return pathname;
}

export function normalizeInspectedMeasurementRouteTarget(
	value: string
): string | null {
	let pathname = value;
	if (ABSOLUTE_URL_PATTERN.test(value)) {
		try {
			pathname = new URL(value).pathname;
		} catch {
			return null;
		}
	}
	if (pathname !== "/") {
		pathname = pathname.replace(TRAILING_SLASH_PATTERN, "");
	}
	return isCanonicalMeasurementRouteTarget(pathname) ? pathname : null;
}

export function isCanonicalMeasurementRouteTarget(value: string): boolean {
	if (value === "/") {
		return true;
	}
	if (
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.endsWith("/") ||
		value.length > MAX_CANONICAL_ROUTE_LENGTH ||
		QUERY_OR_FRAGMENT_PATTERN.test(value)
	) {
		return false;
	}
	const segments = value.split("/").filter(Boolean);
	return (
		segments.length > 0 &&
		segments.every(
			(segment) =>
				STATIC_ROUTE_SEGMENT_PATTERN.test(segment) &&
				!DYNAMIC_ROUTE_SEGMENT_PATTERN.test(segment)
		)
	);
}
