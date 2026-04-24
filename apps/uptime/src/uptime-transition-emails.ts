import { and, db, eq, withTransaction } from "@databuddy/db";
import { member, uptimeSchedules, user } from "@databuddy/db/schema";
import { chQuery } from "@databuddy/db/clickhouse";
import { render, UptimeAlertEmail } from "@databuddy/email";
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

export function resolveTransitionKind(
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

async function getOrgOwnerEmails(organizationId: string): Promise<string[]> {
	const rows = await db
		.select({ email: user.email })
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(member.role, "owner"),
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

async function claimTransition(
	scheduleId: string,
	currentStatus: number
): Promise<"down" | "recovered" | null> {
	try {
		return await withTransaction(async (tx) => {
			const [row] = await tx
				.select({ last: uptimeSchedules.lastNotifiedStatus })
				.from(uptimeSchedules)
				.where(eq(uptimeSchedules.id, scheduleId))
				.for("update");

			if (!row) {
				return null;
			}

			const kind = resolveTransitionKind(row.last ?? undefined, currentStatus);
			if (kind === null) {
				return null;
			}

			await tx
				.update(uptimeSchedules)
				.set({ lastNotifiedStatus: currentStatus })
				.where(eq(uptimeSchedules.id, scheduleId));

			return kind;
		});
	} catch (error) {
		captureError(error, { error_step: "transition_claim" });
		return null;
	}
}

export async function getPreviousMonitorStatus(
	siteId: string
): Promise<number | undefined> {
	if (!process.env.CLICKHOUSE_URL) {
		return;
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
			return;
		}
		return row.status;
	} catch (error) {
		captureError(error, { error_step: "clickhouse_previous_status" });
		return;
	}
}

export async function sendUptimeTransitionEmailsIfNeeded(options: {
	schedule: ScheduleData;
	data: UptimeData;
}): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		return;
	}

	const kind = await claimTransition(options.schedule.id, options.data.status);
	if (kind === null) {
		return;
	}

	const emails = await getOrgOwnerEmails(options.schedule.organizationId);
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
		const html = await render(
			UptimeAlertEmail({
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
			})
		);
		const result = await resend.emails.send({
			from: "Databuddy <alerts@databuddy.cc>",
			to: emails,
			subject:
				kind === "down"
					? `[DOWN] ${siteLabel} is unreachable (HTTP ${options.data.http_code || "timeout"})`
					: `[Recovered] ${siteLabel} is back up`,
			html,
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
