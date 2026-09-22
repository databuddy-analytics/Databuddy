const NESTED_KEY_REGEX = /^([^[]+)(\[.*\])?$/;
const BRACKET_EXTRACT_REGEX = /\[([^\]]+)\]/g;
const INTEGER_REGEX = /^-?\d+$/;
const FLOAT_REGEX = /^-?\d*\.\d+$/;

const SKIPPED_KEYS = new Set(["sdk_name", "sdk_version", "client_id"]);
const UNSAFE_KEY_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

const TRANSPARENT_PIXEL = Buffer.from(
	"R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
	"base64"
);
export function createPixelResponse(
	options: { retryAfterSeconds?: number; status?: number } = {}
): Response {
	const headers = new Headers({
		"Content-Type": "image/gif",
		"Cache-Control": "no-cache, no-store, must-revalidate",
		Pragma: "no-cache",
		Expires: "0",
	});
	if (options.retryAfterSeconds !== undefined) {
		headers.set("Retry-After", String(options.retryAfterSeconds));
	}
	return new Response(TRANSPARENT_PIXEL, {
		status: options.status ?? 200,
		headers,
	});
}
function parseValue(value: string): string | number | boolean {
	if (INTEGER_REGEX.test(value)) {
		return Number.parseInt(value, 10);
	}
	if (FLOAT_REGEX.test(value)) {
		return Number.parseFloat(value);
	}
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	return value;
}
export function parsePixelQuery(query: Record<string, string>): {
	eventData: Record<string, unknown>;
	eventType: string;
} {
	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(query)) {
		if (SKIPPED_KEYS.has(key)) {
			continue;
		}

		if (key === "properties") {
			try {
				result.properties = JSON.parse(value);
			} catch {
				result.properties = {};
			}
			continue;
		}

		const match = key.match(NESTED_KEY_REGEX);
		const baseKey = match?.[1] ?? key;
		const nestedKeys =
			match?.[2]?.match(BRACKET_EXTRACT_REGEX)?.map((k) => k.slice(1, -1)) ??
			[];
		const path = [baseKey, ...nestedKeys];
		if (path.some((segment) => UNSAFE_KEY_SEGMENTS.has(segment))) {
			continue;
		}

		let current = result;
		for (const segment of path.slice(0, -1)) {
			const next = current[segment];
			if (!next || typeof next !== "object" || Array.isArray(next)) {
				current[segment] = {};
			}
			current = current[segment] as Record<string, unknown>;
		}
		current[path.at(-1) ?? baseKey] = parseValue(value);
	}

	return {
		eventData: result,
		eventType: (result.type as string) || "track",
	};
}
