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

function agentFeedbackSection(
	apiUrl: string,
	websiteId: string,
	setupSession?: string
): string {
	const session = setupSession
		? `\n    "setupSession": "${setupSession}",`
		: "";
	const progress = setupSession
		? `The Databuddy setup page is open and shows your progress live. Send this request after each step you finish with "status": "partial" and the steps completed so far (detect, install, mount, env-var, verify), then once more at the end with "status": "success" or "failed". Keep "setupSession" exactly as shown.`
		: "When you are done, send one request so the Databuddy team can improve this prompt.";
	return `## Tell Databuddy how the install went (optional)

${progress} Send only the fields below; never include source code, environment values, or anything from the user's files.

\`\`\`bash
curl -X POST ${apiUrl}/public/v1/agent-telemetry \\
  -H "Content-Type: application/json" \\
  -d '{
    "websiteId": "${websiteId}",${session}
    "agent": "<claude|cursor|codex|copilot|other>",
    "status": "<success|partial|failed>",
    "framework": "<nextjs|react|vue|nuxt|astro|vanilla|other>",
    "installMethod": "<sdk|script-tag>",
    "stepsCompleted": ["detect", "install", "mount", "env-var", "verify"],
    "issues": [{ "type": "<csp|adblocker|domain-mismatch|script-blocked|other>", "detail": "<one line>", "resolved": true }],
    "durationMs": 0
  }'
\`\`\`

Skip it if the user asks you not to send anything.`;
}

const AGENT_FEATURE_GUIDE = `## What to enable, and when

Page views and sessions are automatic. Turn on the rest based on what the codebase tells you, and say which ones you enabled and why:

| Option | Enable when |
|--------|-------------|
| trackWebVitals | Always. Powers the Web Vitals page (LCP, CLS, INP, TTFB). |
| trackErrors | Always for apps with client-side JavaScript. Powers the Errors page. |
| trackOutgoingLinks | Marketing sites, docs, link-heavy pages. Records clicks that leave the site. |
| trackInteractions | Apps with buttons and forms worth counting without custom events. |
| trackAttributes | When you add data-track attributes to elements instead of calling track(). |
| trackHashChanges | Single-page apps that route with the URL hash. |
| skipPatterns | Admin, internal, or preview routes that should never be recorded, e.g. ["/admin/**"]. |

Leave samplingRate, batching and retries at their defaults.

## Features worth wiring up now

- **Custom events** with \`track("signup_completed", { plan: "pro" })\` from \`@databuddy/sdk\`. Instrument the two or three moments that matter: sign-up, checkout or purchase, the first successful use. snake_case, past tense, low-cardinality properties, no PII, no IDs or URLs. The dashboard turns these into Goals and Funnels.
- **Identified users**: if the app has authentication, call \`identify(userId, { email, name })\` when the session resolves and \`clearProfile()\` on logout, both from \`@databuddy/sdk\`. This links sessions across devices and shows real users in the dashboard. Only do this when the app already has a lawful basis to process that data.
- **AI crawler tracking** (Next.js and other server frameworks): crawlers like GPTBot and ClaudeBot never run JavaScript. Export \`proxy\` from \`@databuddy/sdk/agents\` in \`proxy.ts\` (Next.js 16) or \`middleware.ts\` (Next.js 15), or call \`trackAgents(request)\` inside an existing one. Keep \`.md\` and \`.txt\` paths in the matcher. This powers the AI Agents page.
- **Feature flags**: \`FlagsProvider\` and \`useFlag\` from \`@databuddy/sdk/react\` (or \`@databuddy/sdk/vue\`). Only add when the user asks for flags.
- **Revenue**: Stripe and Paddle payments are attributed through a webhook configured in the dashboard, plus \`getTrackingIds()\` passed as payment metadata. Mention it if the codebase has Stripe or Paddle; do not configure it unasked.
- **Server-side events**: \`@databuddy/sdk/node\` with an API key for backend events. Only when the user needs it.

Docs for each: https://www.databuddy.cc/docs/sdk`;

export interface AgentPromptContext {
	brief?: string;
	funnels?: {
		name: string;
		reason: string;
		steps: { name: string; target: string; type: "EVENT" | "PAGE_VIEW" }[];
	}[];
	goals?: {
		name: string;
		reason: string;
		target: string;
		type: "EVENT" | "PAGE_VIEW";
	}[];
}

const BRIEF_EXCERPT_LIMIT = 900;

