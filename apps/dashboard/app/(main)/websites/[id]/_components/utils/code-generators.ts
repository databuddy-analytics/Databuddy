import { publicConfig } from "@databuddy/env/public";
import {
	ACTUAL_LIBRARY_DEFAULTS,
	RECOMMENDED_DEFAULTS,
} from "./tracking-defaults";
import type { TrackingOptions } from "./types";

export interface VersionedScript {
	filename: string;
	sriHash: string;
	version: number;
}

export function generateAgentPrompt(websiteId: string): string {
	return `Add Databuddy analytics to this repository. Choose one integration for its framework and follow the existing code style.
Keep the client ID and API URL shown below so events reach this Databuddy instance.
For React or Vue, install @databuddy/sdk with the repository's package manager and mount the component once at the app root.

## React / Next.js
\`\`\`tsx
${generateNpmCode(websiteId, RECOMMENDED_DEFAULTS)}
\`\`\`

## Vue
\`\`\`vue
${generateVueCode(websiteId, RECOMMENDED_DEFAULTS)}
\`\`\`

## HTML (add to <head>)
\`\`\`html
${generateScriptTag(websiteId, RECOMMENDED_DEFAULTS)}
\`\`\`

Page views and sessions are automatic. For custom events, use track() from @databuddy/sdk with short event names and no personal data.

## Verify
- Open the website and check for successful event requests to ${publicConfig.urls.basket}, then confirm events appear in the dashboard.
- The website's domain must match its Databuddy settings. On localhost, use the SDK's debug prop or the databuddy-debug.js script.
- If CSP is enabled, allow the tracker script's origin in script-src and ${new URL(publicConfig.urls.basket).origin} in connect-src. Check for blocked requests in DevTools.

More options: https://www.databuddy.cc/docs/getting-started`;
}

export function generateScriptTag(
	websiteId: string,
	trackingOptions: TrackingOptions,
	versionedScript?: VersionedScript
): string {
	const isLocalhost = process.env.NODE_ENV === "development";
	const cdnBase = isLocalhost
		? "http://localhost:3000"
		: "https://cdn.databuddy.cc";

	const scriptFile = versionedScript
		? versionedScript.filename
		: "databuddy.js";
	const scriptUrl = `${cdnBase}/${scriptFile}`;

	const dataAttrs = Object.entries(trackingOptions)
		.filter(([key, value]) => {
			const actualDefault =
				ACTUAL_LIBRARY_DEFAULTS[key as keyof TrackingOptions];
			if (value === actualDefault) {
				return false;
			}
			if (typeof value === "boolean" && !value && !actualDefault) {
				return false;
			}
			return true;
		})
		.map(
			([key, value]) =>
				`data-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}="${value}"`
		)
		.join("\n    ");

	const optionsLine = dataAttrs ? `    ${dataAttrs}\n` : "";
	const integrityLine = versionedScript
		? `    integrity="${versionedScript.sriHash}"\n`
		: "";

	return `<script
    src="${scriptUrl}"
    data-client-id="${websiteId}"
    data-api-url="${publicConfig.urls.basket}"
${optionsLine}${integrityLine}    crossorigin="anonymous"
    async
  ></script>`;
}
export function generateNpmCode(
	websiteId: string,
	trackingOptions: TrackingOptions
): string {
	const meaningfulProps = Object.entries(trackingOptions)
		.filter(([key, value]) => {
			const actualDefault =
				ACTUAL_LIBRARY_DEFAULTS[key as keyof TrackingOptions];
			if (value === actualDefault) {
				return false;
			}
			if (typeof value === "boolean" && !value && !actualDefault) {
				return false;
			}
			return true;
		})
		.map(([key, value]) => {
			if (typeof value === "boolean") {
				return `        ${key}={${value}}`;
			}
			if (typeof value === "string") {
				return `        ${key}="${value}"`;
			}
			return `        ${key}={${value}}`;
		});

	const propsString =
		meaningfulProps.length > 0 ? `\n${meaningfulProps.join("\n")}\n      ` : "";

	return `import { Databuddy } from '@databuddy/sdk/react';

function AppLayout({ children }) {
  return (
    <>
      {children}
      <Databuddy
        apiUrl="${publicConfig.urls.basket}"
        clientId="${websiteId}"${propsString}/>
    </>
  );
}`;
}

export function generateNodeCode(websiteId: string): string {
	return `import { Databuddy } from '@databuddy/sdk/node';

const analytics = new Databuddy({
  apiKey: process.env.DATABUDDY_API_KEY!,
  websiteId: '${websiteId}',
  apiUrl: ${JSON.stringify(publicConfig.urls.basket)},
  enableBatching: true,
});

await analytics.track({
  name: 'user_signup',
  properties: {
    plan: 'pro',
    source: 'api',
  },
});

// Important in serverless/background jobs
await analytics.flush();`;
}

export function generateVueCode(
	websiteId: string,
	trackingOptions: TrackingOptions
): string {
	const meaningfulProps = Object.entries(trackingOptions)
		.filter(([key, value]) => {
			const actualDefault =
				ACTUAL_LIBRARY_DEFAULTS[key as keyof TrackingOptions];
			if (value === actualDefault) {
				return false;
			}
			if (typeof value === "boolean" && !value && !actualDefault) {
				return false;
			}
			return true;
		})
		.map(([key, value]) => {
			if (typeof value === "boolean") {
				return `      :${kebabCase(key)}="${value}"`;
			}
			if (typeof value === "string") {
				return `      ${kebabCase(key)}="${value}"`;
			}
			return `      :${kebabCase(key)}="${value}"`;
		});

	const propsString =
		meaningfulProps.length > 0 ? `\n${meaningfulProps.join("\n")}` : "";

	return `<script setup>
import { Databuddy } from '@databuddy/sdk/vue';
</script>

<template>
  <div>
    <router-view />
    <Databuddy
      api-url="${publicConfig.urls.basket}"
      client-id="${websiteId}"${propsString}
    />
  </div>
</template>`;
}

function kebabCase(str: string): string {
	return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}
