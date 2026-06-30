import { describe, expect, test } from "bun:test";
import {
	type SegmentUser,
	segmentRowsToCsv,
	segmentUsers,
} from "./user-email-segments";

const baseUser = {
	createdAt: "2026-01-01T00:00:00.000Z",
	emailVerified: true,
	firstName: null,
	name: "",
} satisfies Partial<SegmentUser>;

function user(input: Partial<SegmentUser> & Pick<SegmentUser, "email" | "id">) {
	return {
		...baseUser,
		billingCustomerIds: [input.id],
		organizationIds: [],
		...input,
	} satisfies SegmentUser;
}

describe("segmentUsers", () => {
	test("puts paid users in paying before activity segments", () => {
		const segments = segmentUsers(
			[
				user({
					email: "paying@example.com",
					id: "user-1",
					organizationIds: ["org-1"],
				}),
			],
			[{ id: "site-1", organizationId: "org-1" }],
			[{ eventsInWindow: 0, lastEventAt: null, websiteId: "site-1" }],
			new Map([["user-1", "pro"]]),
			{ minEvents: 1 }
		);

		expect(segments.paying).toHaveLength(1);
		expect(segments.active_websites).toHaveLength(0);
		expect(segments.paying[0]).toMatchObject({
			email: "paying@example.com",
			planIds: ["pro"],
			segment: "paying",
		});
	});

	test("splits free users by recent website activity and missing websites", () => {
		const segments = segmentUsers(
			[
				user({
					email: "active@example.com",
					id: "user-1",
					organizationIds: ["org-1"],
				}),
				user({
					email: "inactive@example.com",
					id: "user-2",
					organizationIds: ["org-2"],
				}),
				user({ email: "empty@example.com", id: "user-3" }),
			],
			[
				{ id: "site-1", organizationId: "org-1" },
				{ id: "site-2", organizationId: "org-2" },
			],
			[
				{
					eventsInWindow: 12,
					lastEventAt: "2026-01-02T00:00:00.000Z",
					websiteId: "site-1",
				},
			],
			new Map(),
			{ minEvents: 1 }
		);

		expect(segments.active_websites.map((row) => row.email)).toEqual([
			"active@example.com",
		]);
		expect(segments.inactive_websites.map((row) => row.email)).toEqual([
			"inactive@example.com",
		]);
		expect(segments.no_websites.map((row) => row.email)).toEqual([
			"empty@example.com",
		]);
	});
});

describe("segmentRowsToCsv", () => {
	test("escapes names and joins multi-value fields", () => {
		const csv = segmentRowsToCsv([
			{
				activeWebsiteCount: 1,
				billingCustomerIds: ["user-1", "owner-1"],
				createdAt: "2026-01-01T00:00:00.000Z",
				email: "test@example.com",
				eventsInWindow: 3,
				firstName: "Test",
				lastEventAt: "2026-01-02T00:00:00.000Z",
				name: 'Test "Comma, Person"',
				organizationCount: 1,
				planIds: ["pro"],
				segment: "paying",
				userId: "user-1",
				websiteCount: 1,
			},
		]);

		expect(csv).toContain('"Test ""Comma, Person"""');
		expect(csv).toContain("pro,user-1|owner-1");
	});
});
