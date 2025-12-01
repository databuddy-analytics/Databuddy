import type { BaseTracker } from "../core/tracker";

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

export function initPixelTracking(tracker: BaseTracker) {
	tracker.options.enableBatching = false;

	const sendToPixel = (endpoint: string, data: unknown): Promise<{ success: boolean }> => {
		const params = new URLSearchParams();

		const flatten = (obj: Record<string, unknown>, prefix = "") => {
			for (const key in obj) {
				if (Object.hasOwn(obj, key)) {
					const value = obj[key];
					const newKey = prefix ? `${prefix}[${key}]` : key;

					if (value === null || value === undefined) {
						continue;
					}

					if (typeof value === "object" && value !== null) {
						if (prefix === "" && key === "properties") {
							params.append(key, safeStringify(value));
						} else {
							params.append(newKey, safeStringify(value));
						}
					} else {
						params.append(newKey, String(value));
					}
				}
			}
		};

		if (typeof data === "object" && data !== null) {
			flatten(data as Record<string, unknown>);
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
		const url = new URL(endpoint === "/" ? "/px.jpg" : endpoint, baseUrl);

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

	tracker.api.fetch = <T>(endpoint: string, data: unknown): Promise<T | null> =>
		sendToPixel(endpoint, data) as Promise<T | null>;

	tracker.sendBeacon = (data: unknown, endpoint = "/") => {
		sendToPixel(endpoint, data);
		return true;
	};

	tracker.sendBatchBeacon = () => false;
}
