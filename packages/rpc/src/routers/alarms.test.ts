import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mock @databuddy/notifications before importing
const mockSendSlackWebhook = mock();
const mockSendDiscordWebhook = mock();
const mockSendWebhook = mock();

mock.module("@databuddy/notifications", () => ({
	sendSlackWebhook: mockSendSlackWebhook,
	sendDiscordWebhook: mockSendDiscordWebhook,
	sendWebhook: mockSendWebhook,
}));

// Mock logger
mock.module("@databuddy/shared/logger", () => ({
	logger: {
		info: mock(),
		error: mock(),
	},
}));

// Mock DB
const mockFindFirst = mock();
const mockFindMany = mock();
const mockInsertValues = mock(() => Promise.resolve());
const mockUpdateSetWhere = mock(() => Promise.resolve());
const mockDeleteWhere = mock(() => Promise.resolve());

const mockDb = {
	query: {
		alarms: {
			findFirst: mockFindFirst,
			findMany: mockFindMany,
		},
	},
	insert: mock(() => ({
		values: mockInsertValues,
	})),
	update: mock(() => ({
		set: mock(() => ({
			where: mockUpdateSetWhere,
		})),
	})),
	delete: mock(() => ({
		where: mockDeleteWhere,
	})),
};

mock.module("@databuddy/db", () => ({
	db: mockDb,
	alarms: {
		id: "id",
		userId: "userId",
		organizationId: "organizationId",
	},
	eq: mock((a, b) => ({ field: a, value: b })),
	and: mock((...args: unknown[]) => args),
	or: mock((...args: unknown[]) => args),
	isNull: mock((field: unknown) => ({ field, isNull: true })),
}));

import { alarmsRouter } from "./alarms";

const mockContext = {
	user: { id: "user-1" },
	session: { activeOrganizationId: null },
};

const mockOrgContext = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

