import { tool } from "ai";
import { z } from "zod";
import { getAppContext } from "./utils";

export const listWebsitesTool = tool({
	description:
		"List the websites in this workspace that you can query. Returns each website's id, name, and domain. Use a returned id as the websiteId for analytics tools when the workspace has more than one website or when the user names a specific site.",
	inputSchema: z.object({}),
	execute: (_args, options) => {
		const ctx = getAppContext(options);
		const websites = ctx.accessibleWebsites ?? [];
		return {
			websites: websites.map((w) => ({
				id: w.id,
				name: w.name,
				domain: w.domain,
			})),
			defaultWebsiteId: ctx.defaultWebsiteId ?? ctx.websiteId ?? null,
			count: websites.length,
		};
	},
});
