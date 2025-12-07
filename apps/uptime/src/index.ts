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
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
});

export default {
    port: 4000,
    fetch: app.fetch,
};