import { and, chQuery, db, eq, member, user } from "@databuddy/db";
import { UptimeAlertEmail } from "@databuddy/email";
import { Resend } from "resend";
import type { ScheduleData } from "./actions";
import { captureError } from "./lib/tracing";
import { MonitorStatus, type UptimeData } from "./types";

const TRAILING_SLASH = /\/$/;

function buildSiteLabel(schedule: ScheduleData): string {
	const w = schedule.website;
	if (w?.name) {
		return w.name;
	}
	if (w?.domain) {
		return w.domain;
	}
	if (schedule.name) {
		return schedule.name;
	}
	try {
		return new URL(schedule.url).hostname;
	} catch {
		return schedule.url;
	}
}

function resolveTransitionKind(
	previous: number | undefined,
	current: number
): "down" | "recovered" | null {
	if (current === MonitorStatus.UP) {
		if (previous === MonitorStatus.DOWN) {
			return "recovered";
		}
		return null;
	}
	if (current === MonitorStatus.DOWN) {
		if (previous === MonitorStatus.DOWN) {
			return null;
		}
		return "down";
	}
	return null;
}

async function getVerifiedOrgMemberEmails(
	organizationId: string
): Promise<string[]> {
	const rows = await db
		.select({ email: user.email })
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(user.emailVerified, true)
			)
		);
	const set = new Set<string>();
	for (const r of rows) {
		if (r.email.includes("@")) {
			set.add(r.email);
		}
	}
	return [...set];
}

export async function getPreviousMonitorStatus(
	siteId: string
): Promise<number | undefined> {
	if (!process.env.CLICKHOUSE_URL) {
		return undefined;
	}
	try {
		const rows = await chQuery<{ status: number }>(
			`SELECT status
       FROM uptime.uptime_monitor
       WHERE site_id = {siteId:String}
       ORDER BY timestamp DESC
       LIMIT 1`,
			{ siteId }
		);
		const row = rows[0];
		if (row === undefined) {
			return undefined;
		}
		return row.status;
	} catch (error) {
		captureError(error, { error_step: "clickhouse_previous_status" });
		return undefined;
	}
}

export async function sendUptimeTransitionEmailsIfNeeded(options: {
	schedule: ScheduleData;
	data: UptimeData;
	previousStatus: number | undefined;
}): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		return;
	}

	const kind = resolveTransitionKind(
		options.previousStatus,
		options.data.status
	);
	if (kind === null) {
		return;
	}

	const emails = await getVerifiedOrgMemberEmails(
		options.schedule.organizationId
	);
	if (emails.length === 0) {
		return;
	}

	const siteLabel = buildSiteLabel(options.schedule);
	const baseUrl = process.env.DASHBOARD_APP_URL ?? "https://app.databuddy.cc";
	const dashboardUrl = `${baseUrl.replace(TRAILING_SLASH, "")}/monitors/${options.schedule.id}`;

	const resend = new Resend(apiKey);
	const sslExpiry =
		options.data.ssl_expiry > 0 ? options.data.ssl_expiry : undefined;

	try {
		const result = await resend.emails.send({
			from: "Databuddy <alerts@databuddy.cc>",
			to: emails,
			subject:
				kind === "down"
					? `[Databuddy] ${siteLabel} is down`
					: `[Databuddy] ${siteLabel} is back up`,
			react: UptimeAlertEmail({
				kind,
				siteLabel,
				url: options.data.url,
				checkedAt: options.data.timestamp,
				httpCode: options.data.http_code,
				error: options.data.error ?? "",
				probeRegion: options.data.probe_region,
				totalMs: options.data.total_ms,
				ttfbMs: options.data.ttfb_ms,
				sslValid: options.data.ssl_valid === 1,
				sslExpiryMs: sslExpiry,
				dashboardUrl,
			}),
		});
		if (result.error) {
			captureError(new Error(result.error.message), {
				error_step: "transition_email_resend",
			});
		}
	} catch (error) {
		captureError(error, { error_step: "transition_email" });
	}
}
