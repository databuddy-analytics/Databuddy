import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import { getCachedWebsite } from "../../lib/website-utils";
import {
	LinkFolderSelectorSchema,
	hasLinkFolderSelector,
	listLinkFolders,
	listLinks,
	parseLinkRow,
	resolveLinkFolder,
	resolveLinkFolderFromList,
	summarizeLink,
	summarizeLinkFolder,
	summarizeLinkFoldersWithUsage,
} from "./link-catalog";
import { callRPCProcedure, createToolLogger, getAppContext } from "./utils";

const logger = createToolLogger("Links Tools");

const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

async function getOrganizationIdFromWebsite(
	websiteId: string
): Promise<string> {
	const website = await getCachedWebsite(websiteId);
	if (!website) {
		throw new Error("Website not found");
	}
	if (!website.organizationId) {
		throw new Error(
			"This website is not associated with an organization. Links require an organization."
		);
	}
	return website.organizationId;
}

export function createLinksTools() {
	const listLinkFoldersTool = tool({
		description:
			"List existing short-link folders for the website organization, including how many links are filed in each folder. Use this before choosing a folder for link creation or updates.",
		inputSchema: z.object({ websiteId: z.string() }),
		execute: async ({ websiteId }, options) => {
			const context = getAppContext(options);
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);
				const [folders, links] = await Promise.all([
					listLinkFolders(context, organizationId),
					listLinks(context, organizationId),
				]);

				return {
					folders: summarizeLinkFoldersWithUsage(folders, links),
					count: folders.length,
					unfiledCount: links.filter((link) => !link.folderId).length,
					hint:
						folders.length === 0
							? "No link folders exist yet. Leave links unfiled unless the user creates a folder in Databuddy."
							: "Use folderId or folderSlug from this list. Do not invent new folders from the agent.",
				};
			} catch (error) {
				logger.error("Failed to list link folders", { websiteId, error });
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve link folders. Please try again.");
			}
		},
	});

	const listLinksTool = tool({
		description:
			"List short links and existing folders for the website org (slug, target URL, folder, metadata).",
		inputSchema: z.object({ websiteId: z.string() }),
		execute: async ({ websiteId }, options) => {
			const context = getAppContext(options);
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);
				const [links, folders] = await Promise.all([
					listLinks(context, organizationId),
					listLinkFolders(context, organizationId),
				]);
				return {
					links: links.map((link) => summarizeLink(link, folders)),
					count: links.length,
					folders: summarizeLinkFoldersWithUsage(folders, links),
					unfiledCount: links.filter((link) => !link.folderId).length,
				};
			} catch (error) {
				logger.error("Failed to list links", { websiteId, error });
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve links. Please try again.");
			}
		},
	});

	const createLinkTool = tool({
		description:
			"Create a short link. slug auto-generated if omitted. expiresAt is ISO date.",
		inputSchema: z.object({
			websiteId: z.string(),
			name: z.string().min(1).max(255),
			targetUrl: z.string().url(),
			slug: z.string().min(3).max(50).regex(SLUG_REGEX).optional(),
			expiresAt: z.string().optional(),
			expiredRedirectUrl: z.string().url().optional(),
			ogTitle: z.string().max(200).optional(),
			ogDescription: z.string().max(500).optional(),
			ogImageUrl: z.string().url().optional(),
			externalId: z.string().max(255).optional(),
			...LinkFolderSelectorSchema.shape,
			deepLinkApp: z
				.string()
				.optional()
				.describe(
					"App ID for deep linking (instagram, tiktok, youtube, x, spotify, linkedin, facebook, whatsapp, telegram). On mobile, opens the native app."
				),
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		execute: async (
			{
				websiteId,
				name,
				targetUrl,
				slug,
				expiresAt,
				expiredRedirectUrl,
				ogTitle,
				ogDescription,
				ogImageUrl,
				externalId,
				folderId,
				folderSlug,
				deepLinkApp,
				confirmed,
			},
			options
		) => {
			const context = getAppContext(options);
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);
				const folderSelection = await resolveLinkFolder(
					context,
					organizationId,
					{ folderId, folderSlug }
				);
				if (!folderSelection.ok) {
					return {
						success: false,
						message: folderSelection.message,
						folders: summarizeLinkFoldersWithUsage(folderSelection.folders, []),
					};
				}

				if (!confirmed) {
					return {
						preview: true,
						message:
							"Please review the link details below and confirm if you want to create it:",
						link: {
							name,
							targetUrl,
							slug: slug ?? "(auto-generated)",
							expiresAt: expiresAt ?? "Never",
							expiredRedirectUrl: expiredRedirectUrl ?? "None",
							ogTitle: ogTitle ?? "None",
							ogDescription: ogDescription ?? "None",
							ogImageUrl: ogImageUrl ?? "None",
							externalId: externalId ?? "None",
							folder: folderSelection.folder
								? summarizeLinkFolder(folderSelection.folder)
								: "Unfiled",
						},
						availableFolders: folderSelection.folders.map(summarizeLinkFolder),
						confirmationRequired: true,
						instruction:
							"To create this link, the user must explicitly confirm (e.g., 'yes', 'create it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

				const newLink = parseLinkRow(
					await callRPCProcedure(
						"links",
						"create",
						{
							organizationId,
							name,
							targetUrl,
							slug,
							folderId: folderSelection.folderId ?? null,
							expiresAt: expiresAt ? new Date(expiresAt) : null,
							expiredRedirectUrl: expiredRedirectUrl ?? null,
							ogTitle: ogTitle ?? null,
							ogDescription: ogDescription ?? null,
							ogImageUrl: ogImageUrl ?? null,
							externalId: externalId ?? null,
							deepLinkApp: deepLinkApp ?? null,
						},
						context
					)
				);

				return {
					success: true,
					message: `Link "${name}" created successfully!`,
					link: summarizeLink(newLink, folderSelection.folders),
					shortUrl: `/${newLink.slug}`,
				};
			} catch (error) {
				logger.error("Failed to create link", { websiteId, name, error });
				throw error instanceof Error
					? error
					: new Error("Failed to create link. Please try again.");
			}
		},
	});

	const updateLinkTool = tool({
		description: "Update a short link. Pass null to nullable fields to clear.",
		inputSchema: z.object({
			id: z.string(),
			websiteId: z.string(),
			name: z.string().min(1).max(255).optional(),
			targetUrl: z.string().url().optional(),
			slug: z.string().min(3).max(50).regex(SLUG_REGEX).optional(),
			expiresAt: z.string().datetime().nullable().optional(),
			expiredRedirectUrl: z.string().url().nullable().optional(),
			ogTitle: z.string().max(200).nullable().optional(),
			ogDescription: z.string().max(500).nullable().optional(),
			ogImageUrl: z.string().url().nullable().optional(),
			externalId: z.string().max(255).nullable().optional(),
			...LinkFolderSelectorSchema.shape,
			deepLinkApp: z.string().nullable().optional(),
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		execute: async (
			{ id, websiteId, confirmed, folderId, folderSlug, ...updates },
			options
		) => {
			const context = getAppContext(options);
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);
				const [currentLink, folders] = await Promise.all([
					callRPCProcedure(
						"links",
						"get",
						{ id, organizationId },
						context
					).then(parseLinkRow),
					listLinkFolders(context, organizationId),
				]);
				const folderSelection = hasLinkFolderSelector({
					folderId,
					folderSlug,
				})
					? resolveLinkFolderFromList(folders, {
							folderId,
							folderSlug,
						})
					: { folder: null, folderId: undefined, folders, ok: true as const };
				if (!folderSelection.ok) {
					return {
						success: false,
						message: folderSelection.message,
						folders: summarizeLinkFoldersWithUsage(folderSelection.folders, []),
					};
				}

				const currentFolder =
					folders.find((folder) => folder.id === currentLink.folderId) ?? null;

				const changes: string[] = [];
				if (updates.name && updates.name !== currentLink.name) {
					changes.push(`Name: "${currentLink.name}" → "${updates.name}"`);
				}
				if (updates.targetUrl && updates.targetUrl !== currentLink.targetUrl) {
					changes.push(
						`Target: ${currentLink.targetUrl} → ${updates.targetUrl}`
					);
				}
				if (updates.slug && updates.slug !== currentLink.slug) {
					changes.push(`Slug: /${currentLink.slug} → /${updates.slug}`);
				}
				if (updates.expiresAt !== undefined) {
					const oldExpires = currentLink.expiresAt
						? dayjs(currentLink.expiresAt).format("MMM D, YYYY")
						: "Never";
					const newExpires = updates.expiresAt
						? dayjs(updates.expiresAt).format("MMM D, YYYY")
						: "Never";
					if (oldExpires !== newExpires) {
						changes.push(`Expires: ${oldExpires} → ${newExpires}`);
					}
				}
				if (
					updates.externalId !== undefined &&
					updates.externalId !== currentLink.externalId
				) {
					changes.push(
						`External ID: ${currentLink.externalId ?? "None"} → ${updates.externalId ?? "None"}`
					);
				}
				if (
					folderSelection.folderId !== undefined &&
					folderSelection.folderId !== currentLink.folderId
				) {
					changes.push(
						`Folder: ${currentFolder?.name ?? "Unfiled"} → ${folderSelection.folder?.name ?? "Unfiled"}`
					);
				}

				if (!confirmed) {
					return {
						preview: true,
						message: `Please review the changes to "${currentLink.name}":`,
						currentLink: {
							name: currentLink.name,
							slug: currentLink.slug,
							targetUrl: currentLink.targetUrl,
							folder: currentFolder
								? summarizeLinkFolder(currentFolder)
								: "Unfiled",
						},
						changes: changes.length > 0 ? changes : ["No changes detected"],
						availableFolders: folders.map(summarizeLinkFolder),
						confirmationRequired: true,
						instruction:
							"To apply these changes, the user must explicitly confirm. Only then call this tool again with confirmed=true.",
					};
				}

				const cleanUpdates = Object.fromEntries(
					Object.entries(updates).filter(([, value]) => value !== undefined)
				);
				if (folderSelection.folderId !== undefined) {
					cleanUpdates.folderId = folderSelection.folderId;
				}

				const updatedLink = parseLinkRow(
					await callRPCProcedure(
						"links",
						"update",
						{ id, ...cleanUpdates },
						context
					)
				);

				return {
					success: true,
					message: `Link "${updatedLink.name}" updated successfully!`,
					link: summarizeLink(updatedLink, folderSelection.folders),
					changes,
				};
			} catch (error) {
				logger.error("Failed to update link", { id, websiteId, error });
				throw error instanceof Error
					? error
					: new Error("Failed to update link. Please try again.");
			}
		},
	});

	const deleteLinkTool = tool({
		description: "Delete a short link. Cannot be undone.",
		inputSchema: z.object({
			id: z.string(),
			websiteId: z.string(),
			confirmed: z.boolean().describe("false=preview, true=delete"),
		}),
		execute: async ({ id, websiteId, confirmed }, options) => {
			const context = getAppContext(options);
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);

				const link = parseLinkRow(
					await callRPCProcedure(
						"links",
						"get",
						{ id, organizationId },
						context
					)
				);

				if (!confirmed) {
					return {
						preview: true,
						message:
							"Are you sure you want to delete this link? This cannot be undone.",
						link: {
							name: link.name,
							slug: link.slug,
							targetUrl: link.targetUrl,
						},
						confirmationRequired: true,
						instruction:
							"To delete this link, the user must explicitly confirm (e.g., 'yes, delete it'). Only then call this tool again with confirmed=true.",
					};
				}

				await callRPCProcedure("links", "delete", { id }, context);

				return {
					success: true,
					message: `Link "${link.name}" (/${link.slug}) has been deleted.`,
				};
			} catch (error) {
				logger.error("Failed to delete link", { id, websiteId, error });
				throw error instanceof Error
					? error
					: new Error("Failed to delete link. Please try again.");
			}
		},
	});

	return {
		list_link_folders: listLinkFoldersTool,
		list_links: listLinksTool,
		create_link: createLinkTool,
		update_link: updateLinkTool,
		delete_link: deleteLinkTool,
	} as const;
}
