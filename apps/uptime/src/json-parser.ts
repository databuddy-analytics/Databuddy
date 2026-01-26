/**
 * JSON parsing utilities for uptime monitoring
 * Handles parsing JSON responses and extracting configured fields
 */

export interface JsonParsingConfig {
	enabled: boolean;
	mode: "auto" | "manual";
	fields?: string[];
}

export interface ParsedJsonData {
	[key: string]: {
		status?: string | number | boolean;
		latency?: string | number;
		[key: string]: unknown;
	};
}

/**
 * Parse JSON content and extract configured fields
 * Accepts either a parsed JSON object (faster) or raw string content
 */
export function parseJsonResponse(
	contentOrJson: string | unknown,
	contentType: string | null,
	config: JsonParsingConfig | null
): ParsedJsonData | null {
	if (!config?.enabled) {
		return null;
	}

	if (typeof contentOrJson !== "string") {
		if (
			contentOrJson &&
			typeof contentOrJson === "object" &&
			!Array.isArray(contentOrJson)
		) {
			const json = contentOrJson as Record<string, unknown>;
			return extractFields(json, config);
		}
		return null;
	}

	const isJson =
		contentType?.includes("application/json") ||
		contentOrJson.trim().startsWith("{") ||
		contentOrJson.trim().startsWith("[");

	if (!isJson) {
		return null;
	}

	try {
		const json = JSON.parse(contentOrJson) as Record<string, unknown>;
		return extractFields(json, config);
	} catch {
		return null;
	}
}

/**
 * Extract fields based on config mode
 */
function extractFields(
	json: Record<string, unknown>,
	config: JsonParsingConfig
): ParsedJsonData | null {
	if (config.mode === "auto") {
		return extractAutoFields(json);
	}

	if (config.fields && config.fields.length > 0) {
		return extractManualFields(json, config.fields);
	}

	return null;
}

function extractAutoFields(
	json: Record<string, unknown>,
	path = ""
): ParsedJsonData {
	const result: ParsedJsonData = {};

	for (const [key, value] of Object.entries(json)) {
		const currentPath = path ? `${path}.${key}` : key;

		if (value && typeof value === "object" && !Array.isArray(value)) {
			const obj = value as Record<string, unknown>;

			if ("status" in obj || "latency" in obj) {
				result[currentPath] = {
					status: obj.status as string | number | boolean | undefined,
					latency: obj.latency as string | number | undefined,
					...obj,
				};
			} else {
				const nested = extractAutoFields(obj, currentPath);
				Object.assign(result, nested);
			}
		}
	}

	return result;
}

function extractManualFields(
	json: Record<string, unknown>,
	fields: string[]
): ParsedJsonData {
	const result: ParsedJsonData = {};

	for (const fieldPath of fields) {
		const value = getNestedValue(json, fieldPath);
		if (value && typeof value === "object" && !Array.isArray(value)) {
			result[fieldPath] = value as ParsedJsonData[string];
		}
	}

	return result;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	const keys = path.split(".");
	let current: unknown = obj;

	for (const key of keys) {
		if (
			current &&
			typeof current === "object" &&
			key in current &&
			!Array.isArray(current)
		) {
			current = (current as Record<string, unknown>)[key];
		} else {
			return undefined;
		}
	}

	return current;
}
