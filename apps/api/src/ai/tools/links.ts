import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import { getCachedWebsite } from "../../lib/website-utils";
import { callRPCProcedure, createToolLogger, getAppContext } from "./utils";

const logger = createToolLogger("Links Tools");

const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

interface LinkData {
	clickCount?: number;
	createdAt: string;
	expiredRedirectUrl: string | null;
	expiresAt: string | null;
	externalId: string | null;
	id: string;
	name: string;
	ogDescription: string | null;
	ogImageUrl: string | null;
	ogTitle: string | null;
	organizationId: string;
	slug: string;
	targetUrl: string;
	updatedAt: string;
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

export function createLinksTools() {
	const listLinksTool = tool({
		description:
			"List short links for the website org (slug, target URL, metadata).",
		inputSchema: z.object({ websiteId: z.string() }),
		execute: async ({ websiteId }, options) => {
			const context = getAppContext(options);
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
						externalId: link.externalId,
						expiresAt: link.expiresAt,
						createdAt: link.createdAt,
						ogTitle: link.ogTitle,
						ogDescription: link.ogDescription,
					})),
					count: links.length,
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
				confirmed,
			},
			options
		) => {
			const context = getAppContext(options);
			try {
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
						externalId: externalId ?? null,
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
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		execute: async ({ id, websiteId, confirmed, ...updates }, options) => {
			const context = getAppContext(options);
			try {
				const organizationId = await getOrganizationIdFromWebsite(websiteId);
				const currentLink = (await callRPCProcedure(
					"links",
					"get",
					{ id, organizationId },
					context
				)) as LinkData;

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

	return {
		list_links: listLinksTool,
		create_link: createLinkTool,
		update_link: updateLinkTool,
		delete_link: deleteLinkTool,
	} as const;
}
