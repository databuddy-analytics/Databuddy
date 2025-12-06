import { describe, expect, it, mock, beforeEach } from "bun:test";

// Mock dependencies before importing the router
const mockAuthorizeWebsiteAccess = mock();
mock.module("../utils/auth", () => ({
    authorizeWebsiteAccess: mockAuthorizeWebsiteAccess,
}));

// Mock DB
const mockDb = {
    query: {
        flags: {
            findFirst: mock(),
        },
        flagSchedules: {
            findFirst: mock(),
        },
    },
    select: mock(() => ({
        from: mock(() => ({
            where: mock(() => ({
                orderBy: mock(() => []),
            })),
        })),
    })),
    insert: mock(() => ({
        values: mock(() => ({
            returning: mock(() => []),
        })),
    })),
    update: mock(() => ({
        set: mock(() => ({
            where: mock(() => ({
                returning: mock(() => []),
            })),
        })),
    })),
    delete: mock(() => ({
        where: mock(),
    })),
};

import { flagSchedulesRouter } from "./flag-schedules";
import { ORPCError } from "@orpc/server";

const mockContext = {
    db: mockDb,
    auth: { api: { getSession: mock() } },
    user: { id: "user-1", role: "USER" },
    session: { id: "session-1" },
    headers: new Headers(),
} as any;

describe("flagSchedulesRouter", () => {
    beforeEach(() => {
        mockDb.query.flags.findFirst.mockReset();
        mockDb.query.flagSchedules.findFirst.mockReset();
        mockAuthorizeWebsiteAccess.mockReset();
    });

    describe("create", () => {
        it("creates a schedule successfully", async () => {
            mockDb.query.flags.findFirst.mockResolvedValue({ id: "flag-1", websiteId: "site-1" });
            const mockReturn = [{ id: "sched-1", flagId: "flag-1" }];
            const valuesMock = mock(() => ({ returning: mock(() => Promise.resolve(mockReturn)) }));
            mockDb.insert.mockReturnValue({ values: valuesMock });

            const input = {
                flagId: "flag-1",
                isEnabled: true,
                type: "enable" as const,
                scheduledAt: new Date().toISOString(),
            };

            // Use internal handler to bypass middleware context issues in testing
            const handler = (flagSchedulesRouter.create as any)["~orpc"].handler;
            const result = await handler({ context: mockContext, input });

            expect(result).toEqual(mockReturn[0]);
            expect(mockAuthorizeWebsiteAccess).toHaveBeenCalledWith(mockContext, "site-1", "update");
            expect(mockDb.insert).toHaveBeenCalled();
        });

        it("throws if flag not found", async () => {
            mockDb.query.flags.findFirst.mockResolvedValue(null);
            const input = {
                flagId: "flag-1",
                isEnabled: true,
                type: "enable" as const,
                scheduledAt: new Date().toISOString(),
            };

            const handler = (flagSchedulesRouter.create as any)["~orpc"].handler;
            expect(handler({ context: mockContext, input })).rejects.toThrow("Flag not found");
        });
    });

    describe("update", () => {
        it("updates a schedule successfully", async () => {
            mockDb.query.flags.findFirst.mockResolvedValue({ id: "flag-1", websiteId: "site-1" });
            mockDb.query.flagSchedules.findFirst.mockResolvedValue({ id: "sched-1", flagId: "flag-1" });

            const mockReturn = [{ id: "sched-1", type: "disable" }];
            const setMock = mock(() => ({ where: mock(() => ({ returning: mock(() => Promise.resolve(mockReturn)) })) }));
            mockDb.update.mockReturnValue({ set: setMock });

            const input = {
                id: "sched-1",
                flagId: "flag-1",
                isEnabled: true,
                type: "disable" as const,
                scheduledAt: new Date().toISOString(),
            };

            const handler = (flagSchedulesRouter.update as any)["~orpc"].handler;
            const result = await handler({ context: mockContext, input });

            expect(result).toEqual(mockReturn[0]);
            expect(mockAuthorizeWebsiteAccess).toHaveBeenCalledWith(mockContext, "site-1", "update");
        });

        it("throws if schedule not found", async () => {
            mockDb.query.flags.findFirst.mockResolvedValue({ id: "flag-1", websiteId: "site-1" });
            mockDb.query.flagSchedules.findFirst.mockResolvedValue(null);

            const input = {
                id: "sched-1",
                flagId: "flag-1",
                isEnabled: true,
                type: "disable" as const,
                scheduledAt: new Date().toISOString(),
            };

            const handler = (flagSchedulesRouter.update as any)["~orpc"].handler;
            expect(handler({ context: mockContext, input })).rejects.toThrow("Schedule not found");
        });
    });

    describe("delete", () => {
        it("deletes a schedule successfully", async () => {
            mockDb.query.flagSchedules.findFirst.mockResolvedValue({ id: "sched-1", flagId: "flag-1" });
            mockDb.query.flags.findFirst.mockResolvedValue({ id: "flag-1", websiteId: "site-1" });

            const whereMock = mock(() => Promise.resolve());
            mockDb.delete.mockReturnValue({ where: whereMock });

            const input = { id: "sched-1" };

            const handler = (flagSchedulesRouter.delete as any)["~orpc"].handler;
            const result = await handler({ context: mockContext, input });

            expect(result).toEqual({ success: true });
            expect(mockAuthorizeWebsiteAccess).toHaveBeenCalledWith(mockContext, "site-1", "update");
            expect(mockDb.delete).toHaveBeenCalled();
        });
    });
});
