import type { AppContext } from "../../config/context";

export function getAppContext(options: {
	experimental_context?: unknown;
}): AppContext {
	const ctx = options.experimental_context;
	if (!ctx || typeof ctx !== "object") {
		throw new Error(
			"Tool requires app context. Ensure experimental_context is passed to the agent."
		);
	}
	return ctx as AppContext;
}

export interface ResolvedWebsite {
	domain?: string;
	websiteId: string;
}

export function resolveToolWebsite(
	ctx: AppContext,
	inputWebsiteId?: string | null
): ResolvedWebsite {
	const accessible = ctx.accessibleWebsites ?? [];
	const domainFor = (id: string): string | undefined =>
		accessible.find((w) => w.id === id)?.domain ??
		(id === ctx.websiteId ? ctx.websiteDomain : undefined);

	if (inputWebsiteId) {
		const isAccessible =
			accessible.some((w) => w.id === inputWebsiteId) ||
			inputWebsiteId === ctx.websiteId;
		if (!isAccessible) {
			throw new Error(
				`Website "${inputWebsiteId}" is not in this workspace. Call list_websites to see available websites.`
			);
		}
		return { websiteId: inputWebsiteId, domain: domainFor(inputWebsiteId) };
	}

	const fallbackId = ctx.defaultWebsiteId ?? ctx.websiteId;
	if (fallbackId) {
		return { websiteId: fallbackId, domain: domainFor(fallbackId) };
	}

	const [only] = accessible;
	if (accessible.length === 1 && only) {
		return { websiteId: only.id, domain: only.domain ?? undefined };
	}

	throw new Error(
		"No website specified. This workspace has multiple websites — pass a websiteId for this query. Call list_websites to see the options."
	);
}
