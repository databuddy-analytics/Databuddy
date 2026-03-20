import { describe, expect, it } from "bun:test";
import { z } from "zod";

const folderSchema = z.string().max(200).nullable().optional();

const listFlagsSchema = z
	.object({
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
		status: z.enum(["active", "inactive", "archived"]).optional(),
		folder: z.string().optional(),
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
		path: ["websiteId"],
	});

const updateFlagSchema = z.object({
	id: z.string(),
	folder: z.string().max(200).nullish(),
});

describe("Feature flag folders validation", () => {
	describe("folder field validation", () => {
		it("should accept a valid folder path", () => {
			const result = folderSchema.safeParse("auth/login");
			expect(result.success).toBe(true);
		});

		it("should accept null folder", () => {
			const result = folderSchema.safeParse(null);
			expect(result.success).toBe(true);
		});

		it("should accept undefined folder", () => {
			const result = folderSchema.safeParse(undefined);
			expect(result.success).toBe(true);
		});

		it("should accept empty string folder", () => {
			const result = folderSchema.safeParse("");
			expect(result.success).toBe(true);
		});

		it("should reject folder exceeding max length", () => {
			const result = folderSchema.safeParse("a".repeat(201));
			expect(result.success).toBe(false);
		});

		it("should accept nested folder path", () => {
			const result = folderSchema.safeParse("checkout/payment/stripe");
			expect(result.success).toBe(true);
		});
	});

	describe("listFlagsSchema with folder filter", () => {
		it("should accept list request with folder filter", () => {
			const result = listFlagsSchema.safeParse({
				websiteId: "site-123",
				folder: "auth",
			});
			expect(result.success).toBe(true);
		});

		it("should accept list request without folder filter", () => {
			const result = listFlagsSchema.safeParse({
				websiteId: "site-123",
			});
			expect(result.success).toBe(true);
		});

		it("should accept list request with both status and folder", () => {
			const result = listFlagsSchema.safeParse({
				websiteId: "site-123",
				status: "active",
				folder: "checkout",
			});
			expect(result.success).toBe(true);
		});

		it("should still require websiteId or organizationId", () => {
			const result = listFlagsSchema.safeParse({
				folder: "auth",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("updateFlagSchema with folder", () => {
		it("should accept setting folder on update", () => {
			const result = updateFlagSchema.safeParse({
				id: "flag-123",
				folder: "auth/login",
			});
			expect(result.success).toBe(true);
		});

		it("should accept clearing folder (null)", () => {
			const result = updateFlagSchema.safeParse({
				id: "flag-123",
				folder: null,
			});
			expect(result.success).toBe(true);
		});

		it("should accept update without folder field", () => {
			const result = updateFlagSchema.safeParse({
				id: "flag-123",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("folder grouping logic", () => {
		it("should group flags by folder correctly", () => {
			const flags = [
				{ id: "1", key: "a", folder: "auth" },
				{ id: "2", key: "b", folder: "auth" },
				{ id: "3", key: "c", folder: "checkout" },
				{ id: "4", key: "d", folder: null },
				{ id: "5", key: "e", folder: undefined },
			];

			const folderMap = new Map<string, typeof flags>();
			const uncategorized: typeof flags = [];

			for (const flag of flags) {
				if (flag.folder) {
					const existing = folderMap.get(flag.folder) || [];
					existing.push(flag);
					folderMap.set(flag.folder, existing);
				} else {
					uncategorized.push(flag);
				}
			}

			expect(folderMap.size).toBe(2);
			expect(folderMap.get("auth")?.length).toBe(2);
			expect(folderMap.get("checkout")?.length).toBe(1);
			expect(uncategorized.length).toBe(2);
		});

		it("should sort folders alphabetically", () => {
			const folders = ["checkout", "auth", "beta", "admin"];
			const sorted = [...folders].sort((a, b) => a.localeCompare(b));
			expect(sorted).toEqual(["admin", "auth", "beta", "checkout"]);
		});
	});
});
