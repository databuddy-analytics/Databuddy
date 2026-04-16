import type { AILogger } from "evlog/ai";
import { createAILogger } from "evlog/ai";
import { useLogger } from "evlog/elysia";

export function getAILogger(): AILogger {
	return createAILogger(useLogger(), { toolInputs: { maxLength: 500 } });
}
