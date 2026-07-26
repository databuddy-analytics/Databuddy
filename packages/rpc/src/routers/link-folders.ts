import {
	and,
	asc,
	eq,
	getTableColumns,
	isNull,
	isUniqueViolationFor,
	sql,
	withTransaction,
} from "@databuddy/db";
import { linkFolders, links } from "@databuddy/db/schema";
import { randomUUIDv7 } from "bun";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { rpcError } from "../errors";
import { type Context, protectedProcedure, trackedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";
import {
	createLinkFolderSchema,
	deleteLinkFolderSchema,
	linkFolderOutputSchema,
	linkFolderWithUsageOutputSchema,
	listLinkFoldersSchema,
	slugifyFolderName,
	updateLinkFolderSchema,
} from "./links.schemas";

type LinkPermission = "read" | "create" | "update" | "delete";
type LinkFolderRow = typeof linkFolders.$inferSelect;

const generateFolderSuffix = customAlphabet(
	"0123456789abcdefghijklmnopqrstuvwxyz",
	4
);

function requireOrganizationId(
	organizationId: string | null | undefined
): string {
	if (!organizationId) {
		throw rpcError.badRequest("Organization ID is required");
	}
	return organizationId;
}

function requireLinkAccess(
	context: Context,
	organizationId: string,
	permission: LinkPermission
) {
	const permissions: [LinkPermission] = [permission];
	return withWorkspace(context, {
		organizationId,
		resource: "link",
		permissions,
	});
}

async function getFolderOrThrow(
	context: Context,
	id: string
): Promise<LinkFolderRow> {
	const [folder] = await context.db
		.select()
		.from(linkFolders)
		.where(and(eq(linkFolders.id, id), isNull(linkFolders.deletedAt)))
		.limit(1);

	if (!folder) {
		throw rpcError.notFound("link folder", id);
	}

	return folder;
}

export const linkFoldersRouter = {
	list: protectedProcedure
		.route({
			method: "POST",
			path: "/link-folders/list",
			tags: ["Links"],
			summary: "List link folders",
			description:
				"Returns folders used to organize short links inside an organization. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(listLinkFoldersSchema)
		.output(z.array(linkFolderWithUsageOutputSchema))
		.handler(async ({ context, input }) => {
			const organizationId = requireOrganizationId(
				input.organizationId ?? context.organizationId
			);

			await requireLinkAccess(context, organizationId, "read");

			return context.db
				.select({
					...getTableColumns(linkFolders),
					linkCount: sql<number>`(
						select count(*)::int
						from ${links}
						where ${links.organizationId} = ${organizationId}
							and ${links.folderId} = ${linkFolders.id}
							and ${links.deletedAt} is null
					)`.mapWith(Number),
				})
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
			const organizationId = requireOrganizationId(
				input.organizationId?.trim() || context.organizationId
			);

			const workspace = await requireLinkAccess(
				context,
				organizationId,
				"create"
			);
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

					if (!folder) {
						throw rpcError.internal("Failed to create link folder");
					}

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
			await requireLinkAccess(context, folder.organizationId, "update");

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

				if (!updatedFolder) {
					throw rpcError.notFound("link folder", input.id);
				}

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
			await requireLinkAccess(context, folder.organizationId, "delete");

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
