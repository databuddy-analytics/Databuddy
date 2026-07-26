import { createHash } from "node:crypto";
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
	cooldownConditions: [] as unknown[],
	inserted: [] as Record<string, unknown>[],
	insertFailure: null as Error | null,
	log: {
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	},
	operations: [] as string[],
	locks: [] as string[],
	ownedOrganizations: [] as Array<{
		organizationId: string;
		organization: {
			emailNotifications: { billing?: { usageWarnings?: boolean } };
			id: string;
			name: string;
		};
	}>,
	recentRows: [] as Array<{ id: string }>,
	storeFailure: null as Error | null,
	storedWebhooks: new Map<
		string,
		{
			attempts: number;
			claimToken: string | null;
			id: string;
			payload: Record<string, unknown>;
			status:
				| "pending"
				| "processing"
				| "deferred"
				| "completed"
				| "dead_letter";
			type: string;
		}
	>(),
	send: vi.fn(async () => ({ data: { id: "email-1" }, error: null })),
	userRow: { email: "customer@example.com", name: "Customer" } as {
		email: string | null;
		name: string | null;
	} | null,
}));

vi.mock("./autumn-inbox", () => ({
	claimAutumnWebhook: vi.fn(async ({ id }: { id: string }) => {
		const stored = state.storedWebhooks.get(id);
		if (!(stored && ["pending", "deferred"].includes(stored.status))) {
			return null;
		}
		stored.attempts += 1;
		stored.claimToken = `claim-${stored.attempts}`;
		stored.status = "processing";
		return {
			...stored,
			claimToken: stored.claimToken,
		};
	}),
	deadLetterExhaustedAutumnWebhooks: vi.fn(async () => 0),
	getAutumnWebhook: vi.fn(async (id: string) => state.storedWebhooks.get(id) ?? null),
	listReplayableAutumnWebhookIds: vi.fn(async () =>
		[...state.storedWebhooks.values()]
			.filter((row) => ["pending", "deferred"].includes(row.status))
			.map((row) => row.id)
	),
	recordAutumnWebhookAttempt: vi.fn(
		async (input: {
			attempts: number;
			claimToken: string;
			errorMessage?: string;
			id: string;
			status: "pending" | "deferred" | "completed";
		}) => {
			const stored = state.storedWebhooks.get(input.id);
			if (!stored) {
				throw new Error("missing stored webhook");
			}
			if (stored.status === "completed") {
				return stored.status;
			}
			if (input.status === "completed") {
				stored.status = "completed";
				stored.claimToken = null;
				return stored.status;
			}
			stored.status = input.attempts >= 12 ? "dead_letter" : input.status;
			stored.claimToken = null;
			return stored.status;
		}
	),
	storeAutumnWebhook: vi.fn(
		async (input: {
			id: string;
			payload: Record<string, unknown>;
			type: string;
		}) => {
			if (state.storeFailure) {
				throw state.storeFailure;
			}
			const existing = state.storedWebhooks.get(input.id);
			if (existing) {
				return existing;
			}
			const stored = {
				...input,
				attempts: 0,
				claimToken: null,
				status: "pending" as const,
			};
			state.storedWebhooks.set(input.id, stored);
			return stored;
		}
	),
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
	isNull: (field: unknown) => ({ field, op: "isNull" }),
		normalizeEmailNotificationSettings: (raw?: {
			billing?: { usageWarnings?: boolean };
		}) => ({
			billing: { usageWarnings: raw?.billing?.usageWarnings ?? true },
		}),
	or: (...conditions: unknown[]) => ({ conditions, op: "or" }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
		strings: Array.from(strings),
		values,
	}),
	withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
		fn({
			execute: vi.fn(async (query: unknown) => {
				state.operations.push("lock");
				const values = (query as { values?: unknown[] }).values;
				state.locks.push(String(values?.[0] ?? ""));
			}),
			insert: vi.fn(() => ({
				values: vi.fn(async (value: Record<string, unknown>) => {
					if (state.insertFailure) {
						throw state.insertFailure;
					}
					state.operations.push("insert");
					state.inserted.push(value);
				}),
			})),
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					where: vi.fn((condition: unknown) => {
						state.cooldownConditions.push(condition);
						return {
						limit: vi.fn(async () => {
							state.operations.push("select");
							return state.recentRows;
						}),
						};
					}),
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
		organizationId: "organizationId",
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
	handleVerifiedAutumnEvent,
	handleLimitReached,
	handleUsageAlert,
	replayDeferredAutumnWebhook,
	replayDeferredAutumnWebhooks,
	sendAlertEmail,
} from "./autumn";

beforeEach(() => {
	process.env.RESEND_API_KEY = "test-resend-key";
	state.inserted = [];
	state.insertFailure = null;
	state.locks = [];
	state.operations = [];
	state.ownedOrganizations = [];
	state.recentRows = [];
	state.storeFailure = null;
	state.storedWebhooks.clear();
	state.userRow = { email: "customer@example.com", name: "Customer" };
	state.send.mockClear();
	state.check.mockClear();
	state.cooldownConditions = [];
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
			organizationId: "org-1",
			react: { type: "email" } as never,
			recipient: { email: "member@example.com" },
			subject: "Limit reached",
		});

		expect(result).toEqual({ success: true, message: "Already sent recently" });
		expect(state.operations).toEqual(["lock", "lock", "select"]);
		expect(state.locks).toEqual([
			"usage-alert:user-1:events",
			"usage-alert:org-1:user-1:events",
		]);
		expect(state.cooldownConditions).toEqual([
			{
				conditions: [
					{ field: "userId", op: "eq", value: "user-1" },
					{ field: "featureId", op: "eq", value: "events" },
					expect.objectContaining({ field: "createdAt", op: "gt" }),
					{
						conditions: [
							{ field: "organizationId", op: "eq", value: "org-1" },
							{ field: "organizationId", op: "isNull" },
						],
						op: "or",
					},
				],
			},
		]);
		expect(state.send).not.toHaveBeenCalled();
		expect(state.inserted).toEqual([]);
	});

	it("sends and records the alert inside the locked cooldown section", async () => {
		const result = await sendAlertEmail({
			alertType: "included",
			cooldownKey: "events",
			customerId: "user-1",
			organizationId: "org-1",
			react: { type: "email" } as never,
			recipient: { email: "member@example.com" },
			subject: "Limit reached",
		});

		expect(result).toEqual({ success: true, message: "Email sent" });
		expect(state.operations).toEqual([
			"lock",
			"lock",
			"select",
			"send",
			"insert",
		]);
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
				organizationId: "org-1",
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
			organizationId: "org-1",
			react: { type: "email" } as never,
			recipient: { email: "member@example.com" },
			subject: "Limit reached",
		});

		expect(result).toEqual({
			success: false,
			message: "Alert email delivery failed",
		});
		expect(state.operations).toEqual(["lock", "lock", "select"]);
		expect(state.inserted).toEqual([]);
	});

	it("reports delivery unavailable when Resend is not configured", async () => {
		delete process.env.RESEND_API_KEY;

		const result = await sendAlertEmail({
			alertType: "included",
			cooldownKey: "events",
			customerId: "user-1",
			organizationId: "org-1",
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

	it("uses live balance data and investigation-credit wording", async () => {
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
				featureName: "Investigation credits",
				limitAmount: 350,
				organizationName: "Acme",
				remainingAmount: 62,
				usageAmount: 288,
				usageUnit: "investigation credits",
			})
		);
		expect(UsageAlertEmail).not.toHaveBeenCalledWith(
			expect.objectContaining({ userName: expect.anything() })
		);
		expect(state.send).toHaveBeenCalledWith(
			expect.objectContaining({
				subject: "Investigation credits: 82% used",
				to: "recipient@example.com",
			})
		);
		expect(state.check).toHaveBeenCalledWith({
			customerId: "user-1",
			entityId: "org-1",
			featureId: "agent_credits",
		});
	});

	it("keeps one owner's organization balances and cooldowns independent", async () => {
		state.ownedOrganizations.push({
			organizationId: "org-2",
			organization: {
				emailNotifications: { billing: { usageWarnings: true } },
				id: "org-2",
				name: "Second organization",
			},
		});

		await handleLimitReached({
			customer_id: "user-1",
			entity_id: "org-1",
			feature_id: "events",
			limit_type: "included",
		});
		await handleLimitReached({
			customer_id: "user-1",
			entity_id: "org-2",
			feature_id: "events",
			limit_type: "included",
		});

		expect(state.check).toHaveBeenNthCalledWith(1, {
			customerId: "user-1",
			entityId: "org-1",
			featureId: "events",
		});
		expect(state.check).toHaveBeenNthCalledWith(2, {
			customerId: "user-1",
			entityId: "org-2",
			featureId: "events",
		});
		expect(state.locks).toEqual([
			"usage-alert:user-1:events:limit:included",
			"usage-alert:org-1:user-1:events:limit:included",
			"usage-alert:user-1:events:limit:included",
			"usage-alert:org-2:user-1:events:limit:included",
		]);
		expect(state.inserted.map((row) => row.organizationId)).toEqual([
			"org-1",
			"org-2",
		]);
		expect(state.send).toHaveBeenCalledTimes(2);
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
				featureName: "Investigation credits",
				isAvailable: false,
				limitAmount: 350,
				limitType: "spend_limit",
				usageAmount: 350,
			})
		);
		expect(state.send).toHaveBeenCalledWith(
			expect.objectContaining({
				subject: "[Action required] Investigation credits limit reached",
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

	it("defers usage alerts when organizations are ambiguous", async () => {
		state.ownedOrganizations.push({
			organizationId: "org-2",
			organization: {
				emailNotifications: { billing: { usageWarnings: true } },
				id: "org-2",
				name: "Second organization",
			},
		});

		const result = await handleUsageAlert({
			customer_id: "user-1",
			feature_id: "events",
			usage_alert: {
				threshold: 80,
				threshold_type: "usage_percentage",
			},
		});

		expect(result).toEqual({
			disposition: "deferred",
			success: false,
			message: "Billing usage email deferred: organization could not be resolved",
		});
		expect(state.check).not.toHaveBeenCalled();
		expect(UsageAlertEmail).not.toHaveBeenCalled();
		expect(state.send).not.toHaveBeenCalled();
	});

	it("defers limit alerts when the entity does not resolve", async () => {
		const result = await handleLimitReached({
			customer_id: "user-1",
			entity_id: "org-missing",
			feature_id: "events",
			limit_type: "included",
		});

		expect(result).toEqual({
			disposition: "deferred",
			success: false,
			message: "Billing usage email deferred: organization could not be resolved",
		});
		expect(state.check).not.toHaveBeenCalled();
		expect(UsageLimitEmail).not.toHaveBeenCalled();
		expect(state.send).not.toHaveBeenCalled();
	});
});

describe("Autumn webhook inbox", () => {
	const organization = {
		organizationId: "org-1",
		organization: {
			emailNotifications: { billing: { usageWarnings: true } },
			id: "org-1",
			name: "Acme",
		},
	};

	beforeEach(() => {
		state.ownedOrganizations = [organization];
	});

	it("stores ambiguous multi-organization events and acknowledges the durable deferral", async () => {
		state.ownedOrganizations.push({
			organizationId: "org-2",
			organization: {
				emailNotifications: { billing: { usageWarnings: true } },
				id: "org-2",
				name: "Second organization",
			},
		});

		const result = await handleVerifiedAutumnEvent("msg-ambiguous", {
			data: {
				customer_id: "user-1",
				feature_id: "events",
				usage_alert: {
					name: "Do not retain this provider label",
					threshold: 80,
					threshold_type: "usage_percentage",
				},
			},
			type: "balances.usage_alert_triggered",
		});

		expect(result).toEqual({
			disposition: "deferred",
			message: "Webhook stored for replay",
			success: true,
		});
		expect(state.storedWebhooks.get("msg-ambiguous")).toEqual({
			attempts: 1,
			claimToken: null,
			id: "msg-ambiguous",
			payload: {
				customer_id: "user-1",
				feature_id: "events",
				usage_alert: {
					threshold: 80,
					threshold_type: "usage_percentage",
				},
			},
			status: "deferred",
			type: "balances.usage_alert_triggered",
		});
		expect(state.send).not.toHaveBeenCalled();
	});

	it("does not repeat a completed delivery for a duplicate Svix ID", async () => {
		const event = {
			data: {
				customer_id: "user-1",
				entity_id: "org-1",
				feature_id: "events",
				limit_type: "included",
			},
			type: "balances.limit_reached",
		};

		await handleVerifiedAutumnEvent("msg-duplicate", event);
		const duplicate = await handleVerifiedAutumnEvent("msg-duplicate", event);

		expect(duplicate).toEqual({
			disposition: "duplicate",
			message: "Webhook already processed",
			success: true,
		});
		expect(state.send).toHaveBeenCalledTimes(1);
		expect(state.storedWebhooks.get("msg-duplicate")?.status).toBe(
			"completed"
		);
	});

	it("stops before claiming another replay when shutdown starts", async () => {
		for (const id of ["msg-first", "msg-second"]) {
			state.storedWebhooks.set(id, {
				attempts: 0,
				claimToken: null,
				id,
				payload: {
					customer_id: "user-1",
					entity_id: "org-1",
					feature_id: "events",
					limit_type: "included",
				},
				status: "pending",
				type: "balances.limit_reached",
			});
		}
		let checks = 0;

		await expect(
			replayDeferredAutumnWebhooks(100, () => checks++ === 0)
		).resolves.toMatchObject({ completed: 1, failed: [] });

		expect(state.send).toHaveBeenCalledTimes(1);
		expect(state.storedWebhooks.get("msg-first")?.status).toBe("completed");
		expect(state.storedWebhooks.get("msg-second")?.status).toBe("pending");
	});

	it("reuses a hashed provider idempotency key after post-send persistence failure", async () => {
		const svixId = "msg-post-send-failure";
		const key = createHash("sha256").update(svixId).digest("hex");
		state.insertFailure = new Error("usage alert log unavailable");
		const event = {
			data: {
				customer_id: "user-1",
				entity_id: "org-1",
				feature_id: "events",
				limit_type: "included",
			},
			type: "balances.limit_reached",
		};

		await expect(handleVerifiedAutumnEvent(svixId, event)).rejects.toThrow(
			"usage alert log unavailable"
		);
		expect(state.storedWebhooks.get(svixId)?.status).toBe("pending");

		state.insertFailure = null;
		await expect(replayDeferredAutumnWebhook(svixId)).resolves.toEqual({
			message: "Email sent",
			success: true,
		});

		expect(key).toMatch(/^[0-9a-f]{64}$/);
		expect(state.send).toHaveBeenNthCalledWith(
			1,
			expect.any(Object),
			{ idempotencyKey: key }
		);
		expect(state.send).toHaveBeenNthCalledWith(
			2,
			expect.any(Object),
			{ idempotencyKey: key }
		);
		expect(state.storedWebhooks.get(svixId)?.status).toBe("completed");
	});

	it("keeps provider retry semantics when persistence fails", async () => {
		state.storeFailure = new Error("database unavailable");

		await expect(
			handleVerifiedAutumnEvent("msg-storage-failure", {
				data: {
					customer_id: "user-1",
					entity_id: "org-1",
					feature_id: "events",
					limit_type: "included",
				},
				type: "balances.limit_reached",
			})
		).rejects.toThrow("database unavailable");
		expect(state.send).not.toHaveBeenCalled();
	});

	it("replays a deferred event after its organization becomes resolvable", async () => {
		state.ownedOrganizations.push({
			organizationId: "org-2",
			organization: {
				emailNotifications: { billing: { usageWarnings: true } },
				id: "org-2",
				name: "Second organization",
			},
		});
		await handleVerifiedAutumnEvent("msg-replay", {
			data: {
				customer_id: "user-1",
				feature_id: "events",
				limit_type: "included",
			},
			type: "balances.limit_reached",
		});

		state.ownedOrganizations = [organization];
		const result = await replayDeferredAutumnWebhook("msg-replay");

		expect(result).toEqual({ success: true, message: "Email sent" });
		expect(state.send).toHaveBeenCalledTimes(1);
		expect(state.storedWebhooks.get("msg-replay")?.status).toBe("completed");
	});
});
