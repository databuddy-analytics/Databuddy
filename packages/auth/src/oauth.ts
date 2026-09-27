import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { isUniqueViolationFor } from "@databuddy/db";
import { config } from "@databuddy/env/app";
import { betterAuth } from "better-auth/minimal";
import { jwt } from "better-auth/plugins";
import { baseAuthOptions } from "./auth";

const database: typeof baseAuthOptions.database = (options) => {
	const adapter = baseAuthOptions.database(options);
	return {
		...adapter,
		create: <T extends Record<string, unknown>, R = T>(
			data: Parameters<typeof adapter.create<T, R>>[0]
		) =>
			adapter.create<T, R>(data).catch((error) => {
				// oauth-provider treats a concurrent resource seed as a no-op only when
				// the error message says "duplicate"; Drizzle keeps that in `cause`.
				if (
					data.model === "oauthResource" &&
					error instanceof Error &&
					error.cause instanceof Error &&
					isUniqueViolationFor(error, "oauth_resource_identifier_unique")
				) {
					throw error.cause;
				}
				throw error;
			}),
	};
};

export const oauthAuthOptions = {
	...baseAuthOptions,
	database,
	plugins: [
		...baseAuthOptions.plugins,
		jwt(),
		mcp({
			loginPage: "/login",
			consentPage: "/consent",
			resource: config.urls.mcp,
		}),
		cimd({
			fetchClientMetadataResource,
			metadataProfile: "mcp-2026-07-28",
		}),
	],
};

export const oauthAuth = betterAuth(oauthAuthOptions);
