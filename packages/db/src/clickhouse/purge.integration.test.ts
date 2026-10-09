import { randomUUIDv7 } from "bun";
import { describe, expect, it } from "bun:test";
import { chQuery, clickHouse } from "./client";
import { listOwnersWithStoredData, purgeAnalyticsData } from "./purge";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true"
		? describe
		: describe.skip;

describeIntegration("revenue erasure against ClickHouse", () => {
	it("erases website and organization rows, keeps other tenants and transferred websites, and discovers revenue-only owners", async () => {
		const url = new URL(process.env.CLICKHOUSE_URL ?? "http://localhost:8123");
		if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
			throw new Error(
				"Revenue erasure tests require a local ClickHouse service."
			);
		}
		const suffix = randomUUIDv7();
		const websiteId = `erasure-website-${suffix}`;
		const organizationId = `erasure-organization-${suffix}`;
		const otherWebsiteId = `erasure-other-website-${suffix}`;
		const otherOrganizationId = `erasure-other-organization-${suffix}`;
		const transferredWebsiteId = `erasure-transferred-website-${suffix}`;
		const fixtures = [
			{ name: "website", owner_id: organizationId, website_id: websiteId },
			{ name: "legacy", owner_id: websiteId, website_id: null },
			{ name: "organization-null", owner_id: organizationId, website_id: null },
			{ name: "organization-empty", owner_id: organizationId, website_id: "" },
			{
				name: "other-tenant",
				owner_id: otherOrganizationId,
				website_id: otherWebsiteId,
			},
			{
				name: "transferred",
				owner_id: organizationId,
				website_id: transferredWebsiteId,
			},
		].map((fixture) => ({
			...fixture,
			transaction_id: `${fixture.name}-${suffix}`,
			amount: "10.0000",
			original_amount: "10.0000",
			original_currency: "USD",
			currency: "USD",
			provider: "stripe",
			type: "sale",
			status: "completed",
			created: "2024-01-01 12:00:00",
			synced_at: new Date().toISOString().slice(0, 19).replace("T", " "),
			customer_id: "customer-example",
			profile_id: "profile-example",
			anonymous_id: "anonymous-example",
			session_id: "session-example",
			metadata: JSON.stringify({ email: "synthetic@example.com" }),
		}));
		const transactions = fixtures.map((row) => row.transaction_id);
		const remaining = async () =>
			(
				await chQuery<{ transaction_id: string }>(
					"SELECT transaction_id FROM analytics.revenue WHERE transaction_id IN {transactions:Array(String)} ORDER BY transaction_id",
					{ transactions }
				)
			).map((row) => row.transaction_id);
		const waitForRemaining = async (
			expected: string[],
			retries = 200
		): Promise<void> => {
			const actual = await remaining();
			if (JSON.stringify(actual) === JSON.stringify(expected)) {
				return;
			}
			if (retries === 0) {
				expect(actual).toEqual(expected);
				return;
			}
			await Bun.sleep(100);
			return waitForRemaining(expected, retries - 1);
		};
		try {
			await clickHouse.insert({
				table: "analytics.revenue",
				format: "JSONEachRow",
				values: fixtures.map(({ name: _name, ...row }) => row),
			});
			const owners = await listOwnersWithStoredData();
			expect(owners).toContainEqual({ id: websiteId, recent: 1 });
			expect(owners).toContainEqual({ id: organizationId, recent: 1 });
			await purgeAnalyticsData([websiteId]);
			await waitForRemaining(
				fixtures
					.filter((row) => row.name !== "website" && row.name !== "legacy")
					.map((row) => row.transaction_id)
					.sort()
			);
			await purgeAnalyticsData([organizationId]);
			await waitForRemaining([
				`other-tenant-${suffix}`,
				`transferred-${suffix}`,
			]);
		} finally {
			await purgeAnalyticsData([
				websiteId,
				organizationId,
				otherWebsiteId,
				otherOrganizationId,
				transferredWebsiteId,
			]);
		}
	}, 30_000);
});
