import { tool } from "ai";
import { z } from "zod";
import { getCachedWebsite } from "../../lib/website-utils";
import {
	countUnfiledLinks,
	createOrganizationLink,
	linkCreateFields,
	linkUpdateFields,
	listLinkFolders,
	listLinks,
	parseLinkRow,
	planLinkUpdate,
	readOrganizationLink,
	refineDeepLinkTarget,
	resolveLinkFolder,
	searchLinks,
	summarizeLink,
	summarizeLinkFolder,
	summarizeLinkFoldersWithUsage,
} from "./link-catalog";
import { callRPCProcedure, createToolLogger, getAppContext } from "./utils";

const logger = createToolLogger("Links Tools");

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
				const [folders, unfiledCount] = await Promise.all([
					listLinkFolders(context, organizationId),
					countUnfiledLinks(context, organizationId),
				]);

				return {
					folders: summarizeLinkFoldersWithUsage(folders),
					count: folders.length,
					unfiledCount,
					hint:
						folders.length === 0
							? "No link folders exist yet. Leave links unfiled unless the user creates a folder in Databuddy."
							: "Use folderId or folderSlug from this list. Do not invent new folders from the agent.",
				};
			} catch (error) {
				logger.error("Failed to list link folders", { websiteId, error });
				throw error;
			}
		},
	});

	const listLinksTool = tool({
		description:
			"List the newest short links and existing folders for the website org. Set search to find a specific link across the full catalog.",
		inputSchema: z.object({
			search: z.string().trim().min(1).max(255).optional(),
			websiteId: z.string(),
		}),
		execute: async ({ search, websiteId }, options) => {
			const context = getAppContext(options);
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);
				const [page, folders, unfiledCount] = await Promise.all([
					search
						? searchLinks(context, organizationId, search)
						: listLinks(context, organizationId),
					listLinkFolders(context, organizationId),
					search
						? Promise.resolve(null)
						: countUnfiledLinks(context, organizationId),
				]);
				const count = page.total ?? page.items.length;
				return {
					links: page.items.map((link) => summarizeLink(link, folders)),
					count,
					folders: summarizeLinkFoldersWithUsage(folders),
					unfiledCount:
						unfiledCount ?? page.items.filter((link) => !link.folderId).length,
					hint:
						page.hasMore || count > page.items.length
							? search
								? `Showing the ${page.items.length} newest matching links; more matches exist.`
								: `Showing the ${page.items.length} newest of ${count} links.`
							: undefined,
				};
			} catch (error) {
				logger.error("Failed to list links", { websiteId, error });
				throw error;
			}
		},
	});

	const createLinkTool = tool({
		description:
			"Create a short link. slug auto-generated if omitted. expiresAt is ISO date.",
		inputSchema: z
			.object({
				websiteId: z.string(),
				...linkCreateFields,
				confirmed: z.boolean().describe("false=preview, true=apply"),
			})
			.superRefine(refineDeepLinkTarget),
		execute: async ({ websiteId, confirmed, ...link }, options) => {
			const context = getAppContext(options);
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);
				const folderSelection = await resolveLinkFolder(
					context,
					organizationId,
					link
				);
				if (!folderSelection.ok) {
					return {
						success: false,
						message: folderSelection.message,
						folders: summarizeLinkFoldersWithUsage(folderSelection.folders),
					};
				}

				if (!confirmed) {
					return {
						preview: true,
						message:
							"Please review the link details below and confirm if you want to create it:",
						link: {
							name: link.name,
							targetUrl: link.targetUrl,
							slug: link.slug ?? "(auto-generated)",
							expiresAt: link.expiresAt ?? "Never",
							expiredRedirectUrl: link.expiredRedirectUrl ?? "None",
							ogTitle: link.ogTitle ?? "None",
							ogDescription: link.ogDescription ?? "None",
							ogImageUrl: link.ogImageUrl ?? "None",
							externalId: link.externalId ?? "None",
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

				const newLink = await createOrganizationLink(
					context,
					organizationId,
					link,
					folderSelection.folderId
				);

				return {
					success: true,
					message: `Link "${link.name}" created successfully!`,
					link: summarizeLink(newLink, folderSelection.folders),
					shortUrl: `/${newLink.slug}`,
				};
			} catch (error) {
				logger.error("Failed to create link", {
					websiteId,
					name: link.name,
					error,
				});
				throw error;
			}
		},
	});

	const updateLinkTool = tool({
		description: "Update a short link. Pass null to nullable fields to clear.",
		inputSchema: z.object({
			id: z.string(),
			websiteId: z.string(),
			...linkUpdateFields,
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		execute: async ({ id, websiteId, confirmed, ...input }, options) => {
			const context = getAppContext(options);
			try {
				const plan = await planLinkUpdate(
					context,
					await getOrganizationIdFromWebsite(websiteId),
					id,
					input
				);
				if (!plan.ok) {
					return {
						success: false,
						message: plan.message,
						folders: summarizeLinkFoldersWithUsage(plan.folders),
					};
				}
				const { current, folders, updates } = plan;
				const hasUpdates = Object.keys(updates).length > 0;

				if (!(confirmed && hasUpdates)) {
					return {
						preview: true,
						message: hasUpdates
							? `Please review the changes to "${current.name}":`
							: "No changes requested. The short link will remain unchanged.",
						currentLink: summarizeLink(current, folders),
						updates,
						availableFolders: folders.map(summarizeLinkFolder),
						confirmationRequired: hasUpdates,
						instruction: hasUpdates
							? "To apply these changes, the user must explicitly confirm. Only then call this tool again with confirmed=true."
							: undefined,
					};
				}

				const updatedLink = parseLinkRow(
					await callRPCProcedure("links", "update", { id, ...updates }, context)
				);

				return {
					success: true,
					message: `Link "${updatedLink.name}" updated successfully!`,
					link: summarizeLink(updatedLink, folders),
					updates,
				};
			} catch (error) {
				logger.error("Failed to update link", { id, websiteId, error });
				throw error;
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

				const link = await readOrganizationLink(context, organizationId, id);

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
				throw error;
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
