/**
 * Server-side Autumn SDK — see:
 * https://docs.useautumn.com/documentation/getting-started/setup
 * https://docs.useautumn.com/documentation/modelling-pricing/spend-limits
 */
import { Autumn } from "autumn-js";

function createClient(): Autumn {
	const secretKey = process.env.AUTUMN_SECRET_KEY;
	if (!secretKey) {
		throw new Error("AUTUMN_SECRET_KEY is not set");
	}
	return new Autumn({ secretKey });
}

let instance: Autumn | null = null;

export function getAutumn(): Autumn {
	if (!instance) {
		instance = createClient();
	}
	return instance;
}
