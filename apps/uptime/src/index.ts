import { clickHouse, formatClickhouseDate } from "@databuddy/db";
import Elysia from "elysia";
import { checkUptime, lookupWebsite } from "./actions";

const STATUS_LABELS = {
	0: "DOWN",
	1: "UP",
	2: "PENDING",
	3: "MAINTENANCE",
} as const;

const app = new Elysia().post("/", async ({ headers }) => {
	try {
		const siteId = headers["x-website-id"];

		if (!siteId || typeof siteId !== "string") {
			return {
				success: false,
				message: "Website ID is required",
				error: "Missing or invalid x-website-id header",
			};
		}

		const site = await lookupWebsite(siteId);

		if (!site.success) {
			console.error("Website lookup failed:", site.error);
			return {
				success: false,
				message: "Website not found",
				error: site.error,
			};
		}

		const maxRetriesHeader = headers["x-max-retries"];
		const maxRetries = maxRetriesHeader
			? Number.parseInt(maxRetriesHeader as string, 10)
			: 3;

		const result = await checkUptime(siteId, site.data.domain, 1, maxRetries);

		if (!result.success) {
			console.error("Uptime check failed:", result.error);
			return {
				success: false,
				message: "Failed to check uptime",
				error: result.error,
			};
		}

		const { data } = result;

		// TO-DO: migrate this to use redpanda & vector instead of clickhouse.
		try {
			await clickHouse.insert({
				table: "uptime.uptime_monitor",
				values: [
					{
						site_id: data.site_id,
						url: data.url,
						timestamp: formatClickhouseDate(new Date(data.timestamp)),
						status: data.status,
						http_code: data.http_code,
						ttfb_ms: data.ttfb_ms,
						total_ms: data.total_ms,
						attempt: data.attempt,
						retries: data.retries,
						failure_streak: data.failure_streak,
						response_bytes: data.response_bytes,
						content_hash: data.content_hash,
						redirect_count: data.redirect_count,
						probe_region: data.probe_region,
						probe_ip: data.probe_ip,
						ssl_expiry: data.ssl_expiry
							? formatClickhouseDate(new Date(data.ssl_expiry))
							: null,
						ssl_valid: data.ssl_valid,
						env: data.env,
						check_type: data.check_type,
						user_agent: data.user_agent,
						error: data.error,
					},
				],
				format: "JSONEachRow",
			});
		} catch (error) {
			console.error("Failed to store uptime data in ClickHouse:", error);
			// continue execution even if clickhouse insert fails
		}

		console.log(
			JSON.stringify({
				message: "Uptime check complete",
				site_id: siteId,
				url: site.data.domain,
				status: STATUS_LABELS[data.status as 0 | 1 | 2 | 3] || "UNKNOWN",
				http_code: data.http_code,
				ttfb_ms: data.ttfb_ms,
				retries: data.retries,
				streak: data.failure_streak,
			})
		);

		return {
			success: true,
			message: "Uptime check complete",
			data,
		};
	} catch (error) {
		console.error("Unexpected error:", error);
		return {
			success: false,
			message: "Internal server error",
		};
	}
});

export default {
	port: 4000,
	fetch: app.fetch,
};
