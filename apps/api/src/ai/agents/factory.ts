import { Agent, type AgentConfig } from "@ai-sdk-tools/agents";
import { type AppContext, defaultMemoryConfig } from "../config";

/**
 * Creates an agent with the default memory configuration.
 * Use this factory to ensure consistent memory setup across all agents.
 */
export function createAgent<T extends AppContext = AppContext>(
	config: AgentConfig<T>
): Agent<T> {
	return new Agent({
		...config,
		memory: defaultMemoryConfig,
	});
}
