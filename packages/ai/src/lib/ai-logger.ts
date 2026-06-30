import type { AILogger } from "evlog/ai";
import { createAILogger } from "evlog/ai";
import { createRequestLogger } from "evlog";
import { getActiveAiRequestLogger } from "./request-logger";

export function getAILogger(): AILogger {
	return createAILogger(getActiveAiRequestLogger() ?? createRequestLogger(), {
		toolInputs: { maxLength: 500 },
	});
}
