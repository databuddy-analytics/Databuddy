import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { config } from "@databuddy/env/app";
import { betterAuth } from "better-auth/minimal";
import { jwt } from "better-auth/plugins";
import { baseAuthOptions } from "./auth";

export const oauthAuthOptions = {
	...baseAuthOptions,
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
