import {
	expect,
	type Page,
	type Request,
	test as base,
} from "@playwright/test";

const DEFAULT_REQUEST_BUDGET = 25;

export const test = base.extend<{ requestBudget: number }>({
	requestBudget: [DEFAULT_REQUEST_BUDGET, { option: true }],
	page: async ({ page, requestBudget }, use, testInfo) => {
		const callsByPath = new Map<string, number>();
		page.on("request", (request) => {
			const type = request.resourceType();
			if (type !== "fetch" && type !== "xhr") {
				return;
			}
			const { pathname } = new URL(request.url());
			callsByPath.set(pathname, (callsByPath.get(pathname) ?? 0) + 1);
		});

		await use(page);

		let total = 0;
		for (const count of callsByPath.values()) {
			total += count;
		}
		const breakdown =
			Array.from(callsByPath, ([path, count]) => `${path} x${count}`).join(
				", "
			) || "none";
		const summary = `[requests] ${total}/${requestBudget} — ${breakdown}`;
		console.log(summary);
		testInfo.annotations.push({ type: "requests", description: summary });
		expect(
			total,
			`SDK made ${total} API requests, budget is ${requestBudget} (${breakdown}). Raise it deliberately with test.use({ requestBudget: N }) if the traffic is expected.`
		).toBeLessThanOrEqual(requestBudget);
	},
});

export { expect } from "@playwright/test";

export function getFlagRequestBody(request: Request): Record<string, unknown> {
	const data = request.postData();
	if (!data) {
		return {};
	}
	try {
		const parsed = JSON.parse(data);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function getFlagRequestKeys(request: Request): string[] {
	const keys = getFlagRequestBody(request).keys;
	return Array.isArray(keys) ? keys.map(String).filter(Boolean) : [];
}

/** Standard mock flag response */
export const MOCK_FLAG_ENABLED = {
	enabled: true,
	value: true,
	payload: null,
	reason: "MATCH",
};

export const MOCK_FLAG_DISABLED = {
	enabled: false,
	value: false,
	payload: null,
	reason: "NO_MATCH",
};

export const MOCK_FLAG_VARIANT = {
	enabled: true,
	value: "treatment-a",
	payload: { color: "blue" },
	reason: "MATCH",
	variant: "treatment-a",
};

/**
 * Wait for the SDK bundle to load and expose `window.__SDK__`
 */
export async function waitForSDK(page: Page): Promise<void> {
	await page.waitForFunction(
		() => typeof window.__SDK__ !== "undefined",
		null,
		{
			timeout: 5000,
		}
	);
}
