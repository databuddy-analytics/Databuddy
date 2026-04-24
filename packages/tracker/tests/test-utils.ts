import type { Page, Request } from "@playwright/test";
import { test as base, expect as pwExpect } from "@playwright/test";

export const expect = pwExpect;

// Routes the real basket serves. Keep in sync with apps/basket/src/routes/.
const BASKET_ROUTES = new Set([
	"GET /px.jpg",
	"POST /",
	"POST /batch",
	"POST /vitals",
	"POST /errors",
	"POST /events",
	"POST /track",
	"POST /llm",
	"GET /health",
	"GET /health/status",
]);

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
	"Access-Control-Allow-Headers":
		"Content-Type, Authorization, X-Requested-With, databuddy-client-id, databuddy-sdk-name, databuddy-sdk-version",
};

// Auto-applied to every spec that imports `test` from this module. Tracks
// requests via `page.on("request")` so test-installed `page.route` mocks
// can't shadow the regression guard, then 200/404s by allowlist.
export const test = base.extend<{ basketGuard: undefined }>({
	basketGuard: [
		async ({ page }, use) => {
			const unknown: { method: string; path: string }[] = [];

			await page.addInitScript(() => {
				Object.defineProperty(navigator, "sendBeacon", { value: undefined });
			});

			page.on("request", (req) => {
				const url = req.url();
				if (!url.includes("basket.databuddy.cc")) {
					return;
				}
				const method = req.method();
				if (method === "OPTIONS") {
					return;
				}
				const path = new URL(url).pathname;
				if (!BASKET_ROUTES.has(`${method} ${path}`)) {
					unknown.push({ method, path });
				}
			});

			await page.route("**/basket.databuddy.cc/**", async (route) => {
				const req = route.request();
				const method = req.method();

				if (method === "OPTIONS") {
					await route.fulfill({ status: 204, headers: CORS_HEADERS });
					return;
				}

				const path = new URL(req.url()).pathname;
				const known = BASKET_ROUTES.has(`${method} ${path}`);
				await route.fulfill({
					status: known ? 200 : 404,
					contentType: "application/json",
					body: JSON.stringify(
						known
							? { success: true }
							: { error: "Unknown basket route", method, path }
					),
					headers: CORS_HEADERS,
				});
			});

			await use(undefined);

			if (unknown.length > 0) {
				const summary = unknown.map((r) => `${r.method} ${r.path}`).join(", ");
				throw new Error(
					`Tracker hit ${unknown.length} unknown basket route(s): ${summary}. ` +
						"Add to BASKET_ROUTES in tests/test-utils.ts if valid, or fix the tracker."
				);
			}
		},
		{ auto: true },
	],
});

export async function waitForDebugScrollHook(page: Page): Promise<void> {
	await expect
		.poll(async () =>
			page.evaluate(
				() =>
					typeof (
						window as unknown as { db?: { __getMaxScrollDepth?: () => number } }
					).db?.__getMaxScrollDepth === "function"
			)
		)
		.toBeTruthy();
}

export function readMaxScrollDepth(page: Page): Promise<number> {
	return page.evaluate(() =>
		(
			window as unknown as { db: { __getMaxScrollDepth: () => number } }
		).db.__getMaxScrollDepth()
	);
}

export function requestHasNamedEvent(req: Request, name: string): boolean {
	if (!req.url().includes("basket.databuddy.cc") || req.method() !== "POST") {
		return false;
	}
	const raw = req.postData();
	if (!raw) {
		return false;
	}
	try {
		const data = JSON.parse(raw) as unknown;
		const batch = Array.isArray(data) ? data : [data];
		return batch.some((e: { name?: string }) => e.name === name);
	} catch {
		return false;
	}
}

export function findEvent(
	req: Request,
	predicate: (event: Record<string, unknown>) => boolean
): Record<string, unknown> | undefined {
	if (!req.url().includes("basket.databuddy.cc")) {
		return;
	}
	try {
		const data = req.postDataJSON();
		if (Array.isArray(data)) {
			return data.find(predicate);
		}
		return predicate(data) ? data : undefined;
	} catch {
		return;
	}
}

export function hasEvent(
	req: Request,
	predicate: (event: Record<string, unknown>) => boolean
): boolean {
	return !!findEvent(req, predicate);
}

export function countEvents(
	req: Request,
	predicate: (event: Record<string, unknown>) => boolean
): number {
	if (!req.url().includes("basket.databuddy.cc")) {
		return 0;
	}
	try {
		const data = req.postDataJSON();
		if (Array.isArray(data)) {
			return data.filter(predicate).length;
		}
		return predicate(data) ? 1 : 0;
	} catch {
		return 0;
	}
}
