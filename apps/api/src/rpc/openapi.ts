import { config } from "@databuddy/env/app";
import { appRouter, createAbortSignalInterceptor } from "@databuddy/rpc";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { onError } from "@orpc/server";
import {
	API_KEY_DESCRIPTION,
	type PublicOpenApiRouter,
	OPENAPI_DESCRIPTION,
	OPENAPI_TAGS,
	PUBLIC_OPENAPI_ROUTERS,
} from "./openapi-config";
import { logOrpcHandlerError } from "./interceptors";

const docsRouter = Object.fromEntries(
	PUBLIC_OPENAPI_ROUTERS.map((key) => [key, appRouter[key]])
) as Pick<typeof appRouter, PublicOpenApiRouter>;

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
