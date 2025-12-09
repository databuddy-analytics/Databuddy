import { clickHouse, formatClickhouseDate } from "@databuddy/db";
import Elysia from "elysia";
import { Receiver } from "@upstash/qstash";
import {
    captureError,
    endRequestSpan,
    initTracing,
    shutdownTracing,
    startRequestSpan,
} from "./lib/tracing";
import { checkUptime, lookupWebsite } from "./actions";

initTracing();

process.on("unhandledRejection", (reason, _promise) => {
    console.error("Unhandled Rejection:", reason);
    captureError(reason);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    captureError(error);
});

process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down gracefully...");
    await shutdownTracing().catch((error) =>
        console.error("Shutdown error:", error)
    );
    process.exit(0);
});

process.on("SIGINT", async () => {
    console.log("SIGINT received, shutting down gracefully...");
    await shutdownTracing().catch((error) =>
        console.error("Shutdown error:", error)
    );
    process.exit(0);
});

const CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY;
const NEXT_SIGNING_KEY = process.env.QSTASH_NEXT_SIGNING_KEY;

if (!CURRENT_SIGNING_KEY || !NEXT_SIGNING_KEY) {
    throw new Error("QSTASH_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY environment variables are required");
}

const receiver = new Receiver({
    currentSigningKey: CURRENT_SIGNING_KEY,
    nextSigningKey: NEXT_SIGNING_KEY,
});

const STATUS_LABELS = {
    0: "DOWN",
    1: "UP",
    2: "PENDING",
    3: "MAINTENANCE",
} as const;

const app = new Elysia()
    .state("tracing", {
        span: null as ReturnType<typeof startRequestSpan> | null,
        startTime: 0,
    })
    .onBeforeHandle(function startTrace({ request, path, store }) {
        const method = request.method;
        const startTime = Date.now();
        const span = startRequestSpan(method, request.url, path);

        store.tracing = {
            span,
            startTime,
        };
    })
    .onAfterHandle(function endTrace({ responseValue, store }) {
        if (store.tracing?.span && store.tracing.startTime) {
            const statusCode =
                responseValue instanceof Response ? responseValue.status : 200;
            endRequestSpan(store.tracing.span, statusCode, store.tracing.startTime);
        }
    })
    .onError(function handleError({ error, code, store }) {
        if (store.tracing?.span && store.tracing.startTime) {
            const statusCode = code === "NOT_FOUND" ? 404 : 500;
            endRequestSpan(store.tracing.span, statusCode, store.tracing.startTime);
        }
        captureError(error);
    })
    .post("/", async ({ headers, body, store }) => {
        try {
            const siteId = headers["x-website-id"];
            const signature = headers["upstash-signature"];

            const isValid = await receiver.verify({
                // @ts-ignore, this doesn't require type assertions
                body,
                // @ts-ignore, these don't require type assertions 
                signature,
                url: "https://uptime.databuddy.cc",
            });

            if (!isValid) {
                return {
                    success: false,
                    message: "Invalid signature",
                    error: "Invalid signature",
                };
            }

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
            captureError(error);
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
