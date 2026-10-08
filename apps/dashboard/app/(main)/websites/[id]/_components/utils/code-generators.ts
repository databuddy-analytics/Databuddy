import { isSelfHosted, publicConfig } from "@databuddy/env/public";
import type { OnboardingWant } from "@databuddy/shared/custom-events";
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

export function aiCrawlerSetupPrompt(websiteId: string): string {
	return `Set up Databuddy AI crawler tracking in this project.

GPTBot, ClaudeBot and most AI crawlers don't run JavaScript, so the Databuddy script never sees them. The server has to report them, with one line from @databuddy/sdk/agents.

1. Install @databuddy/sdk@latest with this project's package manager.
2. Find where requests enter the app and add tracking there:
   - Next.js 16 without a proxy.ts: create proxy.ts with \`export { proxy } from "@databuddy/sdk/agents";\`
   - Next.js 15 or earlier without a middleware.ts: create middleware.ts with \`export { proxy as middleware } from "@databuddy/sdk/agents";\`
   - Other frameworks on Vercel without middleware: create middleware.ts at the project root with \`export { proxy as default } from "@databuddy/sdk/agents";\`
   - Everywhere else, or when a proxy, middleware or edge function already exists: call \`trackAgents(request)\` from "@databuddy/sdk/agents" on every request inside it, without awaiting it, and keep the existing logic. Hand the promise to waitUntil where the platform has one: event.waitUntil in Next.js, ctx.waitUntil in Cloudflare Workers, context.waitUntil in Netlify Edge Functions.
3. Make sure no matcher or config skips .md, .txt or llms.txt paths, so markdown and llms.txt reads are recorded.
4. Set the website ID to ${websiteId}: NEXT_PUBLIC_DATABUDDY_CLIENT_ID in Next.js (already set if the Databuddy SDK is installed), DATABUDDY_WEBSITE_ID elsewhere, or pass it as the websiteId option.
5. After deploying, ask me to open the AI agents page in Databuddy and press Test setup.

Docs: https://www.databuddy.cc/docs/sdk/ai-agents`;
}

const AGENT_FEATURE_GUIDE = `## What to enable, and when

Page views and sessions are automatic. Turn on the rest based on what the codebase tells you, and say which ones you enabled and why:

| Option | Enable when |
|--------|-------------|
| trackWebVitals | Always. Powers the Web Vitals page (LCP, CLS, INP, TTFB). |
| trackErrors | Always for apps with client-side JavaScript. Powers the Errors page. |
| trackOutgoingLinks | Marketing sites, docs, link-heavy pages. Records clicks that leave the site. |
| trackInteractions | On by default (rage clicks, dead clicks, form drop-off). Set it to false only where the site owner does not want click analytics. |
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
	wants?: OnboardingWant[];
}

const WANT_INSTRUCTIONS: Partial<Record<OnboardingWant, string>> = {
	conversions:
		"**Sign-ups and revenue**: custom events are required, not optional. Find sign-up, checkout or purchase, and the first successful use, and fire one `track()` call at each. If the codebase uses Stripe or Paddle, also pass `getTrackingIds()` from `@databuddy/sdk` as metadata when the checkout session or transaction is created, then tell the user to connect the webhook on the Revenue page.",
	performance:
		"**Speed and errors**: keep trackWebVitals and trackErrors on. If the site has a Content Security Policy, make sure it allows the script so errors are reported.",
	ai_visibility:
		"**AI crawlers**: set up AI crawler tracking now, as described under Features below. It is required, not optional.",
	mcp: "**MCP analytics**: if this repository contains an MCP server, tell the user. The setup page has a separate prompt for it.",
};

function wantsSection(wants?: OnboardingWant[]): string {
	const lines = (wants ?? []).flatMap((want) => {
		const instruction = WANT_INSTRUCTIONS[want];
		return instruction ? [`- ${instruction}`] : [];
	});
	if (!lines.length) {
		return "";
	}
	return `## What the team wants from Databuddy

