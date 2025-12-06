import { models } from "../config";
import { buildReflectionInstructions } from "../prompts/reflection";
import { analyticsAgent } from "./analytics";
import { createAgent } from "./factory";
import { funnelsAgent } from "./funnels";

/**
 * Reflection agent that reviews responses, decides next steps,
 * and can redirect to other agents for deeper investigation.
 *
 * This agent acts as a meta-orchestrator that:
 * - Reflects on agent responses to determine if more data is needed
 * - Handles complex multi-step reasoning workflows
 * - Synthesizes information from multiple sources
 * - Provides clear explanations to users
 * - Can hand off to analytics/funnels agents for data gathering
 */
export const reflectionAgent = createAgent({
    name: "reflection",
    model: models.advanced,
    temperature: 0.2,
    instructions: buildReflectionInstructions,
    modelSettings: {
        failureMode: {
            maxAttempts: 2,
        },
    },
    handoffs: [analyticsAgent, funnelsAgent],
    maxTurns: 15,
});

/**
 * Reflection agent variant using Haiku model for faster, cost-effective reasoning.
 * Uses the diagnosing system (reflection) but with a lighter model.
 */
export const reflectionAgentHaiku = createAgent({
    name: "reflection-haiku",
    model: models.analytics, // Haiku model
    temperature: 0.2,
    instructions: buildReflectionInstructions,
    modelSettings: {
        failureMode: {
            maxAttempts: 2,
        },
    },
    handoffs: [analyticsAgent, funnelsAgent],
    maxTurns: 15,
});

/**
 * Reflection agent variant with enhanced capabilities:
 * - Uses Claude Sonnet for advanced reasoning
 * - Increased tool call limits for complex multi-step workflows
 */
export const reflectionAgentMax = createAgent({
    name: "reflection-max",
    model: models.advanced, // Sonnet model
    temperature: 0.2,
    instructions: buildReflectionInstructions,
    modelSettings: {
        failureMode: {
            maxAttempts: 2,
        },
    },
    handoffs: [analyticsAgent, funnelsAgent],
    maxTurns: 20, // Increased from 15
});
