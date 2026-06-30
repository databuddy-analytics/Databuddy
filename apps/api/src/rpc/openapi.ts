import { config } from "@databuddy/env/app";
import { appRouter, createAbortSignalInterceptor } from "@databuddy/rpc";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { onError } from "@orpc/server";
import {
	API_KEY_DESCRIPTION,
	type HiddenOpenApiRouter,
	HIDDEN_OPENAPI_ROUTERS,
	OPENAPI_DESCRIPTION,
	OPENAPI_TAGS,
} from "./openapi-config";
import { logOrpcHandlerError } from "./interceptors";

const hiddenOpenApiRouters = new Set<string>(HIDDEN_OPENAPI_ROUTERS);

const docsRouter = Object.fromEntries(
	Object.entries(appRouter).filter(
		([key]: [string, unknown]) => !hiddenOpenApiRouters.has(key)
	)
) as Omit<typeof appRouter, HiddenOpenApiRouter>;

export const openApiHandler = new OpenAPIHandler(docsRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specPath: "/spec.json",
			docsPath: "/",
			docsTitle: "Databuddy API",
			docsConfig: { theme: "deepSpace" },
			specGenerateOptions: {
				servers: [{ url: config.urls.api }],
				info: {
					title: "Databuddy API",
					version: "1.0.0",
					description: OPENAPI_DESCRIPTION,
				},
				tags: OPENAPI_TAGS,
				security: [{ apiKey: [] }],
				components: {
					securitySchemes: {
						apiKey: {
							type: "apiKey",
							in: "header",
							name: "x-api-key",
							description: API_KEY_DESCRIPTION,
						},
					},
				},
			},
		}),
	],
	interceptors: [createAbortSignalInterceptor(), onError(logOrpcHandlerError)],
});
