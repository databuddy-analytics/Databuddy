// Regex patterns for parsing query parameters
const NESTED_KEY_REGEX = /^([^[]+)(\[.*\])?$/;
const BRACKET_EXTRACT_REGEX = /\[([^\]]+)\]/g;
const INTEGER_REGEX = /^-?\d+$/;
const FLOAT_REGEX = /^-?\d*\.\d+$/;

// 1x1 transparent GIF pixel (base64)
const TRANSPARENT_PIXEL = Buffer.from(
	"R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
	"base64"
);

/**
 * Returns a 1x1 transparent GIF response
 */
export function createPixelResponse(status = 200): Response {
	const headers = {
		"Cache-Control": "no-cache, no-store, must-revalidate",
		Pragma: "no-cache",
		Expires: "0",
		...(status >= 500 ? { "Retry-After": "5" } : {}),
	};

	// Browsers report a decodable GIF as an image load even when its HTTP status
	// is 5xx. Return no image body for failures so pixel transport receives an
	// error event and retains the event for retry.
	if (status >= 400) {
		return new Response(null, { status, headers });
	}

	return new Response(TRANSPARENT_PIXEL, {
		status,
		headers: {
			"Content-Type": "image/gif",
			...headers,
		},
	});
}

/**
 * Parses string values to appropriate types
 */
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

/**
 * Converts pixel query parameters back into event data structure
 * Handles nested keys like "key[subkey]" and JSON-stringified properties
 */
export function parsePixelQuery(query: Record<string, string>): {
	eventData: Record<string, unknown>;
	eventType: string;
} {
	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(query)) {
		// Skip SDK metadata
		if (key === "sdk_name" || key === "sdk_version" || key === "client_id") {
			continue;
		}

		// Handle JSON-stringified properties
		if (key === "properties") {
			try {
				result.properties = JSON.parse(value);
			} catch {
				result.properties = {};
			}
			continue;
		}

		const match = key.match(NESTED_KEY_REGEX);
		if (!match) {
			result[key] = parseValue(value);
			continue;
		}

		const baseKey = match[1];
		const nestedPath = match[2];

		if (!nestedPath) {
			result[baseKey] = parseValue(value);
			continue;
		}

		// Extract nested keys from brackets
		const nestedKeys =
			nestedPath.match(BRACKET_EXTRACT_REGEX)?.map((k) => k.slice(1, -1)) || [];

		if (nestedKeys.length === 0) {
			result[baseKey] = parseValue(value);
			continue;
		}

		// Build nested structure
		if (!result[baseKey]) {
			result[baseKey] = {};
		}

		let current = result[baseKey] as Record<string, unknown>;
		const lastIndex = nestedKeys.length - 1;
		for (let i = 0; i < lastIndex; i++) {
			const nestedKey = nestedKeys[i];
			if (!current[nestedKey]) {
				current[nestedKey] = {};
			}
			current = current[nestedKey] as Record<string, unknown>;
		}
		current[nestedKeys[lastIndex]] = parseValue(value);
	}

	return {
		eventData: result,
		eventType: (result.type as string) || "track",
	};
}
