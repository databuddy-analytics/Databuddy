/** biome-ignore-all lint/performance/noBarrelFile: we need to export these functions */
export {
	createAbortSignalInterceptor,
	createORPCInstrumentation,
	enrichSpanWithContext,
	recordError,
	recordORPCError,
	setProcedureAttributes,
	setupUncaughtErrorHandlers,
} from "./lib/otel";
export { type Context, createRPCContext } from "./orpc";
export {
	type PermissionFor,
	type PlanId,
	type ResourceType,
	type Website,
	type WebsiteWorkspaceContext,
	type WithWebsiteConfig,
	type WithWorkspaceConfig,
	type Workspace,
	type WorkspaceContext,
	websiteInputSchema,
	withAnalyticsWebsite,
	withConfigureWebsite,
	withDeleteWebsite,
	withReadWebsite,
	withUpdateWebsite,
	withWebsite,
	withWorkspace,
	workspaceInputSchema,
} from "./procedures/with-workspace";
export { type AppRouter, appRouter } from "./root";
export {
	type ExportFormat,
	type ExportMetadata,
	type GenerateExportResult,
	generateExport,
	validateExportDateRange,
} from "./services/export-service";
export {
	type BillingContext,
	canAccessAiCapability,
	canAccessFeature,
	getFeatureLimit,
	getUsageRemaining,
	getUserCapabilities,
	hasPlan,
	isFreePlan,
	isUsageWithinLimit,
	requireAiCapability,
	requireFeature,
	requireUsageWithinLimit,
} from "./types/billing";
export { authorizeWebsiteAccess } from "./utils/auth";
