import { type StopCondition, stepCountIs, type ToolSet } from "ai";

/**
 * Hard ceiling on agent tool-loop steps. The agent's own decision to stop (no
 * more tool calls, final text emitted) is the primary termination signal; this
 * is the runaway guard that forces convergence before context bloat makes each
 * step's prefill pathologically slow. Wall-clock timeouts in the runner remain
 * the outer safety net.
 */
export const MAX_AGENT_STEPS = 24;

export const stopAtMaxSteps: StopCondition<ToolSet> =
	stepCountIs(MAX_AGENT_STEPS);
