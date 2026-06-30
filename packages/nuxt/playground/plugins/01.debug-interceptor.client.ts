// Reads events captured by the inline <head> script (see nuxt.config.ts)
// and syncs them into reactive Nuxt state so DebugPanel re-renders in real time.
//
// Why polling instead of a callback?
//   The inline script runs in a plain IIFE with no reference to Vue or Nuxt.
//   A 100ms setInterval is invisible to users and avoids wiring cross-context
//   event emitters.

import { defineNuxtPlugin, useState } from "#app";

interface RawEvent {
	name: string;
	properties: Record<string, unknown>;
	time: string;
}

interface DbDebug {
	events: RawEvent[];
	globals: Record<string, unknown>;
}

declare global {
	interface Window {
		__dbDebug?: DbDebug;
	}
}

export default defineNuxtPlugin((nuxtApp) => {
	const events = useState<RawEvent[]>("db-debug-events", () => []);
	const globals = useState<Record<string, unknown>>(
		"db-debug-globals",
		() => ({})
	);

	let seenCount = 0;

	const interval = setInterval(() => {
		const debug = window.__dbDebug;
		if (!debug) {
			return;
		}

		// Sync global properties whenever they change
		if (Object.keys(debug.globals).length > 0) {
			globals.value = { ...debug.globals };
		}

		// If the external clear() reset the array, reset our counter too so new
		// events are not silently dropped after a clear.
		if (debug.events.length < seenCount) {
			seenCount = 0;
		}

		// Sync new events (the inline script prepends them, so we track by length)
		if (debug.events.length > seenCount) {
			const fresh = debug.events.slice(0, debug.events.length - seenCount);
			events.value = [...fresh, ...events.value];
			seenCount = debug.events.length;
		}
	}, 100);

	// Web vitals are sent via a separate /vitals HTTP request, not through
	// window.db.track, so we intercept them at the fetch level instead.
	const originalFetch = window.fetch;
	window.fetch = function (...args: Parameters<typeof fetch>) {
		const input = args[0];
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: input instanceof Request
						? input.url
						: "";

		if (url.includes("basket.databuddy.cc/vitals")) {
			try {
				const init = args[1];
				const body =
					typeof init?.body === "string" ? JSON.parse(init.body) : {};
				window.__dbDebug?.events.unshift({
					name: "web_vitals",
					properties: body as Record<string, unknown>,
					time: new Date().toLocaleTimeString("en", { hour12: false }),
				});
			} catch {
				// Ignore malformed debug payloads; the real network request still runs.
			}
		}

		return originalFetch.apply(this, args);
	};

	nuxtApp.hook("app:unmount", () => {
		clearInterval(interval);
		window.fetch = originalFetch;
	});
});
