import { aiActiveWebsitesQuery, executeQuery } from "@databuddy/ai/query";
import {
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
import {
	AiDigestEmail,
	type AiDigestEmailProps,
	type AiDigestPage,
	render,
} from "@databuddy/email";
import { config } from "@databuddy/env/app";
import {
	AI_DIGEST_WEBSITE_JOB_NAME,
	type AiDigestWebsiteJobData,
	aiDigestJobId,
	getInsightsQueue,
} from "@databuddy/redis";
import { aiProductIcon } from "@databuddy/shared/bot-detection/types";
import { numberField, stringField } from "./detection";
import { setInsightsLog } from "./lib/evlog-insights";

const DAY_MS = 24 * 60 * 60 * 1000;
const PRODUCT_ROWS = 5;
const PAGE_ROWS = 3;
const LANDING_ROWS = 3;

const ROLES: Record<string, string> = {
	agent: "AI agent",
	search_index: "Search crawler",
	training: "Trains AI models",
	user_fetch: "Answers questions",
};

type Row = Record<string, unknown>;

interface DigestOutcome {
	reason?: string;
	status: "dispatched" | "sent" | "skipped";
	websites?: number;
}

function outcome(result: DigestOutcome): DigestOutcome {
	setInsightsLog({
		ai_digest_reason: result.reason,
		ai_digest_status: result.status,
		ai_digest_websites: result.websites,
	});
	return result;
}

interface DigestWeek {
	from: string;
	to: string;
	until: string;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function digestWeek(weekStart: string): DigestWeek {
	const start = Date.parse(`${weekStart}T00:00:00Z`);
	return {
		from: weekStart,
		to: isoDay(new Date(start + 6 * DAY_MS)),
		until: isoDay(new Date(start + 7 * DAY_MS)),
	};
}

function previousWeekStart(now: Date): string {
	const today = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate()
	);
	const daysSinceMonday = (now.getUTCDay() + 6) % 7;
	return isoDay(new Date(today - (daysSinceMonday + 7) * DAY_MS));
}

function periodLabel(week: DigestWeek): string {
	const format = (day: string, options: Intl.DateTimeFormatOptions) =>
		new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
			...options,
			timeZone: "UTC",
		});
	const sameMonth = week.from.slice(0, 7) === week.to.slice(0, 7);
	return `${format(week.from, { day: "numeric", month: "short" })} to ${format(
		week.to,
		sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" }
	)}`;
}

const logoUrl = (product: string) => {
	const icon = aiProductIcon(product);
	return icon ? `${config.urls.dashboard}/ai/email/${icon}.png` : undefined;
};

export async function dispatchAiDigests(now = new Date()) {
	if (!config.email.resendApiKey) {
		return outcome({ reason: "email_not_configured", status: "skipped" });
	}
	const week = digestWeek(previousWeekStart(now));
	const { sql, params } = aiActiveWebsitesQuery(
		`${week.from} 00:00:00`,
		`${week.until} 00:00:00`
	);
	const sites = await chQuery<{ client_id: string }>(sql, params);
	await getInsightsQueue().addBulk(
		sites.map((site) => ({
			name: AI_DIGEST_WEBSITE_JOB_NAME,
			data: { websiteId: site.client_id, weekStart: week.from },
			opts: { jobId: aiDigestJobId(week.from, site.client_id) },
		}))
	);
	return outcome({ status: "dispatched", websites: sites.length });
}

