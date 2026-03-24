import { z } from "zod";
import { DOMAIN_REGEX, SLUG_REGEX } from "./link-constants";

export const linkFormSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(255, "Name must be less than 255 characters"),
	targetUrl: z
		.string()
		.min(1, "Target URL is required")
		.refine(
			(val) => {
				const urlToTest =
					val.startsWith("http://") || val.startsWith("https://")
						? val
						: `https://${val}`;
				try {
					const url = new URL(urlToTest);
					return url.protocol === "http:" || url.protocol === "https:";
				} catch {
					return false;
				}
			},
			{ message: "Please enter a valid URL" },
		),
	slug: z
		.string()
		.trim()
		.max(50, "Slug must be less than 50 characters")
		.refine((val) => val === "" || val.length >= 3, {
			message: "Slug must be at least 3 characters",
		})
		.refine((val) => val === "" || SLUG_REGEX.test(val), {
			message: "Only letters, numbers, hyphens, and underscores",
		})
		.optional()
		.or(z.literal("")),
	expiresAt: z.string().optional().or(z.literal("")),
	expiredRedirectUrl: z
		.string()
		.optional()
		.or(z.literal(""))
		.refine((val) => !val || DOMAIN_REGEX.test(val.split("/").at(0) ?? ""), {
			message: "Enter a valid URL",
		}),
	iosUrl: z
		.string()
		.optional()
		.or(z.literal(""))
		.refine((val) => !val || DOMAIN_REGEX.test(val.split("/").at(0) ?? ""), {
			message: "Enter a valid URL",
		}),
	androidUrl: z
		.string()
		.optional()
		.or(z.literal(""))
		.refine((val) => !val || DOMAIN_REGEX.test(val.split("/").at(0) ?? ""), {
			message: "Enter a valid URL",
		}),
	externalId: z.string().max(255).optional().or(z.literal("")),
});

export type LinkFormData = z.infer<typeof linkFormSchema>;

export type ExpandedSection = "expiration" | "devices" | "utm" | "social" | null;
