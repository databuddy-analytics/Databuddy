import {
	and,
	asc,
	eq,
	isNull,
	isUniqueViolationFor,
	withTransaction,
} from "@databuddy/db";
import { linkFolders, links } from "@databuddy/db/schema";
import { randomUUIDv7 } from "bun";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { rpcError } from "../errors";
import { type Context, protectedProcedure, trackedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const generateFolderSuffix = customAlphabet(
	"0123456789abcdefghijklmnopqrstuvwxyz",
	4
);

const folderSlugSchema = z
	.string()
	.min(1)
	.max(64)
	.regex(
		/^[a-z0-9_-]+$/,
		"Folder slug can only contain lowercase letters, numbers, hyphens, and underscores"
	);

const listLinkFoldersSchema = z
	.object({
		organizationId: z.string().optional(),
	})
	.default({});

const createLinkFolderSchema = z.object({
	organizationId: z.string().optional(),
	name: z.string().trim().min(1).max(80),
	slug: folderSlugSchema.optional(),
});

const updateLinkFolderSchema = z.object({
	id: z.string(),
	name: z.string().trim().min(1).max(80).optional(),
	slug: folderSlugSchema.optional(),
});

const deleteLinkFolderSchema = z.object({
	id: z.string(),
});

const linkFolderOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	createdBy: z.string(),
	name: z.string(),
	slug: z.string(),
	deletedAt: z.nullable(z.coerce.date()),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

function slugifyFolderName(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s_-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	return slug || "folder";
}

async function getFolderOrThrow(context: Context, id: string) {
	const folder = await context.db
		.select()
		.from(linkFolders)
		.where(and(eq(linkFolders.id, id), isNull(linkFolders.deletedAt)))
		.limit(1);

	if (folder.length === 0) {
		throw rpcError.notFound("link folder", id);
	}

	return folder[0];
}

export const linkFoldersRouter = {
	list: protectedProcedure
		.route({
			method: "POST",
			path: "/link-folders/list",
			tags: ["Links"],
			summary: "List link folders",
			description:
				"Returns folders used to organize short links inside a workspace. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(listLinkFoldersSchema)
		.output(z.array(linkFolderOutputSchema))
		.handler(async ({ context, input }) => {
			const organizationId =
				input.organizationId ?? context.organizationId ?? null;
			if (!organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId,
				resource: "link",
				permissions: ["read"],
			});

			return context.db
				.select()
				.from(linkFolders)
				.where(
					and(
						eq(linkFolders.organizationId, organizationId),
						isNull(linkFolders.deletedAt)
					)
				)
				.orderBy(asc(linkFolders.name));
		}),

	create: trackedProcedure
		.route({
			method: "POST",
			path: "/link-folders/create",
			tags: ["Links"],
			summary: "Create link folder",
			description:
				"Creates a folder used to organize short links. Requires write:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["write:links"] as const }),
		})
		.input(createLinkFolderSchema)
		.output(linkFolderOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId =
				input.organizationId?.trim() || context.organizationId || null;
			if (!organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			const workspace = await withWorkspace(context, {
				organizationId,
				resource: "link",
				permissions: ["create"],
			});
			const createdBy = await workspace.getCreatedBy();
			const baseSlug = (input.slug ?? slugifyFolderName(input.name)).slice(
				0,
				64
			);
			const slugsToTry = input.slug
				? [input.slug]
				: [
						baseSlug,
						...Array.from(
							{ length: 5 },
							() => `${baseSlug.slice(0, 59)}-${generateFolderSuffix()}`
						),
					];

			for (const slug of slugsToTry) {
				try {
					const [folder] = await context.db
						.insert(linkFolders)
						.values({
							id: randomUUIDv7(),
							organizationId,
							createdBy,
							name: input.name.trim(),
							slug,
						})
						.returning();

					return folder;
				} catch (error) {
					if (!isUniqueViolationFor(error, "link_folders_org_slug_unique")) {
						throw error;
					}
					if (input.slug) {
						throw rpcError.conflict("This folder slug is already taken");
					}
				}
			}

			throw rpcError.internal("Failed to generate unique folder slug");
		}),

	update: trackedProcedure
		.route({
			method: "POST",
			path: "/link-folders/update",
			tags: ["Links"],
			summary: "Update link folder",
			description: "Updates a link folder. Requires write:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["write:links"] as const }),
		})
		.input(updateLinkFolderSchema)
		.output(linkFolderOutputSchema)
		.handler(async ({ context, input }) => {
			const folder = await getFolderOrThrow(context, input.id);
			await withWorkspace(context, {
				organizationId: folder.organizationId,
				resource: "link",
				permissions: ["update"],
			});

			try {
				const [updatedFolder] = await context.db
					.update(linkFolders)
					.set({
						name: input.name?.trim(),
						slug: input.slug,
						updatedAt: new Date(),
					})
					.where(eq(linkFolders.id, input.id))
					.returning();

				return updatedFolder;
			} catch (error) {
				if (isUniqueViolationFor(error, "link_folders_org_slug_unique")) {
					throw rpcError.conflict("This folder slug is already taken");
				}
				throw error;
			}
		}),

	delete: trackedProcedure
		.route({
			method: "POST",
			path: "/link-folders/delete",
			tags: ["Links"],
			summary: "Delete link folder",
			description:
				"Deletes a link folder and moves contained links to Unfiled. Requires write:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["write:links"] as const }),
		})
		.input(deleteLinkFolderSchema)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const folder = await getFolderOrThrow(context, input.id);
			await withWorkspace(context, {
				organizationId: folder.organizationId,
				resource: "link",
				permissions: ["delete"],
			});

			await withTransaction(async (tx) => {
				await tx
					.update(links)
					.set({ folderId: null, updatedAt: new Date() })
					.where(eq(links.folderId, input.id));
				await tx.delete(linkFolders).where(eq(linkFolders.id, input.id));
			});

			return { success: true };
		}),
};
