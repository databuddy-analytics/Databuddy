/** biome-ignore-all lint/suspicious/noBitwiseOperators: We need it */
import type { TrackerOptions } from "./types";

declare const process: { env: { DATABUDDY_DEBUG: string | boolean } };

export const isDebugMode = () => Boolean(process.env.DATABUDDY_DEBUG);

export const isLocalhost = () => {
	if (typeof window === "undefined") {
		return false;
	}
	const hostname = window.location.hostname;
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "0.0.0.0" ||
		hostname.endsWith(".local")
	);
};

const DATA_ATTR_REGEX = /-./g;
const NUMBER_REGEX = /^\d+$/;

export const generateUUIDv4 = () => {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = Math.floor(Math.random() * 16);
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
};

export function toCamelCase(str: string): string {
	return str.replace(/([-_][a-z])/gi, (e) =>
		e.toUpperCase().replace("-", "").replace("_", "")
	);
}

export function isOptedOut(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	try {
		return (
			localStorage.getItem("databuddy_opt_out") === "true" ||
			localStorage.getItem("databuddy_disabled") === "true" ||
			window.databuddyOptedOut === true ||
			window.databuddyDisabled === true
		);
	} catch {
		return (
			window.databuddyOptedOut === true || window.databuddyDisabled === true
		);
	}
}

export function getTrackerConfig(): TrackerOptions {
	if (typeof window === "undefined") {
		return { clientId: "" };
	}
	let script = document.currentScript as HTMLScriptElement;

	if (!script) {
		const scripts = document.getElementsByTagName("script");
		for (const currentScript of scripts) {
			const src = currentScript.src;
			if (
				src &&
				(src.includes("/databuddy.js") || src.includes("/databuddy-debug.js"))
			) {
				script = currentScript;
				break;
			}
		}
	}

	const globalConfig = window.databuddyConfig || {};
	let config: TrackerOptions = { clientId: "", ...globalConfig };

	if (script) {
		const dataAttributes: Record<string, any> = {};
		for (const attr of script.attributes) {
			if (attr.name.startsWith("data-")) {
				const key = attr.name
					.slice(5)
					.replace(DATA_ATTR_REGEX, (x: string) => x[1].toUpperCase());
				let value: any = attr.value;

				if (key === "skipPatterns" || key === "maskPatterns") {
					try {
						value = JSON.parse(value);
					} catch (_e) {
						value = [];
					}
				} else if (value === "true" || value === "") {
					value = true;
				} else if (value === "false") {
					value = false;
				} else if (NUMBER_REGEX.test(value)) {
					value = Number(value);
				}

				dataAttributes[key] = value;
			}
		}
		config = { ...config, ...dataAttributes };

		try {
			const srcUrl = new URL(script.src);
			srcUrl.searchParams.forEach((value, key) => {
				if (value === "true") {
					(config as any)[key] = true;
				} else if (value === "false") {
					(config as any)[key] = false;
				} else if (NUMBER_REGEX.test(value)) {
					(config as any)[key] = Number(value);
				} else {
					(config as any)[key] = value;
				}
			});
		} catch (_e) {
			/* ignore */
		}
	}
	return config;
}

export const logger = {
	log: (...args: any[]) => {
		if (process.env.DATABUDDY_DEBUG) {
			console.log("[Databuddy]", ...args);
		}
	},
	error: (...args: any[]) => {
		if (process.env.DATABUDDY_DEBUG) {
			console.error("[Databuddy]", ...args);
		}
	},
	warn: (...args: any[]) => {
		if (process.env.DATABUDDY_DEBUG) {
			console.warn("[Databuddy]", ...args);
		}
	},
};
