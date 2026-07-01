import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import type { PreResolvedAuth } from "@databuddy/rpc";
import type { WebsiteSummary } from "../../lib/accessible-websites";

export type AppMutationMode = "allow" | "dry-run";

export type ServiceAuth = PreResolvedAuth;

export interface AppContext {
	accessibleWebsites?: WebsiteSummary[];
	apiKey?: ApiKeyRow | null;
	billingCustomerId?: string | null;
	chatId: string;
	currentDateTime: string;
	defaultWebsiteId?: string | null;
	mutationMode?: AppMutationMode;
	organizationId?: string | null;
	requestHeaders?: Headers;
	serviceAuth?: ServiceAuth;
	timezone: string;
	userId: string;
	websiteDomain?: string;
	websiteId?: string;
	[key: string]: unknown;
}

export function requireWebsiteId(context: AppContext): string {
	const websiteId = context.defaultWebsiteId ?? context.websiteId;
	if (!websiteId) {
		throw new Error("This operation requires a website in context.");
	}
	return websiteId;
}

function escapeAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function formatContextForLLM(context: AppContext): string {
	const lines = [
		`<current_date>${context.currentDateTime}</current_date>`,
		`<timezone>${context.timezone}</timezone>`,
	];

	const websites = context.accessibleWebsites ?? [];
	if (websites.length > 0) {
		const rows = websites
			.map((w) => {
				const domain = w.domain ? ` domain="${escapeAttr(w.domain)}"` : "";
				const name = w.name ? ` name="${escapeAttr(w.name)}"` : "";
				return `  <website id="${escapeAttr(w.id)}"${domain}${name} />`;
			})
			.join("\n");
		lines.push(`<accessible_websites>\n${rows}\n</accessible_websites>`);
	}

	const defaultId = context.defaultWebsiteId ?? context.websiteId;
	if (defaultId) {
		lines.push(`<default_website_id>${defaultId}</default_website_id>`);
		if (context.websiteDomain) {
			lines.push(
				`<default_website_domain>${context.websiteDomain}</default_website_domain>`
			);
		}
	}

	return `<website_info>\n${lines.join("\n")}\n</website_info>`;
}
