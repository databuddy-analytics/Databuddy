import { isSelfHosted, publicConfig } from "@databuddy/env/public";
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
	if (!isSelfHosted) {
		return `Add Databuddy analytics to this repository. Client ID: ${websiteId}

## References
- Docs: https://www.databuddy.cc/docs/getting-started
- LLMs.txt: https://www.databuddy.cc/llms.txt
- Full docs: https://www.databuddy.cc/docs

## Installation

Choose the right method for this website's framework:

**React / Next.js** — \`bun add @databuddy/sdk\` (or npm/yarn/pnpm)
\`\`\`tsx
import { Databuddy } from "@databuddy/sdk/react";
// Mount at the app root (layout.tsx or _app.tsx)
<Databuddy clientId={process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID!} />
\`\`\`

**Vue** — \`bun add @databuddy/sdk\`
\`\`\`vue
<script setup>
import { Databuddy } from "@databuddy/sdk/vue";
</script>
<template>
  <Databuddy :client-id="import.meta.env.VITE_DATABUDDY_CLIENT_ID" />
</template>
\`\`\`

**Vanilla JS / HTML** — CDN script in \`<head>\`:
\`\`\`html
<script src="https://cdn.databuddy.cc/databuddy.js" data-client-id="${websiteId}" crossorigin="anonymous" async></script>
\`\`\`

Store the Client ID in an env var — never hardcode it.
- Next.js: NEXT_PUBLIC_DATABUDDY_CLIENT_ID
- Vue/Vite: VITE_DATABUDDY_CLIENT_ID

## Configuration Options

All options work as React/Vue props or \`data-*\` attributes on the script tag.
| Option | Type | Default | What it does |
|--------|------|---------|-------------|
| trackWebVitals | bool | false | Core Web Vitals (LCP, CLS, INP, TTFB) |
| trackErrors | bool | false | JavaScript errors and exceptions |
| trackHashChanges | bool | false | URL hash changes (SPA routing) |
| trackAttributes | bool | false | Auto-track elements with data-track attribute |
| trackOutgoingLinks | bool | false | Clicks to external sites |
| trackInteractions | bool | false | Button clicks and form submissions |
| disabled | bool | false | Master kill switch |
| samplingRate | 0-1 | 1.0 | Fraction of events to capture |
| enableBatching | bool | true | Batch events before sending |
| batchSize | num | 10 | Events per batch |
| batchTimeout | num | 5000 | Max ms before flushing batch |
| enableRetries | bool | true | Retry failed requests |
| maxRetries | num | 3 | Max retry attempts |

Page views and sessions are tracked automatically; they are not configuration options.

Enable what makes sense for this website. A good starting point:
\`\`\`tsx
<Databuddy clientId={...} trackWebVitals trackErrors />
\`\`\`

## Custom Events

\`\`\`tsx
import { track } from "@databuddy/sdk";
track("signup_completed", { method: "google", plan: "pro" });
\`\`\`

Use snake_case event names. Track decisions and milestones (signup_completed, purchase_completed, feature_used), not every click. Keep properties low-cardinality. Never track PII.

## Verification — How to Confirm It Works

1. Open DevTools → Network tab, reload the page
2. Look for a request to cdn.databuddy.cc/databuddy.js (script loading)
3. Look for requests to basket.databuddy.cc (events being sent)
4. Both should return 200. If events show the correct Client ID in the payload, tracking is working.

## Common Issues & Fixes

**Domain mismatch**: Events are rejected if sent from a domain that doesn't match the website configured in Databuddy. The domain in settings must match the domain the script runs on.

**Content Security Policy (CSP)**: If the site has strict CSP headers, add these directives:
- script-src: https://cdn.databuddy.cc
- connect-src: https://basket.databuddy.cc

**Ad blockers**: uBlock Origin, Privacy Badger, and similar extensions may block analytics scripts. Test with extensions disabled. For production, consider a custom tracking domain (proxy through your own domain).

**Localhost is ignored by default**: Events from localhost are not sent unless you use the tracker's debug build. Deploy or open the site on a non-localhost host to see data.

**Script not loading**: Verify the script tag is in <head> (not <body>), the src URL is correct, and no CSP or network error appears in the console.

**Events not appearing in dashboard**: Data typically appears within a few minutes. Check the Network tab for failed requests to basket.databuddy.cc. Verify the Client ID matches. Check for console errors.

**If another analytics tool is present**: Both can run in parallel. No conflicts. Optionally disable the other tool's page view tracking if Databuddy handles it.`;
	}
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
${isSelfHosted ? `    data-api-url="${publicConfig.urls.basket}"\n` : ""}${optionsLine}${integrityLine}    crossorigin="anonymous"
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
${isSelfHosted ? `        apiUrl="${publicConfig.urls.basket}"\n` : ""}        clientId="${websiteId}"${propsString}/>
    </>
  );
}`;
}

export function generateNodeCode(websiteId: string): string {
	return `import { Databuddy } from '@databuddy/sdk/node';

const analytics = new Databuddy({
  apiKey: process.env.DATABUDDY_API_KEY!,
  websiteId: '${websiteId}',
${isSelfHosted ? `  apiUrl: ${JSON.stringify(publicConfig.urls.basket)},\n` : ""}  enableBatching: true,
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
${isSelfHosted ? `      api-url="${publicConfig.urls.basket}"\n` : ""}      client-id="${websiteId}"${propsString}
    />
  </div>
</template>`;
}

function kebabCase(str: string): string {
	return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}
