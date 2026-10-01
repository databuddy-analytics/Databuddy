import { aiActiveWebsitesQuery, executeQuery } from "@databuddy/ai/query";
import {
	aiDigestUnsubscribeToken,
	and,
	db,
	eq,
	isNull,
	member,
	normalizeEmailNotificationSettings,
	organization,
	user,
	websites,
} from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import { type AiDigestEmailProps, renderAiDigestEmail } from "@databuddy/email";
import { config } from "@databuddy/env/app";
import {
	AI_DIGEST_WEBSITE_JOB_NAME,
	type AiDigestWebsiteJobData,
	aiDigestJobId,
	getInsightsQueue,
} from "@databuddy/redis";
import {
	type AgentPurpose,
	aiProductIcon,
	CONTENT_FORMATS,
} from "@databuddy/shared/bot-detection/types";
import { numberField, stringField } from "./detection";
import { setInsightsLog } from "./lib/evlog-insights";

const DAY_MS = 86_400_000;
const PRODUCT_ROWS = 5;
const PAGE_ROWS = 3;
const LANDING_ROWS = 3;
const MIN_READS_WITHOUT_VISITORS = 10;

const ROLES: Record<string, string> = {
	agent: "AI agent",
	search_index: "Search crawler",
	training: "Trains AI models",
	user_fetch: "Answers questions",
} satisfies Record<AgentPurpose, string>;

function logOutcome(outcome: {
	reason?: string;
	status: "dispatched" | "sent" | "skipped";
	websites?: number;
}) {
	setInsightsLog({
		ai_digest_reason: outcome.reason,
		ai_digest_status: outcome.status,
		ai_digest_websites: outcome.websites,
	});
	return outcome;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function previousWeekStart(now: Date): string {
	const daysSinceMonday = (now.getUTCDay() + 6) % 7;
	return isoDay(now.getTime() - (daysSinceMonday + 7) * DAY_MS);
}

function weekRange(weekStart: string) {
	const start = Date.parse(`${weekStart}T00:00:00Z`);
	return {
		from: weekStart,
		to: isoDay(start + 6 * DAY_MS),
		until: isoDay(start + 7 * DAY_MS),
	};
}

function periodLabel({ from, to }: { from: string; to: string }): string {
	const formatDay = (day: string, month?: "short") =>
		new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
			day: "numeric",
			month,
			timeZone: "UTC",
		});
	const isSameMonth = from.slice(0, 7) === to.slice(0, 7);
	return `${formatDay(from, "short")} to ${formatDay(to, isSameMonth ? undefined : "short")}`;
}

function trackedDashboardUrl(path: string): string {
	const url = new URL(`${config.urls.dashboard}${path}`);
	url.searchParams.set("utm_source", "databuddy");
	url.searchParams.set("utm_medium", "email");
	url.searchParams.set("utm_campaign", "ai_digest");
	return url.toString();
}

function productLogoUrl(product: string | null): string | undefined {
	const icon = aiProductIcon(product ?? "");
	return icon ? `${config.urls.dashboard}/ai/email/${icon}.png` : undefined;
}

function unsubscribeHeaders(
	organizationId: string,
	settingsUrl: string
): Record<string, string> {
	const secret = process.env.DATABUDDY_ENCRYPTION_KEY;
	const url = new URL(
		"/public/v1/email-unsubscribe/ai-digest",
		config.urls.api
	);
	if (!secret || url.protocol !== "https:") {
		return { "List-Unsubscribe": `<${settingsUrl}>` };
	}
	url.searchParams.set("organization", organizationId);
	url.searchParams.set(
		"token",
		aiDigestUnsubscribeToken(organizationId, secret)
	);
	return {
		"List-Unsubscribe": `<${url}>`,
		"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
	};
}

function digestSubject({
	products,
	reads,
	site,
	visitors,
}: AiDigestEmailProps): string {
	if (visitors === 0) {
		return `AI read ${site} ${reads.toLocaleString("en-US")} times this week`;
	}
	const senders = products.filter((product) => product.visitors > 0);
	const sender = senders.length === 1 ? senders[0]?.name : "AI";
	return `${sender} sent ${visitors.toLocaleString("en-US")} ${visitors === 1 ? "visitor" : "visitors"} to ${site} this week`;
}

export async function dispatchAiDigests(now = new Date()) {
	if (!config.email.resendApiKey) {
		return logOutcome({ reason: "email_not_configured", status: "skipped" });
	}
	const week = weekRange(previousWeekStart(now));
	const { sql, params } = aiActiveWebsitesQuery(week.from, week.until);
	const sites = await chQuery<{ client_id: string }>(sql, params);
	await getInsightsQueue().addBulk(
		sites.map((site) => ({
			name: AI_DIGEST_WEBSITE_JOB_NAME,
			data: { websiteId: site.client_id, weekStart: week.from },
			opts: { jobId: aiDigestJobId(week.from, site.client_id) },
		}))
	);
	return logOutcome({ status: "dispatched", websites: sites.length });
}

