import { models } from "../config";
import type { AppContext } from "../config/context";
import { buildFunnelsInstructions } from "../prompts/funnels";
import { createFunnelTools } from "../tools/funnels";
import { createAgent } from "./factory";

/**
 * Creates a funnels specialist agent with tools bound to the given context.
 * Handles funnel creation, management, and analytics.
 * Tool-only agent - no handoffs, just funnel operations.
 */
export function createFunnelsAgent(context: AppContext) {
    return createAgent({
        name: "funnels",
        model: models.analytics,
        temperature: 0.3,
        instructions: buildFunnelsInstructions,
        tools: createFunnelTools(context),
        maxTurns: 10,
    });
}

/**
 * Funnels specialist agent.
 * Handles funnel creation, management, and analytics.
 * Tool-only agent - no handoffs, just funnel operations.
 * 
 * Note: This is created with a default context. When used as a handoff,
 * the agent framework will pass the actual context when executing tools.
 */
export const funnelsAgent = createFunnelsAgent({
    userId: "anonymous",
    websiteId: "default",
    websiteDomain: "example.com",
    timezone: "UTC",
    currentDateTime: new Date().toISOString(),
    chatId: "default",
});
