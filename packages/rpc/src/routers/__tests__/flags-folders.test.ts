import { describe, expect, it, beforeEach } from "bun:test";
import { flags } from "@databuddy/db";
import { createTestContext, createTestFlag, createTestWebsite } from "../../../test/helpers";
import { flagsRouter } from "../flags";

describe("Flags Router - Folder Operations", () => {
    let context: any;
    let websiteId: string;

    beforeEach(async () => {
        context = await createTestContext();
        const website = await createTestWebsite(context);
        websiteId = website.id;
    });

    describe("flags.list with folder filtering", () => {
        it("should filter flags by folder", async () => {
            await createTestFlag(context, { websiteId, folder: "auth/login" });
            await createTestFlag(context, { websiteId, folder: "checkout" });
            await createTestFlag(context, { websiteId, folder: null });

            const authFlags = await flagsRouter.list.handler({
                context,
                input: { websiteId, folder: "auth/login" }
            });

            const checkoutFlags = await flagsRouter.list.handler({
                context,
                input: { websiteId, folder: "checkout" }
            });

            const rootFlags = await flagsRouter.list.handler({
                context,
                input: { websiteId, folder: "" }
            });

            expect(authFlags).toHaveLength(1);
            expect(authFlags[0].folder).toBe("auth/login");
            expect(checkoutFlags).toHaveLength(1);
            expect(checkoutFlags[0].folder).toBe("checkout");
            expect(rootFlags).toHaveLength(1);
            expect(rootFlags[0].folder).toBeNull();
        });

        it("should return all flags when no folder filter", async () => {
            await createTestFlag(context, { websiteId, folder: "auth" });
            await createTestFlag(context, { websiteId, folder: "checkout" });
            await createTestFlag(context, { websiteId, folder: null });

            const allFlags = await flagsRouter.list.handler({
                context,
                input: { websiteId }
            });

            expect(allFlags).toHaveLength(3);
        });
    });

    describe("flags.create with folder", () => {
        it("should create flag with folder", async () => {
            const flag = await flagsRouter.create.handler({
                context,
                input: {
                    websiteId,
                    key: "test-flag",
                    name: "Test Flag",
                    type: "boolean",
                    status: "active",
                    defaultValue: false,
                    folder: "auth/login"
                }
            });

            expect(flag.folder).toBe("auth/login");
        });

        it("should create flag without folder", async () => {
            const flag = await flagsRouter.create.handler({
                context,
                input: {
                    websiteId,
                    key: "test-flag",
                    name: "Test Flag",
                    type: "boolean",
                    status: "active",
                    defaultValue: false
                }
            });

            expect(flag.folder).toBeNull();
        });

        it("should validate folder path format", async () => {
            expect(async () => {
                await flagsRouter.create.handler({
                    context,
                    input: {
                        websiteId,
                        key: "test-flag",
                        name: "Test Flag",
                        type: "boolean",
                        status: "active",
                        defaultValue: false,
                        folder: "invalid folder name!"
                    }
                });
            }).toThrow();
        });
    });

    describe("flags.update with folder", () => {
        it("should update flag folder", async () => {
            const flag = await createTestFlag(context, { websiteId, folder: "auth" });

            const updatedFlag = await flagsRouter.update.handler({
                context,
                input: {
                    id: flag.id,
                    folder: "auth/login"
                }
            });

            expect(updatedFlag.folder).toBe("auth/login");
        });

        it("should move flag to root by setting empty folder", async () => {
            const flag = await createTestFlag(context, { websiteId, folder: "auth" });

            const updatedFlag = await flagsRouter.update.handler({
                context,
                input: {
                    id: flag.id,
                    folder: ""
                }
            });

            expect(updatedFlag.folder).toBe("");
        });
    });

    describe("folder operations don't affect flag evaluation", () => {
        it("should preserve flag dependencies regardless of folder", async () => {
            const depFlag = await createTestFlag(context, {
                websiteId,
                key: "dep-flag",
                folder: "auth"
            });

            const mainFlag = await createTestFlag(context, {
                websiteId,
                key: "main-flag",
                dependencies: ["dep-flag"],
                folder: "checkout"
            });

            expect(mainFlag.dependencies).toContain("dep-flag");

            const updatedFlag = await flagsRouter.update.handler({
                context,
                input: {
                    id: mainFlag.id,
                    folder: "different-folder"
                }
            });

            expect(updatedFlag.dependencies).toContain("dep-flag");
        });

        it("should preserve flag status and behavior", async () => {
            const flag = await createTestFlag(context, {
                websiteId,
                status: "active",
                folder: "auth"
            });

            const updatedFlag = await flagsRouter.update.handler({
                context,
                input: {
                    id: flag.id,
                    folder: "different-folder"
                }
            });

            expect(updatedFlag.status).toBe("active");
            expect(updatedFlag.defaultValue).toBe(flag.defaultValue);
            expect(updatedFlag.type).toBe(flag.type);
        });
    });

    describe("authorization", () => {
        it("should only allow access to user's website folders", async () => {
            const otherWebsite = await createTestWebsite(context);
            await createTestFlag(context, { websiteId: otherWebsite.id, folder: "secret" });

            const flags = await flagsRouter.list.handler({
                context,
                input: { websiteId, folder: "secret" }
            });

            expect(flags).toHaveLength(0);
        });
    });

    describe("backward compatibility", () => {
        it("should work with existing flags without folders", async () => {
            const existingFlag = await createTestFlag(context, { websiteId });

            const flags = await flagsRouter.list.handler({
                context,
                input: { websiteId }
            });

            expect(flags).toHaveLength(1);
            expect(flags[0].folder).toBeNull();
        });

        it("should handle mixed flags with and without folders", async () => {
            await createTestFlag(context, { websiteId, folder: "auth" });
            await createTestFlag(context, { websiteId, folder: null });
            await createTestFlag(context, { websiteId, folder: "checkout" });

            const allFlags = await flagsRouter.list.handler({
                context,
                input: { websiteId }
            });

            expect(allFlags).toHaveLength(3);

            const folderedFlags = allFlags.filter(f => f.folder);
            const rootFlags = allFlags.filter(f => !f.folder);

            expect(folderedFlags).toHaveLength(2);
            expect(rootFlags).toHaveLength(1);
        });
    });
});