function siteContextSection(context?: AgentPromptContext): string {
	if (!context) {
		return "";
	}
	const sections: string[] = [];
	const brief = context.brief?.trim();
	if (brief) {
		const excerpt =
			brief.length > BRIEF_EXCERPT_LIMIT
				? `${brief.slice(0, BRIEF_EXCERPT_LIMIT).trimEnd()}…`
				: brief;
		sections.push(`## About this site

Databuddy read the public site and wrote this brief. Use it to pick tracking options and to name events the way the business does.

${excerpt}`);
	}
	const events = new Map<string, string>();
	for (const goal of context.goals ?? []) {
		if (goal.type === "EVENT" && !events.has(goal.target)) {
			events.set(goal.target, `${goal.name}. ${goal.reason}`.trim());
		}
	}
	for (const funnel of context.funnels ?? []) {
		for (const step of funnel.steps) {
			if (step.type === "EVENT" && !events.has(step.target)) {
				events.set(
					step.target,
					`${step.name}, a step in the "${funnel.name}" funnel.`
				);
			}
		}
	}
	const pageGoals = (context.goals ?? []).filter(
		(goal) => goal.type === "PAGE_VIEW"
	);
	if (events.size || pageGoals.length || context.funnels?.length) {
		const lines: string[] = [];
		if (events.size) {
			lines.push(
				"Instrument these custom events; the dashboard's goals and funnels are waiting for them. Fire each one once, at the moment it describes, with low-cardinality properties only:",
				"",
				...[...events].map(
					([name, meaning]) => `- \`track("${name}")\`: ${meaning}`
				)
			);
		}
		if (pageGoals.length) {
			lines.push(
				"",
				`Page-view goals need no code: ${pageGoals.map((goal) => goal.target).join(", ")} are tracked automatically.`
			);
		}
		if (context.funnels?.length) {
			lines.push(
				"",
				"Funnels the team can turn on once the events exist:",
				...context.funnels.map(
					(funnel) =>
						`- ${funnel.name}: ${funnel.steps.map((step) => step.target).join(" → ")}`
				)
			);
		}
		sections.push(`## Events to instrument for this site

${lines.join("\n")}

If the codebase has no place where one of these happens, say so instead of inventing it.`);
	}
	return sections.length ? `${sections.join("\n\n")}\n\n` : "";
}

export function generateAgentPrompt(
	websiteId: string,
	setupSession?: string,
	context?: AgentPromptContext
): string {
	if (!isSelfHosted) {
		return `Add Databuddy analytics to this repository. Client ID: ${websiteId}

## References
- Getting started: https://www.databuddy.cc/docs/getting-started
- LLMs.txt: https://www.databuddy.cc/llms.txt
- Full docs: https://www.databuddy.cc/docs

## Installation

Detect the framework from the codebase, then pick one method:

**React / Next.js** — \`bun add @databuddy/sdk\` (or npm/yarn/pnpm, matching the repository's lockfile)
\`\`\`tsx
import { Databuddy } from "@databuddy/sdk/react";
// Mount once at the app root (app/layout.tsx or _app.tsx)
<Databuddy clientId={process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID!} trackWebVitals trackErrors />
\`\`\`

**Vue / Nuxt** — \`bun add @databuddy/sdk\`
\`\`\`vue
<script setup>
import { Databuddy } from "@databuddy/sdk/vue";
</script>
<template>
  <Databuddy :client-id="import.meta.env.VITE_DATABUDDY_CLIENT_ID" track-web-vitals track-errors />
</template>
\`\`\`

**Anything else (Astro, Svelte, static HTML, WordPress, Webflow)** — CDN script in \`<head>\` of every page:
\`\`\`html
<script src="https://cdn.databuddy.cc/databuddy.js" data-client-id="${websiteId}" data-track-web-vitals="true" data-track-errors="true" crossorigin="anonymous" async></script>
\`\`\`

Store the Client ID in an env var and never hardcode it in React or Vue code:
- Next.js: NEXT_PUBLIC_DATABUDDY_CLIENT_ID
- Vite / Vue: VITE_DATABUDDY_CLIENT_ID
- Nuxt: NUXT_PUBLIC_DATABUDDY_CLIENT_ID

Every option works as a React/Vue prop or a \`data-*\` attribute on the script tag.

${siteContextSection(context)}${AGENT_FEATURE_GUIDE}

## Verification

1. Start the app and open it in a browser on a non-localhost host, or use the debug build (\`https://cdn.databuddy.cc/databuddy-debug.js\` or the \`debug\` prop) on localhost.
2. In DevTools → Network, confirm \`cdn.databuddy.cc/databuddy.js\` loads and requests to \`basket.databuddy.cc\` return 200 with this Client ID in the payload.
3. The Databuddy setup page polls for the first page view and marks tracking verified on its own.

## Common issues

- **Domain mismatch**: events from a domain that is not the website's configured domain are blocked. Add staging or preview domains under Settings → Security → Allowed origins, or install on the production domain.
- **Content Security Policy**: allow \`https://cdn.databuddy.cc\` in script-src and \`https://basket.databuddy.cc\` in connect-src.
- **Ad blockers** can block the script locally. Test with extensions disabled; a custom tracking domain avoids it in production.
- **Localhost is ignored by default**: deploy or use the debug build.
- **Script not loading**: it belongs in \`<head>\`, not \`<body>\`; check the URL and the console.
- **Another analytics tool is present**: both can run side by side. Leave the other tool in place unless the user asks to replace it.

${agentFeedbackSection("https://api.databuddy.cc", websiteId, setupSession)}`;
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

${siteContextSection(context)}${AGENT_FEATURE_GUIDE}

## Verify
- Open the website and check for successful event requests to ${publicConfig.urls.basket}, then confirm events appear in the dashboard; the setup page polls for the first page view.
- The website's domain must match its Databuddy settings. On localhost, use the SDK's debug prop or the databuddy-debug.js script.
- If CSP is enabled, allow the tracker script's origin in script-src and ${new URL(publicConfig.urls.basket).origin} in connect-src. Check for blocked requests in DevTools.

More options: https://www.databuddy.cc/docs/getting-started

${agentFeedbackSection(publicConfig.urls.api, websiteId, setupSession)}`;
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
