import { type StopCondition, stepCountIs, type ToolSet } from "ai";
const MAX_AGENT_STEPS = 24;

export const stopAtMaxSteps: StopCondition<ToolSet> =
	stepCountIs(MAX_AGENT_STEPS);
