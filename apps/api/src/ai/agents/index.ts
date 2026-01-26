/** biome-ignore-all lint/performance/noNamespaceImport: we need to export these functions */
/** biome-ignore-all lint/style/noExportedImports: we need to export these functions */
import * as analytics from "./analytics";
import * as reflection from "./reflection";
import * as triage from "./triage";
import type { AgentContext, AgentType, StreamConfig } from "./types";

export type { AgentContext, AgentType, StreamConfig } from "./types";

export { analytics, reflection, triage };

export function createAgent(type: AgentType, context: AgentContext) {
	switch (type) {
		case "triage":
			return triage.create(context);
		case "analytics":
			return analytics.create(context);
		case "reflection":
			return reflection.create(context);
		case "reflection-max":
			return reflection.createMax(context);
		default:
			throw new Error(`Unknown agent type: ${type}`);
	}
}

export function getStreamConfig(type: AgentType): StreamConfig {
	switch (type) {
		case "triage":
			return triage.streamConfig;
		case "analytics":
			return analytics.streamConfig;
		case "reflection":
			return reflection.streamConfig;
		case "reflection-max":
			return reflection.maxStreamConfig;
		default:
			throw new Error(`Unknown agent type: ${type}`);
	}
}
