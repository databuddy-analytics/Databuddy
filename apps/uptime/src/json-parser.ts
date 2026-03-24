/**
 * Auto-extracts status and latency from JSON health-check responses.
 *
 * Probe timings (total_ms / ttfb_ms) are always from the HTTP request;
 * this module only produces the `json_data` payload stored alongside them.
 */

const LATENCY_KEYS = [
	"latency",
	"latency_ms",
	"duration_ms",
	"duration",
	"response_time",
	"responseTime",
	"time_ms",
] as const;

export interface ServiceHealth {
	status?: string | number | boolean;
	latency?: number | string;
	[key: string]: unknown;
}

export type HealthSnapshot = Record<string, ServiceHealth>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return v != null && typeof v === "object" && !Array.isArray(v);
}

function findLatency(
	obj: Record<string, unknown>
): number | string | undefined {
	for (const key of LATENCY_KEYS) {
		if (key in obj) {
			const v = obj[key];
			if (typeof v === "number" || typeof v === "string") {
				return v;
			}
		}
	}
	return undefined;
}

function isHealthObject(obj: Record<string, unknown>): boolean {
	return "status" in obj || findLatency(obj) !== undefined;
}

function toHealthEntry(obj: Record<string, unknown>): ServiceHealth {
	const latency = findLatency(obj);
	return {
		...obj,
		...(obj.status === undefined
			? {}
			: { status: obj.status as string | number | boolean }),
		...(latency === undefined ? {} : { latency }),
	};
}

function walk(
	obj: Record<string, unknown>,
	path: string,
	out: HealthSnapshot
): void {
	for (const [key, value] of Object.entries(obj)) {
		const p = path ? `${path}.${key}` : key;

		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				const item = value[i];
				if (!isPlainObject(item)) {
					continue;
				}
				const itemPath = `${p}[${i}]`;
				if (isHealthObject(item)) {
					out[itemPath] = toHealthEntry(item);
				} else {
					walk(item, itemPath, out);
				}
			}
			continue;
		}

		if (isPlainObject(value)) {
			if (isHealthObject(value)) {
				out[p] = toHealthEntry(value);
			} else {
				walk(value, p, out);
			}
		}
	}
}

function toJsonObject(content: unknown): Record<string, unknown> | null {
	if (isPlainObject(content)) {
		return content;
	}
	if (typeof content !== "string") {
		return null;
	}
	const trimmed = content.trimStart();
	if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(content);
		if (isPlainObject(parsed)) {
			return parsed;
		}
		if (Array.isArray(parsed)) {
			return { _items: parsed };
		}
	} catch {
		return null;
	}
	return null;
}

/**
 * Extract health/latency signals from a JSON response body.
 *
 * Accepts a pre-parsed object or a raw JSON string.
 * Returns null when the input isn't JSON or contains no health signals.
 */
export function extractHealth(content: unknown): HealthSnapshot | null {
	const json = toJsonObject(content);
	if (!json) {
		return null;
	}

	const snapshot: HealthSnapshot = {};

	if (isHealthObject(json)) {
		snapshot._root = toHealthEntry(json);
	}

	walk(json, "", snapshot);

	return Object.keys(snapshot).length > 0 ? snapshot : null;
}

/**
 * Check whether a DB-stored jsonParsingConfig has health extraction enabled.
 * Handles legacy configs that may include extra fields (mode, fields, etc.).
 */
export function isHealthExtractionEnabled(config: unknown): boolean {
	if (!isPlainObject(config)) {
		return false;
	}
	return config.enabled === true;
}
