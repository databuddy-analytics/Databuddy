import type { BaseTracker } from "../core/tracker";
import type { HttpResult } from "../core/client";

const PIXEL_PATH = "/px.jpg";

const PIXEL_TYPE_BY_ENDPOINT: Record<string, string> = {
	"/": "track",
	"/batch": "track",
	"/track": "track",
	"/outgoing": "outgoing_link",
	"/vitals": "web_vitals",
	"/errors": "error",
};

function safeStringify(value: unknown): string {
	const seen = new WeakSet();
	return JSON.stringify(value, (_key, val) => {
		if (typeof val === "object" && val !== null) {
			if (seen.has(val)) {
				return "[Circular]";
			}
			seen.add(val);
		}
		return val;
	});
}

function flattenIntoParams(
	params: URLSearchParams,
	obj: Record<string, unknown>,
	prefix = ""
): void {
	for (const key in obj) {
		if (!Object.hasOwn(obj, key)) {
			continue;
		}
		const value = obj[key];
		if (value === null || value === undefined) {
			continue;
		}
		const newKey = prefix ? `${prefix}[${key}]` : key;
		if (typeof value === "object") {
			params.append(newKey, safeStringify(value));
		} else {
			params.append(newKey, String(value));
		}
	}
}

export function initPixelTracking(tracker: BaseTracker) {
	tracker.options.enableBatching = false;

	const sendOnePixel = (
		eventType: string,
		data: Record<string, unknown>
	): Promise<{ success: boolean }> => {
		const params = new URLSearchParams();
		flattenIntoParams(params, data);

		if (!params.has("type")) {
			params.set("type", eventType);
		}
		if (tracker.options.clientId && !params.has("client_id")) {
			params.set("client_id", tracker.options.clientId);
		}
		if (!params.has("sdk_name")) {
			params.set("sdk_name", tracker.options.sdk || "web");
		}
		if (!params.has("sdk_version")) {
			params.set("sdk_version", tracker.options.sdkVersion || "2.0.0");
		}

		const baseUrl = tracker.options.apiUrl || "https://basket.databuddy.cc";
		const url = new URL(PIXEL_PATH, baseUrl);
		params.forEach((value, key) => {
			url.searchParams.append(key, value);
		});

		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => resolve({ success: true });
			img.onerror = () => resolve({ success: false });
			img.src = url.toString();
		});
	};

	const sendToPixel = async (
		endpoint: string,
		data: unknown
	): Promise<{ success: boolean }> => {
		const eventType = PIXEL_TYPE_BY_ENDPOINT[endpoint];
		if (!eventType) {
			return { success: false };
		}

		if (Array.isArray(data)) {
			const results = await Promise.all(
				data.map((event) =>
					event && typeof event === "object"
						? sendOnePixel(eventType, event as Record<string, unknown>)
						: Promise.resolve({ success: false })
				)
			);
			return { success: results.every((r) => r.success) };
		}

		if (typeof data !== "object" || data === null) {
			return { success: false };
		}
		return sendOnePixel(eventType, data as Record<string, unknown>);
	};

	tracker.api.fetch = async <T>(
		endpoint: string,
		data: unknown
	): Promise<HttpResult<T>> => {
		const result = await sendToPixel(endpoint, data);
		if (result.success) {
			return {
				ok: true,
				data: null,
				status: null,
				attempts: 1,
				transport: "beacon",
			};
		}
		return {
			ok: false,
			code: "NETWORK_ERROR",
			message: "Tracking pixel failed to load",
			status: null,
			retryable: true,
			attempts: 1,
			transport: "fetch",
		};
	};

	tracker.sendBeacon = (data: unknown, endpoint = "/") => {
		sendToPixel(endpoint, data);
		return true;
	};

	tracker.sendBatchBeacon = () => false;
}
