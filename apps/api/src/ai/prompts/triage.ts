import type { AppContext } from "../config/context";
import { formatContextForLLM } from "../config/context";

/**
 * Builds the instruction prompt for the triage agent.
 * The triage agent's ONLY job is to hand off to analytics - it cannot respond directly.
 */
export function buildTriageInstructions(ctx: AppContext): string {
	return `You are a router for ${ctx.websiteDomain}. Your ONLY job is to hand off requests to the analytics agent.

<rules>
- You CANNOT respond to users directly
- You MUST hand off every request to the analytics agent
- Do not add any text or explanation - just hand off immediately
</rules>

<background-data>
${formatContextForLLM(ctx)}
</background-data>`;
}