The team picked these during setup. Treat them as requirements:

${lines.join("\n")}

`;
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
	// Cloud prompts always point at the public endpoints, whatever the dashboard
	// build was configured with; self-hosted prompts carry the instance URLs.
	const basketUrl = isSelfHosted
		? publicConfig.urls.basket
		: "https://basket.databuddy.cc";
	const apiUrl = isSelfHosted
		? publicConfig.urls.api
		: "https://api.databuddy.cc";
	const basketOrigin = new URL(basketUrl).origin;
	return `Add Databuddy analytics to this repository. Client ID: ${websiteId}
${
	isSelfHosted
		? `\nThis is a self-hosted Databuddy instance. Events go to ${basketUrl}, so keep the apiUrl / data-api-url shown in every snippet.\n`
		: ""
}
## References
- Getting started: https://www.databuddy.cc/docs/getting-started
- LLMs.txt: https://www.databuddy.cc/llms.txt
- Full docs: https://www.databuddy.cc/docs

## Installation

Detect the framework from the codebase, then pick one method and follow the existing code style.

**React / Next.js** — \`bun add @databuddy/sdk\` (or npm/yarn/pnpm, matching the repository's lockfile), then mount once at the app root (app/layout.tsx or _app.tsx):
\`\`\`tsx
${generateNpmCode(websiteId, RECOMMENDED_DEFAULTS)}
\`\`\`

**Vue / Nuxt** — \`bun add @databuddy/sdk\`
\`\`\`vue
${generateVueCode(websiteId, RECOMMENDED_DEFAULTS)}
\`\`\`

**Anything else (Astro, Svelte, static HTML, WordPress, Webflow)** — script in \`<head>\` of every page:
\`\`\`html
${generateScriptTag(websiteId, RECOMMENDED_DEFAULTS)}
\`\`\`

The snippets show the Client ID inline. Store the Client ID in an env var and read it from there in React and Vue code:
- Next.js: NEXT_PUBLIC_DATABUDDY_CLIENT_ID
- Vite / Vue: VITE_DATABUDDY_CLIENT_ID
- Nuxt: NUXT_PUBLIC_DATABUDDY_CLIENT_ID

Every option works as a React/Vue prop or a \`data-*\` attribute on the script tag.

${siteContextSection(context)}${wantsSection(context?.wants)}${AGENT_FEATURE_GUIDE}

## Verification

1. Start the app and open it in a browser on a non-localhost host, or use the debug build (\`https://cdn.databuddy.cc/databuddy-debug.js\` or the \`debug\` prop) on localhost.
2. In DevTools → Network, confirm \`cdn.databuddy.cc/databuddy.js\` loads and requests to \`${basketOrigin}\` return 200 with this Client ID in the payload.
3. The Databuddy setup page polls for the first page view and marks tracking verified on its own.

## Common issues

- **Domain mismatch**: events from a domain that is not the website's configured domain are blocked. Add staging or preview domains under Settings → Security → Allowed origins, or install on the production domain.
- **Content Security Policy**: allow \`https://cdn.databuddy.cc\` in script-src and \`${basketOrigin}\` in connect-src.
- **Ad blockers** can block the script locally. Test with extensions disabled; a custom tracking domain avoids it in production.
- **Localhost is ignored by default**: deploy or use the debug build.
- **Script not loading**: it belongs in \`<head>\`, not \`<body>\`; check the URL and the console.
- **Another analytics tool is present**: both can run side by side. Leave the other tool in place unless the user asks to replace it.

${agentFeedbackSection(apiUrl, websiteId, setupSession)}`;
}

