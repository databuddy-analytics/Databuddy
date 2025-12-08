import z from "zod";

const HTML_TAG_REGEX = /<[^>]*>/g;
const MALICIOUS_URL_REGEX = /(https?:\/\/|www\.)[^\s]+/gi;

export const organizationNameSchema = z
	.string()
	.min(1, "Organization name is required")
	.max(100, "Organization name must be less than 100 characters")
	.trim()
	.refine(
		(name) => !HTML_TAG_REGEX.test(name),
		"Organization name cannot contain HTML tags"
	)
	.refine(
		(name) => !MALICIOUS_URL_REGEX.test(name),
		"Organization name cannot contain URLs or website addresses"
	);

export const organizationSlugSchema = z
	.string()
	.min(1, "Organization slug is required")
	.max(50, "Organization slug must be less than 50 characters")
	.regex(
		/^[a-z0-9-]+$/,
		"Slug can only contain lowercase letters, numbers, and hyphens"
	)
	.trim();

export const organizationLogoSchema = z
	.string()
	.url("Logo must be a valid URL")
	.optional();

export const createOrganizationSchema = z.object({
	name: organizationNameSchema,
	slug: organizationSlugSchema.optional(),
	logo: organizationLogoSchema,
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateOrganizationSchema = z.object({
	id: z.string().min(1, "Organization ID is required"),
	name: organizationNameSchema.optional(),
	slug: organizationSlugSchema.optional(),
	logo: organizationLogoSchema,
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const uploadOrganizationLogoSchema = z.object({
	organizationId: z.string().min(1, "Organization ID is required"),
	fileData: z.string().min(1, "File data is required"),
	fileName: z.string().min(1, "File name is required"),
	fileType: z.string().min(1, "File type is required"),
});

export const deleteOrganizationSchema = z.object({
	id: z.string().min(1, "Organization ID is required"),
});

export const getPendingInvitationsSchema = z.object({
	organizationId: z.string().min(1, "Organization ID is required"),
	includeExpired: z.boolean().optional(),
});
