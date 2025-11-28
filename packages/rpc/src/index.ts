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
export { createRPCContext } from "./orpc";
export { type AppRouter, appRouter } from "./root";
export {
	type ExportFormat,
	type ExportMetadata,
	type GenerateExportResult,
	generateExport,
	validateExportDateRange,
} from "./services/export-service";
export { authorizeWebsiteAccess } from "./utils/auth";
