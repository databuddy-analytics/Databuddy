import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	check: vi.fn(async () => ({
		allowed: true,
		balance: {
			granted: 10_000,
			nextResetAt: Date.UTC(2026, 7, 1),
			overageAllowed: false,
			remaining: 2000,
			usage: 8000,
		},
	})),
	inserted: [] as Record<string, unknown>[],
	log: {
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	},
	operations: [] as string[],
	ownedOrganizations: [] as Array<{
		organizationId: string;
		organization: {
			emailNotifications: { billing?: { usageWarnings?: boolean } };
			id: string;
			name: string;
		};
	}>,
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
				member: {
					findMany: vi.fn(async () => state.ownedOrganizations),
				},
			organization: { findFirst: vi.fn(async () => null) },
			user: { findFirst: vi.fn(async () => state.userRow) },
		},
	},
	eq: (field: unknown, value: unknown) => ({ field, op: "eq", value }),
	gt: (field: unknown, value: unknown) => ({ field, op: "gt", value }),
		normalizeEmailNotificationSettings: (raw?: {
			billing?: { usageWarnings?: boolean };
		}) => ({
			billing: { usageWarnings: raw?.billing?.usageWarnings ?? true },
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

vi.mock("@databuddy/rpc", () => ({
	getAutumn: () => ({ check: state.check }),
}));

vi.mock("@databuddy/services/billing-lifecycle", () => ({
	recordPlanChange: vi.fn(async () => undefined),
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

import { UsageAlertEmail, UsageLimitEmail } from "@databuddy/email";
import {
	handleLimitReached,
	handleUsageAlert,
	sendAlertEmail,
} from "./autumn";

beforeEach(() => {
	process.env.RESEND_API_KEY = "test-resend-key";
	state.inserted = [];
	state.operations = [];
	state.ownedOrganizations = [];
	state.recentRows = [];
	state.userRow = { email: "customer@example.com", name: "Customer" };
	state.send.mockClear();
	state.check.mockClear();
	state.check.mockResolvedValue({
		allowed: true,
		balance: {
			granted: 10_000,
			nextResetAt: Date.UTC(2026, 7, 1),
			overageAllowed: false,
			remaining: 2000,
			usage: 8000,
		},
	});
	vi.mocked(UsageAlertEmail).mockClear();
	vi.mocked(UsageLimitEmail).mockClear();
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
			recipient: { email: "member@example.com" },
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
			recipient: { email: "member@example.com" },
			subject: "Limit reached",
		});

		expect(result).toEqual({ success: true, message: "Email sent" });
		expect(state.operations).toEqual(["lock", "select", "send", "insert"]);
			expect(state.send).toHaveBeenCalledWith({
				from: "alerts@databuddy.cc",
				to: "member@example.com",
				subject: "Limit reached",
				html: "<html />",
				text: "<html />",
			});
		expect(state.inserted).toEqual([
			expect.objectContaining({
				alertType: "included",
					emailSentTo: "member@example.com",
				featureId: "events",
				userId: "user-1",
			}),
		]);
	});

	it("does not record a delivery when Resend rejects the email", async () => {
		state.send.mockResolvedValueOnce({
			data: null,
			error: { message: "provider unavailable" },
		});

		const result = await sendAlertEmail({
			alertType: "included",
			cooldownKey: "events",
			customerId: "user-1",
			react: { type: "email" } as never,
			recipient: { email: "member@example.com" },
			subject: "Limit reached",
		});

		expect(result).toEqual({
			success: false,
			message: "Alert email delivery failed",
		});
		expect(state.operations).toEqual(["lock", "select"]);
		expect(state.inserted).toEqual([]);
	});

	it("reports delivery unavailable when Resend is not configured", async () => {
		delete process.env.RESEND_API_KEY;

		const result = await sendAlertEmail({
			alertType: "included",
			cooldownKey: "events",
			customerId: "user-1",
			react: { type: "email" } as never,
			recipient: { email: "member@example.com" },
			subject: "Limit reached",
		});

		expect(result).toEqual({
			success: false,
			message: "Alert email delivery unavailable",
		});
		expect(state.send).not.toHaveBeenCalled();
	});
});

describe("Autumn usage emails", () => {
	beforeEach(() => {
		state.ownedOrganizations = [
			{
				organizationId: "org-1",
				organization: {
					emailNotifications: { billing: { usageWarnings: true } },
					id: "org-1",
					name: "Acme",
				},
			},
		];
	});

	it("uses live balance data and purpose-based Databunny wording", async () => {
		state.userRow = { email: "recipient@example.com", name: "Recipient" };
		state.check.mockResolvedValueOnce({
			allowed: true,
			balance: {
				granted: 350,
				nextResetAt: Date.UTC(2026, 7, 1),
				overageAllowed: false,
				remaining: 62,
				usage: 288,
			},
		});

		await handleUsageAlert({
			customer_id: "user-1",
			entity_id: "org-1",
			feature_id: "agent_credits",
			usage_alert: {
				name: "AI notice",
				threshold: 80,
				threshold_type: "usage_percentage",
			},
		});

		expect(UsageAlertEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				featureName: "Databunny usage",
				limitAmount: 350,
				organizationName: "Acme",
				remainingAmount: 62,
				usageAmount: 288,
				usageUnit: "allowance units",
			})
		);
		expect(UsageAlertEmail).not.toHaveBeenCalledWith(
			expect.objectContaining({ userName: expect.anything() })
		);
		expect(state.send).toHaveBeenCalledWith(
			expect.objectContaining({
				subject: "Databunny usage is at 82%",
				to: "recipient@example.com",
			})
		);
	});

	it("handles an actual hard limit and tells the template whether use is paused", async () => {
		state.check.mockResolvedValueOnce({
			allowed: false,
			balance: {
				granted: 350,
				nextResetAt: Date.UTC(2026, 7, 1),
				overageAllowed: false,
				remaining: 0,
				usage: 350,
			},
		});

		await handleLimitReached({
			customer_id: "user-1",
			entity_id: "org-1",
			feature_id: "agent_credits",
			limit_type: "spend_limit",
		});

		expect(UsageLimitEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				featureName: "Databunny usage",
				isAvailable: false,
				limitAmount: 350,
				limitType: "spend_limit",
				usageAmount: 350,
			})
		);
		expect(state.send).toHaveBeenCalledWith(
			expect.objectContaining({
				subject: "[Action required] Databunny usage is paused",
			})
		);
	});

	it("honors the resolved organization's billing email preference", async () => {
		state.ownedOrganizations[0]!.organization.emailNotifications = {
			billing: { usageWarnings: false },
		};

		const result = await handleLimitReached({
			customer_id: "user-1",
			entity_id: "org-1",
			feature_id: "events",
			limit_type: "included",
		});

		expect(result).toEqual({
			success: true,
			message: "Billing usage emails disabled",
		});
		expect(state.send).not.toHaveBeenCalled();
	});
});
