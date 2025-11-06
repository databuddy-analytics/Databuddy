/**
 * @databuddy/sdk/node/flags
 * Server-side feature flags for Node.js environments
 *
 * Optimized for Next.js server components, API routes, and serverless functions
 */

export { createFlagsManager, ServerFlagsManager } from "./flags-manager";
export type {
	BulkFlagResponse,
	CacheEntry,
	FlagDependency,
	FlagEvaluationContext,
	FlagSchedule,
	FlagVariant,
	FlagVariantValue,
	NodeFlagResult,
	NodeFlagsConfig,
	NodeFlagsManager,
} from "./types";
