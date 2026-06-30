import { readBooleanEnv } from "@databuddy/env/boolean";
import { test as base } from "@playwright/test";

interface E2EAnalyticsSeed {
	events: number;
	outgoingLinks: number;
	screenViews: number;
	screenViewsByCountry: Record<string, number>;
	screenViewsByPath: Record<string, number>;
	seeded: true;
	websiteId: string;
}

interface E2ESession {
	analyticsSeed: E2EAnalyticsSeed | null;
	email: string;
	name: string;
	organizationId: string;
	organizationName: string;
	userId: string;
	websiteId: string | null;
}

interface E2EFixtures {
	authenticatedPage: import("@playwright/test").Page;
	e2eSession: E2ESession;
}

function e2eTestKey(): string {
	const key = process.env.DATABUDDY_E2E_TEST_KEY;
	if (!key) {
		throw new Error(
			"DATABUDDY_E2E_TEST_KEY is required. Run through test:e2e:local."
		);
	}
	return key;
}

function testScope(testTitle: string, retry: number): string {
	const retrySuffix = retry > 0 ? `-retry-${retry.toString()}` : "";
	const maxTitleLength = 48 - retrySuffix.length;
	return `${testTitle
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-+|-+$/g, "")
		.slice(0, maxTitleLength)}${retrySuffix}`;
}

async function seedClickHouse(
	request: import("@playwright/test").APIRequestContext,
	websiteId: string
): Promise<E2EAnalyticsSeed | null> {
	if (!readBooleanEnv("DATABUDDY_E2E_SEED_CLICKHOUSE")) {
		return null;
	}

	const response = await request.post("/api/test/e2e/clickhouse", {
		data: {
			eventCount: process.env.DATABUDDY_E2E_CLICKHOUSE_EVENTS ?? "250",
			websiteId,
		},
		headers: { "x-e2e-test-key": e2eTestKey() },
	});

	if (!response.ok()) {
		throw new Error(
			`E2E ClickHouse seed failed with ${response.status()}: ${await response.text()}`
		);
	}

	return (await response.json()) as E2EAnalyticsSeed;
}

export const test = base.extend<E2EFixtures>({
	e2eSession: async ({ page }, use, testInfo) => {
		const response = await page
			.context()
			.request.post("/api/test/e2e/session", {
				data: {
					runScope: process.env.DATABUDDY_E2E_RUN_ID ?? "local",
					testScope: testScope(testInfo.title, testInfo.retry),
					withWebsite: true,
				},
				headers: { "x-e2e-test-key": e2eTestKey() },
			});

		if (!response.ok()) {
			throw new Error(
				`E2E session bootstrap failed with ${response.status()}: ${await response.text()}`
			);
		}
		const session = (await response.json()) as Omit<
			E2ESession,
			"analyticsSeed"
		>;
		const analyticsSeed = session.websiteId
			? await seedClickHouse(page.context().request, session.websiteId)
			: null;
		await use({ ...session, analyticsSeed });
	},
	authenticatedPage: async ({ e2eSession: _session, page }, use) => {
		await use(page);
	},
});

export { expect } from "@playwright/test";
