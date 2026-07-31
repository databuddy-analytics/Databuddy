import { linkFolders, links } from "@databuddy/db/schema";
import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-orm/zod";
import { DEEP_LINK_APP_IDS } from "@databuddy/shared/constants/deep-link-apps";
import { LINK_SLUG_REGEX } from "@databuddy/shared/constants/links";
import { httpUrlSchema } from "@databuddy/validation";
import { z } from "zod";

const linkSelectSchema = createSelectSchema(links, {
	expiresAt: z.nullable(z.coerce.date()),
	deletedAt: z.nullable(z.coerce.date()),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const linkInsertSchema = createInsertSchema(links);
const linkUpdateSchema = createUpdateSchema(links);

const linkFolderSelectSchema = createSelectSchema(linkFolders, {
	deletedAt: z.nullable(z.coerce.date()),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const linkFolderInsertSchema = createInsertSchema(linkFolders);
const linkFolderUpdateSchema = createUpdateSchema(linkFolders);

export const listLinksSchema = z
	.object({
		organizationId: z.string().optional(),
		externalId: z.string().optional(),
		folderId: z.string().nullable().optional(),
		sourceType: z.string().max(64).optional(),
		sourceId: z.string().max(255).optional(),
		sourceOwnerId: z.string().max(255).optional(),
		targetDomain: z.string().max(255).optional(),
	})
	.default({});

const linkSortSchema = z
	.enum(["newest", "oldest", "name-asc", "name-desc"])
	.default("newest");

const linkTypeFilterSchema = z.enum(["all", "short", "deep"]).default("all");

export const listLinksPageSchema = listLinksSchema.unwrap().extend({
	includeTotal: z.boolean().default(false),
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).default(0),
	search: z.string().trim().min(1).max(255).optional(),
	sort: linkSortSchema,
	type: linkTypeFilterSchema,
});

export const listLinkFoldersSchema = z
	.object({
		organizationId: z.string().optional(),
	})
	.default({});

export const getLinkSchema = z.object({
	id: z.string(),
});

const slugSchema = z
	.string()
	.min(3)
	.max(50)
	.regex(
		LINK_SLUG_REGEX,
		"Slug can only contain letters, numbers, hyphens, and underscores"
	);

const folderSlugSchema = z
	.string()
	.min(1)
	.max(64)
	.regex(
		/^[a-z0-9_-]+$/,
		"Folder slug can only contain lowercase letters, numbers, hyphens, and underscores"
	);

export const createLinkSchema = linkInsertSchema
	.pick({
		organizationId: true,
		name: true,
		targetUrl: true,
		slug: true,
		folderId: true,
		expiresAt: true,
		expiredRedirectUrl: true,
		ogTitle: true,
		ogDescription: true,
		ogImageUrl: true,
		ogVideoUrl: true,
		iosUrl: true,
		androidUrl: true,
		externalId: true,
		sourceType: true,
		sourceId: true,
		sourceOwnerId: true,
		targetDomain: true,
		deepLinkApp: true,
	})
	.extend({
		organizationId: z.string().optional(),
		name: z.string().min(1).max(255),
		targetUrl: httpUrlSchema,
		slug: slugSchema.optional(),
		expiredRedirectUrl: httpUrlSchema.nullable().optional(),
		ogTitle: z.string().max(200).nullable().optional(),
		ogDescription: z.string().max(500).nullable().optional(),
		ogImageUrl: httpUrlSchema.nullable().optional(),
		ogVideoUrl: httpUrlSchema.nullable().optional(),
		iosUrl: httpUrlSchema.nullable().optional(),
		androidUrl: httpUrlSchema.nullable().optional(),
		externalId: z.string().max(255).nullable().optional(),
		sourceType: z.string().max(64).nullable().optional(),
		sourceId: z.string().max(255).nullable().optional(),
		sourceOwnerId: z.string().max(255).nullable().optional(),
		targetDomain: z.string().max(255).nullable().optional(),
		deepLinkApp: z.enum(DEEP_LINK_APP_IDS).nullable().optional(),
	});

export const createLinkFolderSchema = linkFolderInsertSchema
	.pick({
		organizationId: true,
		name: true,
		slug: true,
	})
	.extend({
		organizationId: z.string().optional(),
		name: z.string().trim().min(1).max(80),
		slug: folderSlugSchema.optional(),
	});

export const updateLinkSchema = linkUpdateSchema
	.pick({
		id: true,
		name: true,
		targetUrl: true,
		slug: true,
		folderId: true,
		expiresAt: true,
		expiredRedirectUrl: true,
		ogTitle: true,
		ogDescription: true,
		ogImageUrl: true,
		ogVideoUrl: true,
		iosUrl: true,
		androidUrl: true,
		externalId: true,
		sourceType: true,
		sourceId: true,
		sourceOwnerId: true,
		targetDomain: true,
		deepLinkApp: true,
	})
	.extend({
		id: z.string(),
		name: z.string().min(1).max(255).optional(),
		targetUrl: httpUrlSchema.optional(),
		slug: slugSchema.optional(),
		expiresAt: z.string().datetime().nullable().optional(),
		expiredRedirectUrl: httpUrlSchema.nullable().optional(),
		ogTitle: z.string().max(200).nullable().optional(),
		ogDescription: z.string().max(500).nullable().optional(),
		ogImageUrl: httpUrlSchema.nullable().optional(),
		ogVideoUrl: httpUrlSchema.nullable().optional(),
		iosUrl: httpUrlSchema.nullable().optional(),
		androidUrl: httpUrlSchema.nullable().optional(),
		externalId: z.string().max(255).nullable().optional(),
		sourceType: z.string().max(64).nullable().optional(),
		sourceId: z.string().max(255).nullable().optional(),
		sourceOwnerId: z.string().max(255).nullable().optional(),
		targetDomain: z.string().max(255).nullable().optional(),
		deepLinkApp: z.enum(DEEP_LINK_APP_IDS).nullable().optional(),
	});

export const updateLinkFolderSchema = linkFolderUpdateSchema
	.pick({
		id: true,
		name: true,
		slug: true,
	})
	.extend({
		id: z.string(),
		name: z.string().trim().min(1).max(80).optional(),
		slug: folderSlugSchema.optional(),
	});

export const deleteLinkSchema = getLinkSchema;

export const deleteLinkFolderSchema = z.object({
	id: z.string(),
});

export const linkOutputSchema = linkSelectSchema.pick({
	id: true,
	organizationId: true,
	createdBy: true,
	folderId: true,
	slug: true,
	name: true,
	targetUrl: true,
	targetDomain: true,
	sourceType: true,
	sourceId: true,
	sourceOwnerId: true,
	expiresAt: true,
	expiredRedirectUrl: true,
	ogTitle: true,
	ogDescription: true,
	ogImageUrl: true,
	ogVideoUrl: true,
	iosUrl: true,
	androidUrl: true,
	externalId: true,
	deepLinkApp: true,
	deletedAt: true,
	createdAt: true,
	updatedAt: true,
});

export const listLinksPageOutputSchema = z.object({
	items: z.array(linkOutputSchema),
	hasMore: z.boolean(),
	total: z.number().int().nonnegative().optional(),
});

export const linkFolderOutputSchema = linkFolderSelectSchema.pick({
	id: true,
	organizationId: true,
	createdBy: true,
	name: true,
	slug: true,
	deletedAt: true,
	createdAt: true,
	updatedAt: true,
});

export const linkFolderWithUsageOutputSchema = linkFolderOutputSchema.extend({
	linkCount: z.number().int().nonnegative(),
});

export function slugifyFolderName(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s_-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	return slug || "folder";
}
