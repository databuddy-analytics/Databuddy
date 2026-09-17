/**
 * Server-side Autumn SDK — see:
 * https://docs.useautumn.com/documentation/getting-started/setup
 * https://docs.useautumn.com/documentation/modelling-pricing/spend-limits
 */
import { Autumn, HTTPClient } from "autumn-js";
import { readBooleanEnv } from "@databuddy/env/app";

function createClient(strict = false): Autumn {
	const secretKey = process.env.AUTUMN_SECRET_KEY;
	if (!secretKey) {
		throw new Error("AUTUMN_SECRET_KEY is not set");
	}
	if (!strict) {
		return new Autumn({ secretKey, timeoutMs: 3000 });
	}
	const httpClient = new HTTPClient();
	httpClient.addHook("response", (response) => {
		if (response.status === 202) {
			throw new Error("Autumn returned an unconfirmed billing response");
		}
	});
	return new Autumn({
		secretKey,
		timeoutMs: 3000,
		httpClient,
		failOpen: false,
		retryConfig: { strategy: "none" },
	});
}

let instance: Autumn | null = null;
let strictInstance: Autumn | null = null;

export function getAutumn(options?: { strict?: boolean }): Autumn {
	if (readBooleanEnv("SELFHOST")) {
		throw new Error("Hosted billing is disabled for self-hosted instances");
	}
	if (options?.strict) {
		strictInstance ??= createClient(true);
		return strictInstance;
	}
	if (!instance) {
		instance = createClient();
	}
	return instance;
}
