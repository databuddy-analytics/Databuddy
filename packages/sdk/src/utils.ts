export type IsAny<T> = 0 extends 1 & NoInfer<T> ? true : false;
export type IsOptional<T> = IsAny<T> extends true
	? true
	: Extract<T, undefined> extends never
		? false
		: true;

/**
 * Auto-detect Databuddy client ID from environment variables
 * Supports Next.js, Nuxt, and other frameworks
 */
export function detectClientId(providedClientId?: string): string | undefined {
	if (providedClientId) {
		return providedClientId;
	}

	// Try to get from environment variables
	if (typeof process !== 'undefined' && process.env) {
		return (
			process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID ||
			process.env.NUXT_PUBLIC_DATABUDDY_CLIENT_ID ||
			process.env.VITE_DATABUDDY_CLIENT_ID ||
			process.env.REACT_APP_DATABUDDY_CLIENT_ID
		);
	}

	// Fallback for browser environments where process.env might not be available
	if (typeof window !== 'undefined') {
		// Next.js runtime config
		// @ts-expect-error - This might be injected by build tools
		const nextEnv = window.__NEXT_DATA__?.env?.NEXT_PUBLIC_DATABUDDY_CLIENT_ID;
		if (nextEnv) {
			return nextEnv;
		}

		// Nuxt runtime config
		// @ts-expect-error - This might be injected by build tools
		const nuxtEnv = window.__NUXT__?.env?.NUXT_PUBLIC_DATABUDDY_CLIENT_ID;
		if (nuxtEnv) {
			return nuxtEnv;
		}

		// Vite/other build tools might inject env vars differently
		// @ts-expect-error - This might be injected by build tools
		const viteEnv = window.__VITE_ENV__?.VITE_DATABUDDY_CLIENT_ID;
		if (viteEnv) {
			return viteEnv;
		}
	}

	return;
}
