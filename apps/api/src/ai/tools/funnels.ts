import { appRouter, createRPCContext } from "@databuddy/rpc";
import { createRouterClient, ORPCError } from "@orpc/server";
import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import type { AppContext } from "../config/context";
import { createToolLogger } from "./utils/logger";

const logger = createToolLogger("Funnels Tools");

async function callRPCProcedure(
    routerName: string,
    method: string,
    input: unknown,
    context: AppContext
) {
    try {
        const headers = context.requestHeaders ?? new Headers();
        const rpcContext = await createRPCContext({ headers });

        const router = appRouter[routerName as keyof typeof appRouter] as
            | Record<string, unknown>
            | undefined;
        if (!router || typeof router !== "object") {
            throw new Error(`Router ${routerName} not found`);
        }

        const client = createRouterClient(router as any, {
            context: rpcContext,
        }) as Record<string, (input: unknown) => Promise<unknown>> | undefined;

        const clientFn = client?.[method];
        if (typeof clientFn !== "function") {
            throw new Error(
                `Procedure ${routerName}.${method} not found or not callable.`
            );
        }

        return await clientFn(input);
    } catch (error) {
        if (error instanceof ORPCError) {
            logger.error("ORPC error", {
                procedure: `${routerName}.${method}`,
                code: error.code,
                message: error.message,
            });

            const userMessage =
                error.code === "UNAUTHORIZED"
                    ? "You don't have permission to perform this action."
                    : error.code === "NOT_FOUND"
                        ? "The requested resource was not found."
                        : error.code === "BAD_REQUEST"
                            ? `Invalid request: ${error.message}`
                            : error.code === "FORBIDDEN"
                                ? "You don't have permission to access this resource."
                                : error.message ||
                                "An error occurred while processing your request.";

            throw new Error(userMessage);
        }

        if (error instanceof Error) {
            logger.error("RPC call error", {
                procedure: `${routerName}.${method}`,
                error: error.message,
                stack: error.stack,
                input,
            });
            throw error;
        }

        logger.error("Unknown error in RPC call", {
            procedure: `${routerName}.${method}`,
            error,
            input,
        });
        throw new Error("An unexpected error occurred. Please try again.");
    }
}

export function createFunnelTools(context: AppContext) {
    const listFunnelsTool = tool({
        description:
            "List all funnels for a website. Returns funnels with their steps, filters, and metadata.",
        inputSchema: z.object({
            websiteId: z.string().describe("The website ID to get funnels for"),
        }),
        execute: async ({ websiteId }) => {
            try {
                const result = await callRPCProcedure(
                    "funnels",
                    "list",
                    { websiteId },
                    context
                );
                return {
                    funnels: result,
                    count: Array.isArray(result) ? result.length : 0,
                };
            } catch (error) {
                logger.error("Failed to list funnels", { websiteId, error });
                throw error instanceof Error
                    ? error
                    : new Error("Failed to retrieve funnels. Please try again.");
            }
        },
    });


    const getFunnelByIdTool = tool({
        description:
            "Get a specific funnel by ID. Returns detailed information including steps, filters, and configuration.",
        inputSchema: z.object({
            id: z.string().describe("The funnel ID"),
            websiteId: z.string().describe("The website ID"),
        }),
        execute: async ({ id, websiteId }) => {
            try {
                return await callRPCProcedure(
                    "funnels",
                    "getById",
                    { id, websiteId },
                    context
                );
            } catch (error) {
                logger.error("Failed to get funnel by ID", { id, websiteId, error });
                throw error instanceof Error
                    ? error
                    : new Error("Failed to retrieve funnel. Please try again.");
            }
        },
    });

    const getFunnelAnalyticsTool = tool({
        description:
            "Get analytics data for a funnel. Returns conversion rates, drop-off points, and step-by-step metrics.",
        inputSchema: z.object({
            funnelId: z.string().describe("The funnel ID"),
            websiteId: z.string().describe("The website ID"),
            startDate: z
                .string()
                .optional()
                .describe("Start date in YYYY-MM-DD format (defaults to 30 days ago)"),
            endDate: z
                .string()
                .optional()
                .describe("End date in YYYY-MM-DD format (defaults to today)"),
        }),
        execute: async ({ funnelId, websiteId, startDate, endDate }) => {
            try {
                if (startDate && !dayjs(startDate).isValid()) {
                    throw new Error(
                        "Start date must be in YYYY-MM-DD format (e.g., 2024-01-15)."
                    );
                }
                if (endDate && !dayjs(endDate).isValid()) {
                    throw new Error(
                        "End date must be in YYYY-MM-DD format (e.g., 2024-01-15)."
                    );
                }

                return await callRPCProcedure(
                    "funnels",
                    "getAnalytics",
                    { funnelId, websiteId, startDate, endDate },
                    context
                );
            } catch (error) {
                logger.error("Failed to get funnel analytics", {
                    funnelId,
                    websiteId,
                    startDate,
                    endDate,
                    error,
                });
                throw error instanceof Error
                    ? error
                    : new Error("Failed to retrieve funnel analytics. Please try again.");
            }
        },
    });

    const getFunnelAnalyticsByReferrerTool = tool({
        description:
            "Get funnel analytics broken down by referrer/traffic source. Shows which sources drive the best conversions.",
        inputSchema: z.object({
            funnelId: z.string().describe("The funnel ID"),
            websiteId: z.string().describe("The website ID"),
            startDate: z
                .string()
                .optional()
                .describe("Start date in YYYY-MM-DD format (defaults to 30 days ago)"),
            endDate: z
                .string()
                .optional()
                .describe("End date in YYYY-MM-DD format (defaults to today)"),
        }),
        execute: async ({ funnelId, websiteId, startDate, endDate }) => {
            try {
                if (startDate && !dayjs(startDate).isValid()) {
                    throw new Error(
                        "Start date must be in YYYY-MM-DD format (e.g., 2024-01-15)."
                    );
                }
                if (endDate && !dayjs(endDate).isValid()) {
                    throw new Error(
                        "End date must be in YYYY-MM-DD format (e.g., 2024-01-15)."
                    );
                }

                return await callRPCProcedure(
                    "funnels",
                    "getAnalyticsByReferrer",
                    { funnelId, websiteId, startDate, endDate },
                    context
                );
            } catch (error) {
                logger.error("Failed to get funnel analytics by referrer", {
                    funnelId,
                    websiteId,
                    startDate,
                    endDate,
                    error,
                });
                throw error instanceof Error
                    ? error
                    : new Error(
                        "Failed to retrieve funnel analytics by referrer. Please try again."
                    );
            }
        },
    });

    return {
        list_funnels: listFunnelsTool,
        get_funnel_by_id: getFunnelByIdTool,
        get_funnel_analytics: getFunnelAnalyticsTool,
        get_funnel_analytics_by_referrer: getFunnelAnalyticsByReferrerTool,
    } as const;
}
