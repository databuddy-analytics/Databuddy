import type { BaseTracker } from "../core/tracker";
import type { HttpResult } from "../core/client";

const PIXEL_PATH = "/px.jpg";
const PIXEL_RETRY_AFTER_MS = 5000;

const PIXEL_TYPE_BY_ENDPOINT: Record<string, string> = {
	"/": "track",
	"/batch": "track",
	"/track": "track",
	"/outgoing": "outgoing_link",
	"/vitals": "web_vitals",
	"/errors": "error",
};

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

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

	const maxRetries =
		tracker.options.enableRetries === false
			? 0
			: (tracker.options.maxRetries ?? 3);
	const retryDelay = Math.max(
		0,
		tracker.options.initialRetryDelay ?? PIXEL_RETRY_AFTER_MS
	);

	const sendOnePixel = async (
		eventType: string,
		data: Record<string, unknown>,
		retryCount = 0
	): Promise<{ attempts: number; success: boolean }> => {
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

		const result = await new Promise<{ success: boolean }>((resolve) => {
			const img = new Image();
			img.onload = () => resolve({ success: true });
			img.onerror = () => resolve({ success: false });
			img.src = url.toString();
		});
		if (result.success || retryCount >= maxRetries) {
			return { attempts: retryCount + 1, success: result.success };
		}
		await wait(retryDelay);
		return sendOnePixel(eventType, data, retryCount + 1);
	};

	const sendToPixel = async (
		endpoint: string,
		data: unknown
	): Promise<{ attempts: number; success: boolean }> => {
		const eventType = PIXEL_TYPE_BY_ENDPOINT[endpoint];
		if (!eventType) {
			return { attempts: 0, success: false };
		}

		if (Array.isArray(data)) {
			const results = await Promise.all(
				data.map((event) =>
					event && typeof event === "object"
						? sendOnePixel(eventType, event as Record<string, unknown>)
						: Promise.resolve({ attempts: 0, success: false })
				)
			);
			return {
				attempts: Math.max(0, ...results.map((result) => result.attempts)),
				success: results.every((result) => result.success),
			};
		}

		if (typeof data !== "object" || data === null) {
			return { attempts: 0, success: false };
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
				attempts: result.attempts,
				transport: "beacon",
			};
		}
		return {
			ok: false,
			code: "NETWORK_ERROR",
			message: "Tracking pixel failed to load",
			status: null,
			retryable: true,
			attempts: result.attempts,
			transport: "fetch",
		};
	};

	tracker.sendBeacon = (data: unknown, endpoint = "/") => {
		sendToPixel(endpoint, data);
		return true;
	};

	tracker.sendBatchBeacon = () => false;
}
