/** biome-ignore-all lint/performance/noBarrelFile: im a big fan of barrels */
export { FlagsProvider, useFlag, useFlags } from "./flags-provider";
export { FlagsRequestError } from "@/core/flags/shared";
export type {
	FlagResult,
	FlagState,
	FlagsConfig,
	FlagsContext,
	FlagsRequestFailure,
} from "@/core/flags/types";
