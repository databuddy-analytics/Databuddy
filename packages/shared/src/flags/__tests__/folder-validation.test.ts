import { describe, expect, it } from "bun:test";
import { flagFormSchema } from "../index";

describe("Folder Validation", () => {
    describe("flagFormSchema folder validation", () => {
        it("should accept valid folder paths", () => {
            const validFolders = [
                "auth",
                "auth/login",
                "checkout/payment",
                "experiments/ab-tests",
                "feature_flags",
                "user-management",
                "api/v1/endpoints",
                ""
            ];

            for (const folder of validFolders) {
                const result = flagFormSchema.safeParse({
                    key: "test-flag",
                    name: "Test Flag",
                    type: "boolean",
                    status: "active",
                    defaultValue: false,
                    rolloutPercentage: 0,
                    folder
                });

                expect(result.success).toBe(true);
            }
        });

        it("should reject invalid folder paths", () => {
            const invalidFolders = [
                "folder with spaces",
                "folder@with#special!chars",
                "folder.with.dots",
                "folder\\with\\backslashes",
                "folder|with|pipes",
                "folder<with>brackets",
                "folder{with}braces",
                "folder(with)parentheses",
                "folder+with+plus",
                "folder=with=equals",
                "folder?with?question",
                "folder*with*asterisk",
                "/leading/slash",        // Leading slash not allowed
                "trailing/slash/",       // Trailing slash not allowed
                "//double//slashes",     // Consecutive slashes not allowed
                "auth//login",           // Consecutive slashes not allowed
                "auth/",                 // Trailing slash not allowed
                "/auth"                  // Leading slash not allowed
            ];

            for (const folder of invalidFolders) {
                const result = flagFormSchema.safeParse({
                    key: "test-flag",
                    name: "Test Flag",
                    type: "boolean",
                    status: "active",
                    defaultValue: false,
                    rolloutPercentage: 0,
                    folder
                });

                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error.issues.some(issue =>
                        issue.path.includes("folder")
                    )).toBe(true);
                }
            }
        });

        it("should reject folder paths that are too long", () => {
            const longFolder = "a".repeat(201); // Exceeds 200 char limit

            const result = flagFormSchema.safeParse({
                key: "test-flag",
                name: "Test Flag",
                type: "boolean",
                status: "active",
                defaultValue: false,
                rolloutPercentage: 0,
                folder: longFolder
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.some(issue =>
                    issue.message.includes("too long")
                )).toBe(true);
            }
        });

        it("should accept folder paths at the character limit", () => {
            const maxLengthFolder = "a".repeat(200); // Exactly 200 chars

            const result = flagFormSchema.safeParse({
                key: "test-flag",
                name: "Test Flag",
                type: "boolean",
                status: "active",
                defaultValue: false,
                rolloutPercentage: 0,
                folder: maxLengthFolder
            });

            expect(result.success).toBe(true);
        });

        it("should accept undefined folder", () => {
            const result = flagFormSchema.safeParse({
                key: "test-flag",
                name: "Test Flag",
                type: "boolean",
                status: "active",
                defaultValue: false,
                rolloutPercentage: 0
                // folder is undefined
            });

            expect(result.success).toBe(true);
        });

        it("should accept empty string folder", () => {
            const result = flagFormSchema.safeParse({
                key: "test-flag",
                name: "Test Flag",
                type: "boolean",
                status: "active",
                defaultValue: false,
                rolloutPercentage: 0,
                folder: ""
            });

            expect(result.success).toBe(true);
        });

        it("should handle nested folder structures", () => {
            const nestedFolders = [
                "auth/login/social",
                "auth/login/email/verification",
                "checkout/payment/stripe/webhooks",
                "experiments/ab-tests/homepage/hero",
                "feature-flags/user_management/permissions/admin"
            ];

            for (const folder of nestedFolders) {
                const result = flagFormSchema.safeParse({
                    key: "test-flag",
                    name: "Test Flag",
                    type: "boolean",
                    status: "active",
                    defaultValue: false,
                    rolloutPercentage: 0,
                    folder
                });

                expect(result.success).toBe(true);
            }
        });

        it("should preserve other field validations with folder", () => {
            // Test that folder validation doesn't interfere with other validations
            const result = flagFormSchema.safeParse({
                key: "", // Invalid key
                name: "Test Flag",
                type: "boolean",
                status: "active",
                defaultValue: false,
                rolloutPercentage: 0,
                folder: "valid/folder"
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.some(issue =>
                    issue.path.includes("key")
                )).toBe(true);
            }
        });
    });

    describe("Folder path parsing", () => {
        it("should handle various folder path formats", () => {
            const testCases = [
                { input: "auth", expected: ["auth"] },
                { input: "auth/login", expected: ["auth", "login"] },
                { input: "auth/login/social", expected: ["auth", "login", "social"] },
                { input: "", expected: [] },
                { input: "single", expected: ["single"] }
            ];

            for (const testCase of testCases) {
                const parts = testCase.input.split("/").filter(Boolean);
                expect(parts).toEqual(testCase.expected);
            }
        });

        it("should handle edge cases in folder paths", () => {
            // These edge cases should be normalized by split("/").filter(Boolean)
            // but our new regex prevents them from being stored in the first place
            const edgeCases = [
                { input: "/leading/slash", expected: ["leading", "slash"] },
                { input: "trailing/slash/", expected: ["trailing", "slash"] },
                { input: "//double//slashes//", expected: ["double", "slashes"] }
            ];

            for (const testCase of edgeCases) {
                const parts = testCase.input.split("/").filter(Boolean);
                expect(parts).toEqual(testCase.expected);

                // But these should fail validation with our new strict regex
                const result = flagFormSchema.safeParse({
                    key: "test-flag",
                    name: "Test Flag",
                    type: "boolean",
                    status: "active",
                    defaultValue: false,
                    rolloutPercentage: 0,
                    folder: testCase.input
                });

                expect(result.success).toBe(false);
            }
        });
    });
});