async function buildAiDigest(
	websiteId: string,
	domain: string,
	weekStart: string
): Promise<AiDigestEmailProps | null> {
	const week = digestWeek(weekStart);
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
		) as Promise<Row[]>;
	const [digest, crawlers, landing, reads] = await Promise.all([
		query("ai_weekly_digest", 50),
		query("ai_crawlers", 100),
		query("ai_landing_pages", LANDING_ROWS),
		query("ai_agent_pages", 30),
	]);

	const visitors = numberField(digest[0], "site_visitors");
	const readCount = digest.reduce(
		(sum, row) => sum + numberField(row, "requests"),
		0
	);
	if (visitors === 0 && readCount === 0) {
		return null;
	}

	const purposeByProduct = new Map<string, string>();
	for (const crawler of crawlers) {
		const product = stringField(crawler, "product");
		if (product && !purposeByProduct.has(product)) {
			purposeByProduct.set(product, stringField(crawler, "purpose") ?? "");
		}
	}

	const pageRows = reads
		.map((row) => ({
			format: (stringField(row, "format") ?? "html") as AiDigestPage["format"],
			page: stringField(row, "page") ?? "",
			reads: numberField(row, "requests"),
		}))
		.filter((row) => row.page && row.page !== "/robots.txt")
		.sort((a, b) => b.reads - a.reads);
	const pages = pageRows.slice(0, PAGE_ROWS);
	const agentReadPage = pageRows.find((row) => row.format !== "html");
	if (agentReadPage && !pages.includes(agentReadPage)) {
		pages.push(agentReadPage);
	}

	return {
		agentsUrl: `${config.urls.dashboard}/websites/${websiteId}/agents`,
		landingPages: landing.map((row) => {
			const senders = Array.isArray(row.senders) ? (row.senders as Row[]) : [];
			const sender = stringField(senders[0], "product");
			return {
				logoUrl: sender ? logoUrl(sender) : undefined,
				page: stringField(row, "page") ?? "",
				visitors: numberField(row, "visitors"),
			};
		}),
		newPages: numberField(digest[0], "site_new_pages"),
		pages,
		period: periodLabel(week),
		previousVisitors: numberField(digest[0], "site_previous_visitors"),
		products: digest
			.filter(
				(row) => numberField(row, "requests") + numberField(row, "visitors") > 0
			)
			.sort(
				(a, b) =>
					numberField(b, "visitors") - numberField(a, "visitors") ||
					numberField(b, "requests") - numberField(a, "requests")
			)
			.slice(0, PRODUCT_ROWS)
			.map((row) => {
				const name = stringField(row, "product") ?? "";
				return {
					logoUrl: logoUrl(name),
					name,
					reads: numberField(row, "requests"),
					role: ROLES[purposeByProduct.get(name) ?? ""] ?? "Sends visitors",
					visitors: numberField(row, "visitors"),
				};
			}),
		reads: readCount,
		settingsUrl: `${config.urls.dashboard}/settings/notifications`,
		site: domain,
		visitors,
	};
}

function digestSubject(digest: AiDigestEmailProps): string {
	const senders = digest.products.filter((product) => product.visitors > 0);
	const visitors = `${digest.visitors.toLocaleString("en-US")} ${digest.visitors === 1 ? "visitor" : "visitors"}`;
	if (senders.length === 1) {
		return `${senders[0]?.name} sent ${visitors} to ${digest.site} this week`;
	}
	if (digest.visitors > 0) {
		return `AI sent ${visitors} to ${digest.site} this week`;
	}
	return `AI read ${digest.site} ${digest.reads.toLocaleString("en-US")} times this week`;
}

export async function sendAiDigest({
	websiteId,
	weekStart,
}: AiDigestWebsiteJobData) {
	const apiKey = config.email.resendApiKey;
	if (!apiKey) {
		return outcome({ reason: "email_not_configured", status: "skipped" });
	}
	const owners = await db
		.select({
			domain: websites.domain,
			emailNotifications: organization.emailNotifications,
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
	const site = owners[0];
	if (!site) {
		return outcome({ reason: "website_or_owner_missing", status: "skipped" });
	}
	if (
		!normalizeEmailNotificationSettings(site.emailNotifications).aiAgents
			.weeklyDigest
	) {
		return outcome({ reason: "disabled", status: "skipped" });
	}

	const digest = await buildAiDigest(websiteId, site.domain, weekStart);
	if (!digest) {
		return outcome({ reason: "no_activity", status: "skipped" });
	}

	const email = AiDigestEmail(digest);
	const [html, text] = await Promise.all([
		render(email),
		render(email, { plainText: true }),
	]);
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"Idempotency-Key": aiDigestJobId(weekStart, websiteId),
		},
		body: JSON.stringify({
			from: config.email.from,
			headers: { "List-Unsubscribe": `<${digest.settingsUrl}>` },
			html,
			subject: digestSubject(digest),
			text,
			to: owners.map((owner) => owner.ownerEmail),
		}),
	});
	if (!response.ok) {
		const error = (await response.json().catch(() => null)) as {
			name?: string;
		} | null;
		if (error?.name === "invalid_idempotent_request") {
			return outcome({ reason: "already_sent", status: "skipped" });
		}
		throw new Error(
			`Resend AI digest failed: ${response.status} ${error?.name ?? ""}`
		);
	}
	return outcome({ status: "sent" });
}