describe("alarmsRouter", () => {
	beforeEach(() => {
		mockFindFirst.mockReset();
		mockFindMany.mockReset();
		mockInsertValues.mockReset();
		mockUpdateSetWhere.mockReset();
		mockDeleteWhere.mockReset();
		mockSendSlackWebhook.mockReset();
		mockSendDiscordWebhook.mockReset();
		mockSendWebhook.mockReset();
	});

	describe("list", () => {
		it("returns user alarms when no organization", async () => {
			const alarms = [
				{ id: "alarm-1", name: "Test", userId: "user-1" },
				{ id: "alarm-2", name: "Test 2", userId: "user-1" },
			];
			mockFindMany.mockResolvedValue(alarms);

			const handler = (alarmsRouter.list as any)["~orpc"].handler;
			const result = await handler({ context: mockContext, input: {} });

			expect(result).toEqual(alarms);
			expect(mockFindMany).toHaveBeenCalled();
		});

		it("returns org and personal alarms when in organization", async () => {
			const alarms = [
				{ id: "alarm-1", name: "Org Alarm", organizationId: "org-1" },
				{ id: "alarm-2", name: "Personal", userId: "user-1" },
			];
			mockFindMany.mockResolvedValue(alarms);

			const handler = (alarmsRouter.list as any)["~orpc"].handler;
			const result = await handler({ context: mockOrgContext, input: {} });

			expect(result).toEqual(alarms);
		});
	});

	describe("get", () => {
		it("returns alarm if user owns it", async () => {
			const alarm = {
				id: "alarm-1",
				userId: "user-1",
				name: "Test",
				organizationId: null,
			};
			mockFindFirst.mockResolvedValue(alarm);

			const handler = (alarmsRouter.get as any)["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { alarmId: "alarm-1" },
			});

			expect(result).toEqual(alarm);
		});

		it("throws NOT_FOUND for non-existent alarm", async () => {
			mockFindFirst.mockResolvedValue(null);

			const handler = (alarmsRouter.get as any)["~orpc"].handler;
			await expect(
				handler({ context: mockContext, input: { alarmId: "missing" } })
			).rejects.toThrow("Alarm not found");
		});

		it("throws FORBIDDEN for other user's alarm", async () => {
			const alarm = {
				id: "alarm-1",
				userId: "other-user",
				name: "Test",
				organizationId: null,
			};
			mockFindFirst.mockResolvedValue(alarm);

			const handler = (alarmsRouter.get as any)["~orpc"].handler;
			await expect(
				handler({ context: mockContext, input: { alarmId: "alarm-1" } })
			).rejects.toThrow("Access denied");
		});

		it("allows access to org alarm when user is in org", async () => {
			const alarm = {
				id: "alarm-1",
				userId: "other-user",
				organizationId: "org-1",
				name: "Org Alarm",
			};
			mockFindFirst.mockResolvedValue(alarm);

			const handler = (alarmsRouter.get as any)["~orpc"].handler;
			const result = await handler({
				context: mockOrgContext,
				input: { alarmId: "alarm-1" },
			});

			expect(result).toEqual(alarm);
		});
	});

	describe("create", () => {
		it("creates alarm successfully", async () => {
			const newAlarm = {
				id: "new-1",
				name: "New Alarm",
				channel: "slack",
				target: "https://hooks.slack.com/...",
				userId: "user-1",
			};
			mockInsertValues.mockResolvedValue(undefined);
			mockFindFirst.mockResolvedValue(newAlarm);

			const handler = (alarmsRouter.create as any)["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: {
					name: "New Alarm",
					channel: "slack",
					target: "https://hooks.slack.com/...",
				},
			});

			expect(result).toEqual(newAlarm);
			expect(mockDb.insert).toHaveBeenCalled();
		});

		it("creates alarm with organization when in org context", async () => {
			const newAlarm = {
				id: "new-1",
				name: "Org Alarm",
				organizationId: "org-1",
			};
			mockInsertValues.mockResolvedValue(undefined);
			mockFindFirst.mockResolvedValue(newAlarm);

			const handler = (alarmsRouter.create as any)["~orpc"].handler;
			const result = await handler({
				context: mockOrgContext,
				input: {
					name: "Org Alarm",
					channel: "discord",
					target: "https://discord.com/api/webhooks/...",
				},
			});

			expect(result).toEqual(newAlarm);
		});
	});

	describe("update", () => {
		it("updates alarm fields", async () => {
			const alarm = { id: "alarm-1", userId: "user-1", name: "Original" };
			const updated = { ...alarm, name: "Updated" };
			mockFindFirst
				.mockResolvedValueOnce(alarm) // For auth check
				.mockResolvedValueOnce(updated); // For return value

			const handler = (alarmsRouter.update as any)["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { alarmId: "alarm-1", name: "Updated" },
			});

			expect(result).toEqual(updated);
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("throws FORBIDDEN for other user's alarm", async () => {
			const alarm = {
				id: "alarm-1",
				userId: "other-user",
				organizationId: null,
			};
			mockFindFirst.mockResolvedValue(alarm);

			const handler = (alarmsRouter.update as any)["~orpc"].handler;
			await expect(
				handler({
					context: mockContext,
					input: { alarmId: "alarm-1", name: "Hacked" },
				})
			).rejects.toThrow("Access denied");
		});
	});

	describe("delete", () => {
		it("deletes alarm successfully", async () => {
			const alarm = { id: "alarm-1", userId: "user-1" };
			mockFindFirst.mockResolvedValue(alarm);
			mockDeleteWhere.mockResolvedValue(undefined);

			const handler = (alarmsRouter.delete as any)["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { alarmId: "alarm-1" },
			});

			expect(result).toEqual({ success: true });
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it("throws FORBIDDEN for other user's alarm", async () => {
			const alarm = {
				id: "alarm-1",
				userId: "other-user",
				organizationId: null,
			};
			mockFindFirst.mockResolvedValue(alarm);

			const handler = (alarmsRouter.delete as any)["~orpc"].handler;
			await expect(
				handler({ context: mockContext, input: { alarmId: "alarm-1" } })
			).rejects.toThrow("Access denied");
		});
	});

	describe("toggle", () => {
		it("toggles alarm enabled state to false", async () => {
			const alarm = { id: "alarm-1", userId: "user-1", enabled: true };
			mockFindFirst.mockResolvedValue(alarm);
			mockUpdateSetWhere.mockResolvedValue(undefined);

			const handler = (alarmsRouter.toggle as any)["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { alarmId: "alarm-1", enabled: false },
			});

			expect(result).toEqual({ success: true, enabled: false });
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("toggles alarm enabled state to true", async () => {
			const alarm = { id: "alarm-1", userId: "user-1", enabled: false };
			mockFindFirst.mockResolvedValue(alarm);
			mockUpdateSetWhere.mockResolvedValue(undefined);

			const handler = (alarmsRouter.toggle as any)["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { alarmId: "alarm-1", enabled: true },
			});

			expect(result).toEqual({ success: true, enabled: true });
		});
	});

	describe("test", () => {
		it("sends test notification for slack channel", async () => {
			const alarm = {
				id: "alarm-1",
				userId: "user-1",
				channel: "slack",
				target: "https://hooks.slack.com/...",
				name: "Test Alarm",
			};
			mockFindFirst.mockResolvedValue(alarm);
			mockSendSlackWebhook.mockResolvedValue(undefined);

			const handler = (alarmsRouter.test as any)["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { alarmId: "alarm-1" },
			});

			expect(result).toEqual({ success: true, message: "Test notification sent" });
			expect(mockSendSlackWebhook).toHaveBeenCalledWith(
				alarm.target,
				expect.objectContaining({
					title: "Test Notification",
					metadata: expect.objectContaining({ isTest: true }),
				})
			);
		});

		it("sends test notification for discord channel", async () => {
			const alarm = {
				id: "alarm-1",
				userId: "user-1",
				channel: "discord",
				target: "https://discord.com/api/webhooks/...",
				name: "Discord Alarm",
			};
			mockFindFirst.mockResolvedValue(alarm);
			mockSendDiscordWebhook.mockResolvedValue(undefined);

			const handler = (alarmsRouter.test as any)["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { alarmId: "alarm-1" },
			});

			expect(result).toEqual({ success: true, message: "Test notification sent" });
			expect(mockSendDiscordWebhook).toHaveBeenCalled();
		});

		it("sends test notification for webhook channel", async () => {
			const alarm = {
				id: "alarm-1",
				userId: "user-1",
				channel: "webhook",
				target: "https://api.example.com/webhook",
				name: "Webhook Alarm",
			};
			mockFindFirst.mockResolvedValue(alarm);
			mockSendWebhook.mockResolvedValue(undefined);

			const handler = (alarmsRouter.test as any)["~orpc"].handler;
			const result = await handler({
				context: mockContext,
				input: { alarmId: "alarm-1" },
			});

			expect(result).toEqual({ success: true, message: "Test notification sent" });
			expect(mockSendWebhook).toHaveBeenCalled();
		});

		it("throws BAD_REQUEST for email channel", async () => {
			const alarm = {
				id: "alarm-1",
				userId: "user-1",
				channel: "email",
				target: "test@example.com",
				name: "Email Alarm",
			};
			mockFindFirst.mockResolvedValue(alarm);

			const handler = (alarmsRouter.test as any)["~orpc"].handler;
			await expect(
				handler({ context: mockContext, input: { alarmId: "alarm-1" } })
			).rejects.toThrow("Email test notifications are not yet supported");
		});

		it("throws INTERNAL_SERVER_ERROR when notification fails", async () => {
			const alarm = {
				id: "alarm-1",
				userId: "user-1",
				channel: "slack",
				target: "https://hooks.slack.com/...",
				name: "Failing Alarm",
			};
			mockFindFirst.mockResolvedValue(alarm);
			mockSendSlackWebhook.mockRejectedValue(new Error("Network error"));

			const handler = (alarmsRouter.test as any)["~orpc"].handler;
			await expect(
				handler({ context: mockContext, input: { alarmId: "alarm-1" } })
			).rejects.toThrow("Failed to send test notification");
		});
	});
});
