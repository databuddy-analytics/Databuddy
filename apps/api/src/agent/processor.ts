import type { User } from "@databuddy/auth";
import type { StreamingUpdate } from "@databuddy/shared/types/assistant";
import type { Website } from "@databuddy/shared/types/website";
import type { AssistantRequestType } from "../schemas";
import { AssistantOrchestrator } from "./core/assistant-orchestrator";

/**
 * Clean, simple processor using object-oriented architecture
 */
export async function processAssistantRequest(
	request: AssistantRequestType,
	user: User,
	website: Website
): Promise<StreamingUpdate[]> {
	const orchestrator = new AssistantOrchestrator();
	return await orchestrator.processRequest(request, user, website);
}
