import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import { getCachedWebsite } from "../../lib/website-utils";
import type { AppContext } from "../config/context";
import { callRPCProcedure, createToolLogger } from "./utils";

const logger = createToolLogger("Links Tools");

const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

interface LinkData {
	id: string;
	slug: string;
	name: string;
	targetUrl: string;
	organizationId: string;
	createdAt: string;
	updatedAt: string;
	expiresAt: string | null;
	expiredRedirectUrl: string | null;
	ogTitle: string | null;
	ogDescription: string | null;
	ogImageUrl: string | null;
	clickCount?: number;
}

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

function formatLinkForDisplay(link: LinkData, baseUrl?: string): string {
	const shortUrl = baseUrl ? `${baseUrl}/${link.slug}` : link.slug;
	const expiresInfo = link.expiresAt
		? `Expires: ${dayjs(link.expiresAt).format("MMM D, YYYY")}`
		: "No expiration";

	return `- **${link.name}** (${shortUrl})
  Target: ${link.targetUrl}
  ${expiresInfo}${link.clickCount !== undefined ? ` | Clicks: ${link.clickCount}` : ""}`;
}

export function createLinksTools(context: AppContext) {
	const listLinksTool = tool({
		description:
			"List all short links for the current website's organization. Returns links with their slugs, target URLs, and metadata.",
		inputSchema: z.object({
			websiteId: z.string().describe("The website ID to get links for"),
		}),
		execute: async ({ websiteId }) => {
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);

				const result = (await callRPCProcedure(
					"links",
					"list",
					{ organizationId },
					context
				)) as LinkData[];

				const links = Array.isArray(result) ? result : [];

				return {
					links: links.map((link) => ({
						id: link.id,
						name: link.name,
						slug: link.slug,
						targetUrl: link.targetUrl,
						expiresAt: link.expiresAt,
						createdAt: link.createdAt,
						ogTitle: link.ogTitle,
						ogDescription: link.ogDescription,
					})),
					count: links.length,
					summary:
						links.length === 0
							? "No links found for this organization."
							: `Found ${links.length} link${links.length === 1 ? "" : "s"}:\n${links.map((l) => formatLinkForDisplay(l)).join("\n")}`,
				};
			} catch (error) {
				logger.error("Failed to list links", { websiteId, error });
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve links. Please try again.");
			}
		},
	});

	const getLinkTool = tool({
		description:
			"Get details of a specific short link by ID. Returns full link information including OG metadata.",
		inputSchema: z.object({
			id: z.string().describe("The link ID"),
			websiteId: z.string().describe("The website ID"),
		}),
		execute: async ({ id, websiteId }) => {
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);

				const link = (await callRPCProcedure(
					"links",
					"get",
					{ id, organizationId },
					context
				)) as LinkData;

				return {
					link,
					summary: `**${link.name}**
- Short URL: /${link.slug}
- Target: ${link.targetUrl}
- Created: ${dayjs(link.createdAt).format("MMM D, YYYY")}
- Expires: ${link.expiresAt ? dayjs(link.expiresAt).format("MMM D, YYYY") : "Never"}
${link.ogTitle ? `- OG Title: ${link.ogTitle}` : ""}
${link.ogDescription ? `- OG Description: ${link.ogDescription}` : ""}`,
				};
			} catch (error) {
				logger.error("Failed to get link", { id, websiteId, error });
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve link. Please try again.");
			}
		},
	});

	const createLinkTool = tool({
		description:
			"Create a new short link. REQUIRES EXPLICIT USER CONFIRMATION before creating. Always show a preview first and ask the user to confirm before setting confirmed=true.",
		inputSchema: z.object({
			websiteId: z.string().describe("The website ID"),
			name: z
				.string()
				.min(1)
				.max(255)
				.describe(
					"A descriptive name for the link (e.g., 'Black Friday Sale')"
				),
			targetUrl: z
				.string()
				.url()
				.describe("The destination URL to redirect to"),
			slug: z
				.string()
				.min(3)
				.max(50)
				.regex(SLUG_REGEX)
				.optional()
				.describe(
					"Custom short URL slug (e.g., 'sale' creates /sale). Auto-generated if not provided."
				),
			expiresAt: z
				.string()
				.optional()
				.describe("Expiration date in ISO format (e.g., 2024-12-31)"),
			expiredRedirectUrl: z
				.string()
				.url()
				.optional()
				.describe("URL to redirect to after the link expires"),
			ogTitle: z
				.string()
				.max(200)
				.optional()
				.describe("Custom Open Graph title for social sharing"),
			ogDescription: z
				.string()
				.max(500)
				.optional()
				.describe("Custom Open Graph description for social sharing"),
			ogImageUrl: z
				.string()
				.url()
				.optional()
				.describe("Custom Open Graph image URL for social sharing"),
			confirmed: z
				.boolean()
				.describe(
					"CRITICAL: Must be false initially. Only set to true after user explicitly confirms. When false, returns a preview and asks for confirmation."
				),
		}),
		execute: async ({
			websiteId,
			name,
			targetUrl,
			slug,
			expiresAt,
			expiredRedirectUrl,
			ogTitle,
			ogDescription,
			ogImageUrl,
			confirmed,
		}) => {
			try {
				// If not confirmed, return preview and ask for confirmation
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
						},
						confirmationRequired: true,
						instruction:
							"To create this link, the user must explicitly confirm (e.g., 'yes', 'create it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

				const organizationId = await getOrganizationIdFromWebsite(websiteId);

				const newLink = (await callRPCProcedure(
					"links",
					"create",
					{
						organizationId,
						name,
						targetUrl,
						slug,
						expiresAt: expiresAt ? new Date(expiresAt) : null,
						expiredRedirectUrl: expiredRedirectUrl ?? null,
						ogTitle: ogTitle ?? null,
						ogDescription: ogDescription ?? null,
						ogImageUrl: ogImageUrl ?? null,
					},
					context
				)) as LinkData;

				return {
					success: true,
					message: `Link "${name}" created successfully!`,
					link: newLink,
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
		description:
			"Update an existing short link. REQUIRES EXPLICIT USER CONFIRMATION before updating. Always show a preview of changes first.",
		inputSchema: z.object({
			id: z.string().describe("The link ID to update"),
			websiteId: z.string().describe("The website ID"),
			name: z.string().min(1).max(255).optional().describe("New name"),
			targetUrl: z.string().url().optional().describe("New target URL"),
			slug: z
				.string()
				.min(3)
				.max(50)
				.regex(SLUG_REGEX)
				.optional()
				.describe("New slug"),
			expiresAt: z
				.string()
				.datetime()
				.nullable()
				.optional()
				.describe("New expiration date (null to remove)"),
			expiredRedirectUrl: z
				.string()
				.url()
				.nullable()
				.optional()
				.describe("New expired redirect URL"),
			ogTitle: z
				.string()
				.max(200)
				.nullable()
				.optional()
				.describe("New OG title"),
			ogDescription: z
				.string()
				.max(500)
				.nullable()
				.optional()
				.describe("New OG description"),
			ogImageUrl: z
				.string()
				.url()
				.nullable()
				.optional()
				.describe("New OG image URL"),
			confirmed: z
				.boolean()
				.describe(
					"CRITICAL: Must be false initially. Only set to true after user explicitly confirms."
				),
		}),
		execute: async ({ id, websiteId, confirmed, ...updates }) => {
			try {
				// First, get the current link
				const organizationId = await getOrganizationIdFromWebsite(websiteId);
				const currentLink = (await callRPCProcedure(
					"links",
					"get",
					{ id, organizationId },
					context
				)) as LinkData;

				// Build preview of changes
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

				if (!confirmed) {
					return {
						preview: true,
						message: `Please review the changes to "${currentLink.name}":`,
						currentLink: {
							name: currentLink.name,
							slug: currentLink.slug,
							targetUrl: currentLink.targetUrl,
						},
						changes: changes.length > 0 ? changes : ["No changes detected"],
						confirmationRequired: true,
						instruction:
							"To apply these changes, the user must explicitly confirm. Only then call this tool again with confirmed=true.",
					};
				}

				// Filter out undefined values
				const cleanUpdates = Object.fromEntries(
					Object.entries(updates).filter(([_, v]) => v !== undefined)
				);

				const updatedLink = (await callRPCProcedure(
					"links",
					"update",
					{ id, ...cleanUpdates },
					context
				)) as LinkData;

				return {
					success: true,
					message: `Link "${updatedLink.name}" updated successfully!`,
					link: updatedLink,
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
		description:
			"Delete a short link. REQUIRES EXPLICIT USER CONFIRMATION before deleting. This action cannot be undone.",
		inputSchema: z.object({
			id: z.string().describe("The link ID to delete"),
			websiteId: z.string().describe("The website ID"),
			confirmed: z
				.boolean()
				.describe(
					"CRITICAL: Must be false initially. Only set to true after user explicitly confirms deletion."
				),
		}),
		execute: async ({ id, websiteId, confirmed }) => {
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);

				// Get link details for confirmation
				const link = (await callRPCProcedure(
					"links",
					"get",
					{ id, organizationId },
					context
				)) as LinkData;

				if (!confirmed) {
					return {
						preview: true,
						message:
							"⚠️ Are you sure you want to delete this link? This cannot be undone.",
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

	const searchLinksTool = tool({
		description:
			"Search for links by name, slug, or target URL. Useful for finding specific links.",
		inputSchema: z.object({
			websiteId: z.string().describe("The website ID"),
			query: z
				.string()
				.min(1)
				.describe("Search query (matches name, slug, or target URL)"),
		}),
		execute: async ({ websiteId, query }) => {
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);

				const allLinks = (await callRPCProcedure(
					"links",
					"list",
					{ organizationId },
					context
				)) as LinkData[];

				const queryLower = query.toLowerCase();
				const matches = allLinks.filter(
					(link) =>
						link.name.toLowerCase().includes(queryLower) ||
						link.slug.toLowerCase().includes(queryLower) ||
						link.targetUrl.toLowerCase().includes(queryLower)
				);

				return {
					links: matches.map((link) => ({
						id: link.id,
						name: link.name,
						slug: link.slug,
						targetUrl: link.targetUrl,
					})),
					count: matches.length,
					summary:
						matches.length === 0
							? `No links found matching "${query}".`
							: `Found ${matches.length} link${matches.length === 1 ? "" : "s"} matching "${query}":\n${matches.map((l) => formatLinkForDisplay(l)).join("\n")}`,
				};
			} catch (error) {
				logger.error("Failed to search links", { websiteId, query, error });
				throw error instanceof Error
					? error
					: new Error("Failed to search links. Please try again.");
			}
		},
	});

	return {
		list_links: listLinksTool,
		get_link: getLinkTool,
		create_link: createLinkTool,
		update_link: updateLinkTool,
		delete_link: deleteLinkTool,
		search_links: searchLinksTool,
	} as const;
}
