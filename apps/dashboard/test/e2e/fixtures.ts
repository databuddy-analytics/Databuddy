import {
	type APIRequestContext,
	type Page,
	type Route,
	test as base,
} from "@playwright/test";

export interface AnalyticsSeed {
	events: number;
	outgoingLinks: number;
	screenViews: number;
	screenViewsByCountry: Record<string, number>;
	screenViewsByPath: Record<string, number>;
	websiteId: string;
}

export interface E2ESession {
	email: string;
	name: string;
	organizationId: string;
	organizationName: string;
	userId: string;
	/** The seeded "E2E Website" (e2e.databuddy.local), or null for a fresh account. */
	websiteId: string | null;
}

type RpcReplyFn = (input: unknown) => unknown;

interface E2EFixtures {
	authenticatedPage: Page;
	e2eSession: E2ESession;
	/** Replace an oRPC procedure (e.g. "businessContext/get") with a value or a reply function. */
	mockRpc: (procedure: string, reply: unknown) => Promise<void>;
	/** Seeds ClickHouse for the session website. Only analytics tests pay for it. */
	seededAnalytics: AnalyticsSeed;
}

export const test = base.extend<E2EFixtures & { withWebsite: boolean }>({
	/** Set `test.use({ withWebsite: false })` for a fresh account with no website. */
	withWebsite: [true, { option: true }],
	e2eSession: async ({ page, withWebsite }, use, testInfo) => {
		await use(
			await bootstrapSession(page.context().request, {
				runScope: process.env.DATABUDDY_E2E_RUN_ID ?? "local",
				testScope: testScope(testInfo.title, testInfo.testId, testInfo.retry),
				withWebsite,
			})
		);
	},
	authenticatedPage: async ({ e2eSession: _session, page }, use) => {
		await use(page);
	},
	seededAnalytics: async ({ e2eSession, page }, use) => {
		if (!e2eSession.websiteId) {
			throw new Error("seededAnalytics needs the session website.");
		}
		const response = await page
			.context()
			.request.post("/api/test/e2e/clickhouse", {
				data: {
					eventCount: process.env.DATABUDDY_E2E_CLICKHOUSE_EVENTS ?? "250",
					websiteId: e2eSession.websiteId,
				},
				headers: { "x-e2e-test-key": testKey() },
			});
		if (!response.ok()) {
			throw new Error(
				`E2E ClickHouse seed failed with ${response.status()}: ${await response.text()}`
			);
		}
		await use((await response.json()) as AnalyticsSeed);
	},
	mockRpc: async ({ page }, use) => {
		await use(async (procedure, reply) => {
			await page.route(`**/rpc/${procedure}`, async (route) => {
				if (route.request().method() === "OPTIONS") {
					await route.fulfill({ status: 204, headers: corsHeaders(page) });
					return;
				}
				const json =
					typeof reply === "function"
						? await (reply as RpcReplyFn)(route.request().postDataJSON()?.json)
						: reply;
				await route.fulfill({ json: { json }, headers: corsHeaders(page) });
			});
		});
	},
});

export { expect } from "@playwright/test";

/** Reply for `websites/isTrackingSetup` that lifts the no-events setup gate. */
export const TRACKING_VERIFIED = {
	tracking_setup: true,
	integration_type: "manual",
	has_events: true,
	recent_events: 3,
	status_message: "Events are flowing.",
	tracking_issue: null,
};

function corsHeaders(page: Page): Record<string, string> {
	return {
		"access-control-allow-origin": new URL(page.url()).origin,
		"access-control-allow-credentials": "true",
		"access-control-allow-headers": "content-type,x-e2e-test-key",
		"access-control-allow-methods": "GET,POST,OPTIONS",
	};
}

/** Answer a route with a oRPC-shaped JSON body, including CORS for the API origin. */
export function fulfillRpc(
	page: Page,
	route: Route,
	json: unknown,
	status = 200
): Promise<void> {
	return route.fulfill({ status, json: { json }, headers: corsHeaders(page) });
}

export function testKey(): string {
	const key = process.env.DATABUDDY_E2E_TEST_KEY;
	if (!key) {
		throw new Error(
			"DATABUDDY_E2E_TEST_KEY is required. Run through test:e2e:local."
		);
	}
	return key;
}

function testScope(testTitle: string, testId: string, retry: number): string {
	const retrySuffix = retry > 0 ? `-retry-${retry.toString()}` : "";
	const suffix = `-${testId.slice(-8)}${retrySuffix}`;
	return `${testTitle
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-+|-+$/g, "")
		.slice(0, 48 - suffix.length)}${suffix}`;
}

async function bootstrapSession(
	request: APIRequestContext,
	body: { runScope: string; testScope: string; withWebsite: boolean }
): Promise<E2ESession> {
	const response = await request.post("/api/test/e2e/session", {
		data: body,
		headers: { "x-e2e-test-key": testKey() },
	});
	if (!response.ok()) {
		throw new Error(
			`E2E session bootstrap failed with ${response.status()}: ${await response.text()}`
		);
	}
	return (await response.json()) as E2ESession;
}
