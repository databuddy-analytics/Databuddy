import { describe, expect, test } from "bun:test";
import { DEEP_LINK_APPS } from "@databuddy/shared/constants/deep-link-apps";
import { createDeepLinkFormSchema } from "./link-form-schema";

const instagram = DEEP_LINK_APPS.find((app) => app.id === "instagram");
if (!instagram) {
	throw new Error("Instagram deep-link configuration is missing");
}

const instagramSchema = createDeepLinkFormSchema(instagram);
const validInput = {
	folderId: "",
	name: "Instagram profile",
	slug: "instagram-profile",
	targetUrl: "instagram.com/databuddy",
};

describe("createDeepLinkFormSchema", () => {
	test("accepts an app-specific deep-link target", () => {
		expect(instagramSchema.safeParse(validInput).success).toBe(true);
	});

	test("rejects an HTTPS URL for a different app", () => {
		const result = instagramSchema.safeParse({
			...validInput,
			targetUrl: "x.com/databuddy",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toContainEqual(
			expect.objectContaining({
				message: "URL must be an HTTPS Instagram link",
				path: ["targetUrl"],
			})
		);
		}
	});

	test.each(["ab", "bad/slug"])("rejects invalid slug %s", (slug) => {
		expect(
			instagramSchema.safeParse({ ...validInput, slug }).success
		).toBe(false);
	});
});