async function buildAiDigest(
	websiteId: string,
	organizationId: string,
	domain: string,
	weekStart: string
): Promise<AiDigestEmailProps | null> {
	const week = weekRange(weekStart);
	const query = (type: string, limit: number) =>
		executeQuery(
			{
				from: week.from,
				limit,
				projectId: websiteId,
				timezone: "UTC",
				to: week.to,
				type,
			},
			domain,
			"UTC"
		);
	const [digest, landing, agentPages] = await Promise.all([
		query("ai_weekly_digest", 50),
		query("ai_landing_pages", LANDING_ROWS),
		query("ai_agent_pages", 30),
	]);

	const products = digest
		.map((row) => ({
			name: stringField(row, "product") ?? "",
			reads: numberField(row, "requests"),
			role: ROLES[stringField(row, "purpose") ?? ""] ?? "Sends visitors",
			visitors: numberField(row, "visitors"),
		}))
		.filter((product) => product.reads + product.visitors > 0)
		.sort((a, b) => b.visitors - a.visitors || b.reads - a.reads);
	const [siteTotals] = digest;
	const visitors = numberField(siteTotals, "site_visitors");
	const reads = products.reduce((sum, product) => sum + product.reads, 0);
	if (visitors === 0 && reads < MIN_READS_WITHOUT_VISITORS) {
		return null;
	}

	const rankedPages = agentPages
		.map((row) => ({
			format: CONTENT_FORMATS.find((format) => format === row.format) ?? "html",
			page: stringField(row, "page") ?? "",
			reads: numberField(row, "requests"),
		}))
		.sort((a, b) => b.reads - a.reads);
	const topNonHtmlPage = rankedPages.find((page) => page.format !== "html");
	const newPages = siteTotals?.site_new_pages;

	return {
		agentsUrl: trackedDashboardUrl(`/websites/${websiteId}/agents`),
		hasServerTracking: numberField(siteTotals, "site_has_server_tracking") > 0,
		landingPages: landing.map((row) => {
			const [sender] = Array.isArray(row.senders) ? row.senders : [];
			return {
				logoUrl: productLogoUrl(stringField(sender, "product")),
				page: stringField(row, "page") ?? "",
				visitors: numberField(row, "visitors"),
			};
		}),
		newPages: typeof newPages === "number" ? newPages : null,
		pages: rankedPages.filter(
			(page, index) => index < PAGE_ROWS || page === topNonHtmlPage
		),
		period: periodLabel(week),
		previousVisitors: numberField(siteTotals, "site_previous_visitors"),
		products: products.slice(0, PRODUCT_ROWS).map((product) => ({
			...product,
			logoUrl: productLogoUrl(product.name),
		})),
		reads,
		settingsUrl: trackedDashboardUrl(
			`/settings/notifications?organization=${organizationId}`
		),
		site: domain,
		visitors,
	};
}

export async function sendAiDigest({
	websiteId,
	weekStart,
}: AiDigestWebsiteJobData) {
	const apiKey = config.email.resendApiKey;
	if (!apiKey) {
		return logOutcome({ reason: "email_not_configured", status: "skipped" });
	}
	const owners = await db
		.select({
			domain: websites.domain,
			emailNotifications: organization.emailNotifications,
			organizationId: websites.organizationId,
			ownerEmail: user.email,
		})
		.from(websites)
		.innerJoin(organization, eq(organization.id, websites.organizationId))
		.innerJoin(
			member,
			and(
				eq(member.organizationId, websites.organizationId),
				eq(member.role, "owner")
			)
		)
		.innerJoin(user, eq(user.id, member.userId))
		.where(and(eq(websites.id, websiteId), isNull(websites.deletedAt)));
	const [site] = owners;
	if (!site) {
		return logOutcome({
			reason: "website_or_owner_missing",
			status: "skipped",
		});
	}
	if (
		!normalizeEmailNotificationSettings(site.emailNotifications).aiAgents
			.weeklyDigest
	) {
		return logOutcome({ reason: "disabled", status: "skipped" });
	}

	const digest = await buildAiDigest(
		websiteId,
		site.organizationId,
		site.domain,
		weekStart
	);
	if (!digest) {
		return logOutcome({ reason: "quiet_week", status: "skipped" });
	}

	const { html, text } = await renderAiDigestEmail(digest);
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"Idempotency-Key": aiDigestJobId(weekStart, websiteId),
		},
		body: JSON.stringify({
			from: config.email.from,
			headers: unsubscribeHeaders(site.organizationId, digest.settingsUrl),
			html,
			subject: digestSubject(digest),
			text,
			to: owners.map((owner) => owner.ownerEmail),
		}),
	});
	if (!response.ok) {
		const error: { name?: string } | null = await response
			.json()
			.catch(() => null);
		if (error?.name === "invalid_idempotent_request") {
			return logOutcome({ reason: "already_sent", status: "skipped" });
		}
		throw new Error(
			`Resend AI digest failed: ${response.status} ${error?.name ?? ""}`
		);
	}
	return logOutcome({ status: "sent" });
}
