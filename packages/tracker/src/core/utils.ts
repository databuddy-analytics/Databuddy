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

function parseConfigValue(
	value: string,
	emptyStringIsTrue = false
): boolean | number | string {
	if (value === "true" || (emptyStringIsTrue && value === "")) {
		return true;
	}
	if (value === "false") {
		return false;
	}
	return NUMBER_REGEX.test(value) ? Number(value) : value;
}

function parseJsonAttribute(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return [];
	}
}

export const generateUUIDv4 = () => {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	if (typeof crypto !== "undefined" && crypto.getRandomValues) {
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		// Set RFC 4122 version (4) and variant (10xx) bits
		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		bytes[8] = (bytes[8] & 0x3f) | 0x80;
		const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
			""
		);
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}
	throw new Error("No secure random source available for UUID generation");
};

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
	const config: TrackerOptions & Record<string, unknown> = {
		clientId: "",
		...globalConfig,
	};

	if (script) {
		for (const attr of script.attributes) {
			if (attr.name.startsWith("data-")) {
				const key = attr.name
					.slice(5)
					.replace(DATA_ATTR_REGEX, (x: string) => x[1].toUpperCase());
				config[key] =
					key === "skipPatterns" || key === "maskPatterns"
						? parseJsonAttribute(attr.value)
						: parseConfigValue(attr.value, true);
			}
		}

		try {
			const srcUrl = new URL(script.src);
			srcUrl.searchParams.forEach((value, key) => {
				config[key] = parseConfigValue(value);
			});
		} catch {
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
