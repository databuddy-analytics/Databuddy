import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	inserted: [] as Record<string, unknown>[],
	log: {
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	},
	operations: [] as string[],
	recentRows: [] as Array<{ id: string }>,
	send: vi.fn(async () => ({ data: { id: "email-1" }, error: null })),
	userRow: { email: "customer@example.com", name: "Customer" } as {
		email: string | null;
		name: string | null;
	} | null,
}));

vi.mock("@databuddy/db", () => ({
	and: (...conditions: unknown[]) => ({ conditions }),
	db: {
		query: {
			member: { findMany: vi.fn(async () => []) },
			organization: { findFirst: vi.fn(async () => null) },
			user: { findFirst: vi.fn(async () => state.userRow) },
		},
	},
	eq: (field: unknown, value: unknown) => ({ field, op: "eq", value }),
	gt: (field: unknown, value: unknown) => ({ field, op: "gt", value }),
	normalizeEmailNotificationSettings: () => ({
		billing: { usageWarnings: true },
	}),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
		strings: Array.from(strings),
		values,
	}),
	withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
		fn({
			execute: vi.fn(async () => {
				state.operations.push("lock");
			}),
			insert: vi.fn(() => ({
				values: vi.fn(async (value: Record<string, unknown>) => {
					state.operations.push("insert");
					state.inserted.push(value);
				}),
			})),
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						limit: vi.fn(async () => {
							state.operations.push("select");
							return state.recentRows;
						}),
					})),
				})),
			})),
		})
	),
}));

vi.mock("@databuddy/db/schema", () => ({
	usageAlertLog: {
		alertType: "alertType",
		createdAt: "createdAt",
		emailSentTo: "emailSentTo",
		featureId: "featureId",
		id: "id",
		userId: "userId",
	},
}));

vi.mock("@databuddy/email", () => ({
	render: vi.fn(async () => "<html />"),
	UsageAlertEmail: vi.fn(() => ({ type: "usage" })),
	UsageLimitEmail: vi.fn(() => ({ type: "limit" })),
}));

vi.mock("@databuddy/env/app", () => ({
	config: { email: { alertsFrom: "alerts@databuddy.cc" } },
}));

vi.mock("@databuddy/notifications", () => ({
	SlackProvider: class {
		send = vi.fn(async () => undefined);
	},
}));

vi.mock("@databuddy/redis", () => ({
	cacheable: (fn: (...args: unknown[]) => unknown) => fn,
	invalidateAgentContextSnapshotsForOwner: vi.fn(async () => 0),
	invalidateBillingOwnerCaches: vi.fn(async () => ({ attempted: 0, failed: 0 })),
}));

vi.mock("elysia", () => ({
	Elysia: class {
		post() {
			return this;
		}
	},
}));

vi.mock("evlog/elysia", () => ({
	useLogger: () => state.log,
}));

vi.mock("resend", () => ({
	Resend: class {
		emails = { send: state.send };
	},
}));

vi.mock("svix", () => ({
	Webhook: class {
		verify() {
			return {};
		}
	},
}));

vi.mock("../../lib/tracing", () => ({
	mergeWideEvent: vi.fn(),
}));

import { sendAlertEmail } from "./autumn";

beforeEach(() => {
	state.inserted = [];
	state.operations = [];
	state.recentRows = [];
	state.userRow = { email: "customer@example.com", name: "Customer" };
	state.send.mockClear();
	state.send.mockImplementation(async () => {
		state.operations.push("send");
		return { data: { id: "email-1" }, error: null };
	});
	state.log.error.mockClear();
	state.log.info.mockClear();
	state.log.warn.mockClear();
});

describe("sendAlertEmail", () => {
	it("checks cooldown under the advisory lock and skips duplicate emails", async () => {
		state.recentRows = [{ id: "existing-log" }];

		const result = await sendAlertEmail({
			alertType: "included",
			cooldownKey: "events",
			customerId: "user-1",
			react: { type: "email" } as never,
			subject: "Limit reached",
		});

		expect(result).toEqual({ success: true, message: "Already sent recently" });
		expect(state.operations).toEqual(["lock", "select"]);
		expect(state.send).not.toHaveBeenCalled();
		expect(state.inserted).toEqual([]);
	});

	it("sends and records the alert inside the locked cooldown section", async () => {
		const result = await sendAlertEmail({
			alertType: "included",
			cooldownKey: "events",
			customerId: "user-1",
			react: { type: "email" } as never,
			subject: "Limit reached",
		});

		expect(result).toEqual({ success: true, message: "Email sent" });
		expect(state.operations).toEqual(["lock", "select", "send", "insert"]);
		expect(state.send).toHaveBeenCalledWith({
			from: "alerts@databuddy.cc",
			to: "customer@example.com",
			subject: "Limit reached",
			html: "<html />",
		});
		expect(state.inserted).toEqual([
			expect.objectContaining({
				alertType: "included",
				emailSentTo: "customer@example.com",
				featureId: "events",
				userId: "user-1",
			}),
		]);
	});
});
