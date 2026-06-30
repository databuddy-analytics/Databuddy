/** biome-ignore-all lint/performance/noBarrelFile: this is a barrel file */

export { parseContentSegments } from "./parser";

export { componentRegistry, getComponent, hasComponent } from "./registry";

export {
	AI_COMPONENT_DATA_PART_NAME,
	AI_COMPONENT_DATA_PART_TYPE,
	getAIComponentInputFromPart,
	getAIComponentInputFromToolOutput,
	normalizeAIComponentMessageParts,
	normalizeAIComponentMessages,
} from "./message-parts";
export type { AIComponentDataPart } from "./message-parts";

export type {
	BaseComponentProps,
	ChartComponentProps,
	ComponentDefinition,
	ComponentRegistry,
	ContentSegment,
	CountryItem,
	DashboardActionsInput,
	DataTableInput,
	DistributionInput,
	LinksListInput,
	MiniMapInput,
	ParsedSegments,
	RawComponentInput,
	ReferrerItem,
	ReferrersListInput,
	TimeSeriesInput,
} from "./types";
