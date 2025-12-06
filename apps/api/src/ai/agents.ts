import { Agent } from "@ai-sdk-tools/agents";
import {
    extendedMemoryConfig,
    maxMemoryConfig,
    minimalMemoryConfig,
    standardMemoryConfig,
} from "./config/memory";
import { models } from "./config/models";
import { buildAnalyticsInstructions } from "./prompts/analytics";
import { buildReflectionInstructions } from "./prompts/reflection";
import { buildTriageInstructions } from "./prompts/triage";
import { executeSqlQueryTool } from "./tools/execute-sql-query";
import { getTopPagesTool } from "./tools/get-top-pages";
import { webSearchTool } from "./tools/web-search";

/**
 * Tools available to analytics agents.
 */
const analyticsTools = {
    get_top_pages: getTopPagesTool,
    execute_sql_query: executeSqlQueryTool,
    web_search: webSearchTool,
} as const;

/**
 * Analytics specialist agent.
 * Handles website traffic analysis, user behavior, and performance metrics.
 * Uses standard memory for typical analytical conversations.
 */
export const analyticsAgent = new Agent({
    name: "analytics",
    model: models.analytics,
    temperature: 0.3,
    instructions: buildAnalyticsInstructions,
    tools: analyticsTools,
    memory: standardMemoryConfig,
    modelSettings: {
        failureMode: {
            maxAttempts: 2,
        },
    },
    maxTurns: 10,
});

/**
 * Reflection orchestrator agent.
 * Reviews responses, decides next steps, and handles complex multi-step reasoning.
 * Memory allocation scales with model capability.
 */
export const createReflectionAgent = (
    variant: "standard" | "haiku" | "max" = "standard"
) => {
    const config = {
        standard: {
            model: models.advanced,
            maxTurns: 15,
            memory: extendedMemoryConfig, // 30 messages for Sonnet
        },
        haiku: {
            model: models.analytics,
            maxTurns: 15,
            memory: standardMemoryConfig, // 20 messages for Haiku
        },
        max: {
            model: models.advanced,
            maxTurns: 20,
            memory: maxMemoryConfig, // 40 messages for deep investigations
        },
    }[variant];

    return new Agent({
        name: `reflection-${variant}`,
        temperature: 0.2,
        instructions: buildReflectionInstructions,
        modelSettings: {
            failureMode: {
                maxAttempts: 2,
            },
        },
        handoffs: [analyticsAgent],
        ...config,
    });
};

/**
 * Triage agent that routes user requests to the appropriate specialist.
 * This is the main entry point for all agent interactions.
 * Uses minimal memory since it only routes and doesn't need long context.
 */
export const triageAgent = new Agent({
    name: "triage",
    model: models.triage,
    temperature: 0.1,
    instructions: buildTriageInstructions,
    memory: minimalMemoryConfig,
    modelSettings: {
        toolChoice: {
            type: "tool",
            toolName: "handoff_to_agent",
        },
        failureMode: {
            maxAttempts: 2,
        },
    },
    handoffs: [analyticsAgent],
    maxTurns: 1,
});
