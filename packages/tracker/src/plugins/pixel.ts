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
const MAX_PIXEL_RETRY_DELAY_MS = 30_000;

interface PixelDeliveryResult {
	attempts: number;
	success: boolean;
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
	let deliveryGeneration = 0;
	const cancelPendingRequests = tracker.api.cancelPendingRequests.bind(
		tracker.api
	);
	tracker.api.cancelPendingRequests = () => {
		deliveryGeneration += 1;
		cancelPendingRequests();
	};

	const maxRetries =
		tracker.options.enableRetries === false
			? 0
			: (tracker.options.maxRetries ?? 3);
	const initialRetryDelay = Math.max(
		0,
		tracker.options.initialRetryDelay ?? 500
	);

	const waitForRetry = (retry: number): Promise<void> =>
		new Promise((resolve) => {
			setTimeout(
				resolve,
				Math.min(initialRetryDelay * 2 ** retry, MAX_PIXEL_RETRY_DELAY_MS)
			);
		});

	const sendOnePixel = (
		eventType: string,
		data: Record<string, unknown>
	): Promise<PixelDeliveryResult> => {
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

		const generation = deliveryGeneration;
		const load = (): Promise<boolean> =>
			new Promise((resolve) => {
				const img = new Image();
				img.onload = () => resolve(true);
				img.onerror = () => resolve(false);
				img.src = url.toString();
			});

		return (async () => {
			for (let retry = 0; retry <= maxRetries; retry += 1) {
				if (generation !== deliveryGeneration) {
					return { attempts: retry, success: false };
				}
				if (await load()) {
					return { attempts: retry + 1, success: true };
				}
				if (retry < maxRetries && generation === deliveryGeneration) {
					await waitForRetry(retry);
				}
			}

			return { attempts: maxRetries + 1, success: false };
		})();
	};

	const sendToPixel = async (
		endpoint: string,
		data: unknown
	): Promise<PixelDeliveryResult> => {
		const eventType = PIXEL_TYPE_BY_ENDPOINT[endpoint];
		if (!eventType) {
			return { attempts: 1, success: false };
		}

		if (Array.isArray(data)) {
			const results = await Promise.all(
				data.map((event) =>
					event && typeof event === "object"
						? sendOnePixel(eventType, event as Record<string, unknown>)
						: Promise.resolve({ attempts: 1, success: false })
				)
			);
			return {
				attempts: Math.max(1, ...results.map((result) => result.attempts)),
				success: results.every((result) => result.success),
			};
		}

		if (typeof data !== "object" || data === null) {
			return { attempts: 1, success: false };
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

	// Image loads cannot synchronously prove remote acceptance. Returning false
	// keeps BaseTracker's queue for its fetch-style pixel fallback instead of
	// dropping it immediately on an unverified load.
	tracker.sendBeacon = () => false;

	tracker.sendBatchBeacon = () => false;
}