export function generateMcpAgentPrompt(apiKey?: string): string {
	const basketOption = isSelfHosted
		? `, { apiUrl: ${JSON.stringify(publicConfig.urls.basket)} }`
		: "";
	const dashboardUrl = isSelfHosted
		? publicConfig.urls.dashboard
		: "https://app.databuddy.cc";
	return `Add Databuddy MCP analytics to the MCP server in this repository, so every tool call shows up on the Databuddy MCP Analytics page: which tools AI clients call, how fast they answer, and why they fail. Tool arguments and successful results never leave the server; only the length of the returned text and the error message of failed calls are sent.

## References
- MCP analytics docs: https://www.databuddy.cc/docs/sdk/mcp
- LLMs.txt: https://www.databuddy.cc/llms.txt

## Steps

1. Find the MCP server. Look for \`@modelcontextprotocol/sdk\` (\`McpServer\` or the low-level \`Server\`), \`@modelcontextprotocol/server\` (\`createMcpHandler\`, \`serveStdio\`) or Vercel's \`mcp-handler\`. If there are several servers, instrument each one and give each a distinct \`name\`.
2. Install the SDK with the package manager that matches the lockfile: \`bun add @databuddy/sdk@latest\` (or npm, pnpm, yarn).
3. Wrap the server once, where it is created, before or after tools are registered:
\`\`\`ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { trackMcp } from "@databuddy/sdk/mcp";

const server = trackMcp(
  new McpServer({ name: "my-server", version: "1.0.0" })${basketOption}
);
\`\`\`
   - \`@modelcontextprotocol/server\` 2.x builds a server per request, so call \`trackMcp\` inside the \`createMcpHandler\` or \`serveStdio\` factory.
   - Vercel \`mcp-handler\`: call \`trackMcp(server)\` inside the callback it passes the server to, and set \`serverInfo: { name, version }\`.
4. Read the API key from \`DATABUDDY_API_KEY\`. Never hardcode or commit it. ${apiKey ? `The key is \`${apiKey}\`: put it in the server's local env file (make sure that file is gitignored) and tell me to add it to the hosting provider's secrets.` : `Ask me to create a key with the Event Tracking scope at ${dashboardUrl}/organizations/settings#api-keys.`} Add \`DATABUDDY_API_KEY=\` without a value to \`.env.example\` if the repository has one.
5. Serverless (Vercel, Cloudflare Workers, Netlify, AWS Lambda): a function can stop before the batch is sent, so pass the platform's \`waitUntil\`: \`trackMcp(server, { waitUntil })\`. On Vercel import it from \`@vercel/functions\`; on Cloudflare Workers import \`env\` and \`waitUntil\` from \`cloudflare:workers\` and pass \`apiKey: env.DATABUDDY_API_KEY\`.
6. stdio servers started by a desktop client (Claude Desktop, Cursor, VS Code) only receive the variables in the client config, so \`DATABUDDY_API_KEY\` belongs in the server's \`env\` block there. Update any client config examples in the README accordingly.
7. If the server ends itself with \`process.exit\`, for example in a SIGINT or SIGTERM handler, call \`await flushMcp()\` (from \`@databuddy/sdk/mcp\`) first.
8. Only if the server has no error convention yet: return failed tool calls as \`isError\` results whose text is JSON with a stable, low-cardinality snake_case code, for example \`{"error":{"code":"not_found","message":"Website not found"}}\`. The MCP Analytics page groups failures by that code. Do not rewrite existing error handling.

## Verification

1. Run the server with \`DATABUDDY_API_KEY\` set and call any tool once, for example with \`npx @modelcontextprotocol/inspector\`.
2. Temporarily pass \`debug: true\` to \`trackMcp\` to log a missing key or a rejected batch to stderr, then remove it.
3. The Databuddy MCP Analytics page checks for the first call every few seconds and switches to the analytics view on its own.

## Common issues

- **401 or 403 from basket**: the key is wrong, or it lacks the Event Tracking scope. A key limited to some websites can only send calls linked to one of them.
- **Nothing arrives from a stdio server**: the key is set in the shell but not in the client config's \`env\`.
- **Nothing arrives on serverless**: \`waitUntil\` is missing.
`;
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
			// Pinned bundles can predate the default-on behavior.
			if (versionedScript && key === "trackInteractions" && value === true) {
				return true;
			}
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
