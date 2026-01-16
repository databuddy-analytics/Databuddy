import { Receiver } from "@upstash/qstash";
import { Elysia } from "elysia";
import { z } from "zod";
import { checkUptime, lookupSchedule } from "./actions";
import type { JsonParsingConfig } from "./json-parser";
import { sendUptimeEvent } from "./lib/producer";
import {
    captureError,
    endRequestSpan,
    initTracing,
    shutdownTracing,
    startRequestSpan,
} from "./lib/tracing";

initTracing();

process.on("unhandledRejection", (reason, _promise) => {
    captureError(reason, { type: "unhandledRejection" });
});

process.on("uncaughtException", (error) => {
    captureError(error, { type: "uncaughtException" });
    process.exit(1);
});

process.on("SIGTERM", async () => {
    await shutdownTracing().catch(() => {
    });
    process.exit(0);
});

process.on("SIGINT", async () => {
    await shutdownTracing().catch(() => {
    });
    process.exit(0);
});

const CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY;
const NEXT_SIGNING_KEY = process.env.QSTASH_NEXT_SIGNING_KEY;

if (!(CURRENT_SIGNING_KEY && NEXT_SIGNING_KEY)) {
    throw new Error(
        "QSTASH_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY environment variables are required"
    );
}

const receiver = new Receiver({
    currentSigningKey: CURRENT_SIGNING_KEY,
    nextSigningKey: NEXT_SIGNING_KEY,
});

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
        captureError(error, { type: "elysia_error", code });
    })
    .get("/health", () => ({ status: "ok" }))
    .post("/", async ({ headers, body }) => {
        try {
            const headerSchema = z.object({
                "upstash-signature": z.string(),
                "x-schedule-id": z.string(),
                "upstash-retried": z.string().optional(),
            });

            const parsed = headerSchema.safeParse(headers);
            if (!parsed.success) {
                const errorDetails = parsed.error.format();
                captureError(new Error("Missing required headers"), {
                    type: "validation_error",
                    scheduleId: headers["x-schedule-id"] as string,
                });
                return new Response(
                    JSON.stringify({
                        error: "Missing required headers",
                        details: errorDetails,
                    }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }

            const { "upstash-signature": signature, "x-schedule-id": scheduleId } =
                parsed.data;

            const isValid = await receiver.verify({
                // @ts-expect-error, this doesn't require type assertions
                body,
                signature,
                url: process.env.UPTIME_URL,
            });

            if (!isValid) {
                captureError(new Error("Invalid QStash signature"), {
                    type: "auth_error",
                    scheduleId,
                });
                return new Response("Invalid signature", { status: 401 });
            }

            const schedule = await lookupSchedule(scheduleId);
            if (!schedule.success) {
                captureError(new Error(schedule.error), {
                    type: "schedule_not_found",
                    scheduleId,
                });
                return new Response(
                    JSON.stringify({
                        error: "Schedule not found",
                        scheduleId,
                        details: schedule.error,
                    }),
                    {
                        status: 404,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }

            const monitorId = schedule.data.websiteId || scheduleId;

            const maxRetries = parsed.data["upstash-retried"]
                ? Number.parseInt(parsed.data["upstash-retried"], 10) + 3
                : 3;

            const jsonParsingConfig = schedule.data.jsonParsingConfig as
                | JsonParsingConfig
                | null
                | undefined;

            const result = await checkUptime(
                monitorId,
                schedule.data.url,
                1,
                maxRetries,
                jsonParsingConfig
            );

            if (!result.success) {
                captureError(new Error(result.error), {
                    type: "uptime_check_failed",
                    monitorId,
                    url: schedule.data.url,
                });
                console.error(
                    "[uptime] Failed to check uptime:",
                    monitorId,
                    schedule.data.url,
                    result.error
                );
                return new Response("Failed to check uptime", { status: 500 });
            }

            try {
                await sendUptimeEvent(result.data, monitorId);
            } catch (error) {
                captureError(error, {
                    type: "producer_error",
                    monitorId,
                    httpCode: result.data.http_code,
                });
                console.error(
                    "[uptime] Failed to send uptime event:",
                    monitorId,
                    error instanceof Error ? error.message : String(error)
                );
            }

            return new Response("Uptime check complete", { status: 200 });
        } catch (error) {
            captureError(error, { type: "unexpected_error" });
            console.error("[uptime] Unexpected error in POST handler:", error);
            return new Response("Internal server error", { status: 500 });
        }
    });

export default {
    port: 4000,
    fetch: app.fetch,
};
