import type { AppRouter } from "@databuddy/rpc";

export const HIDDEN_OPENAPI_ROUTERS = [
	"revenue",
	"billing",
] as const satisfies readonly (keyof AppRouter)[];

export type HiddenOpenApiRouter = (typeof HIDDEN_OPENAPI_ROUTERS)[number];

export const AVAILABLE_API_SCOPES =
	"read:data | track:events | read:links | write:links | read:monitors | write:monitors | read:status_pages | write:status_pages | manage:websites | manage:flags | manage:config";

export const OPENAPI_DESCRIPTION = `REST API for Databuddy analytics, link management, feature flags, uptime monitors, and status pages.

**Authentication:** Endpoints accept either session cookies (browser) or an API key. For programmatic access, use an API key.

**API Key usage:**
- Send in the \`x-api-key\` header, or
- Send as a Bearer token in the \`Authorization\` header: \`Authorization: Bearer <your-api-key>\`
- API keys must be scoped to an organization. Create keys in the dashboard under Organization -> API Keys.

**Scope requirements:** Some endpoints require specific API key scopes. Check each operation's \`x-required-scopes\` for requirements. Session authentication does not use scopes; access is determined by organization membership and role.

**Available scopes:** ${AVAILABLE_API_SCOPES}`;

export const API_KEY_DESCRIPTION = `API key for programmatic access. Use instead of session cookies when calling from servers, scripts, or external integrations.

**How to send:**
- \`x-api-key: <your-api-key>\` header (preferred), or
- \`Authorization: Bearer <your-api-key>\` header

**Scope requirements:** Session auth uses organization membership and roles; no scopes. API key auth may require scopes. Operations that require scopes include \`x-required-scopes\` in their schema.

**Available scopes:** ${AVAILABLE_API_SCOPES}

**Creating keys:** Keys are created in the dashboard (Organization -> API Keys) and must be scoped to an organization. Store the secret securely; it is shown only once.`;

export const OPENAPI_TAGS = [
	{
		name: "Alarms",
		description:
			"Alert rules and notifications for metrics and conditions across your workspace.",
	},
	{
		name: "Annotations",
		description:
			"Timeline annotations for marking events on charts. Create, update, and delete annotations tied to specific time ranges and chart contexts.",
	},
	{
		name: "API Keys",
		description:
			"Create, list, update, revoke, and verify API keys. Requires organization membership with website configure permission. API keys cannot be used to manage other API keys.",
	},
	{
		name: "Autocomplete",
		description:
			"Autocomplete suggestions for analytics filters: page paths, custom events, browsers, countries, UTM params, and more. Used to power filter dropdowns and search.",
	},
	{
		name: "Feedback",
		description: "Submit and manage product feedback tied to your workspace.",
	},
	{
		name: "Flags",
		description:
			"Feature flags for gradual rollouts and A/B testing. Create, update, and evaluate flags scoped to websites or organizations.",
	},
	{
		name: "Funnels",
		description:
			"Funnel conversion analysis. Define multi-step funnels, track conversions, and analyze funnel performance by referrer.",
	},
	{
		name: "Goals",
		description:
			"Conversion goals and analytics. Define goals (custom events, page views, etc.), track conversions, and retrieve goal analytics.",
	},
	{
		name: "Links",
		description:
			"Short link creation and management. Create, list, update, and delete short links with custom slugs. API keys require read:links or write:links scope.",
	},
	{
		name: "Organizations",
		description:
			"Workspace and organization management: avatar, invitations, billing context, and usage.",
	},
	{
		name: "Preferences",
		description:
			"User preferences for date and time formatting. Stored per-user, not per-organization.",
	},
	{
		name: "StatusPage",
		description:
			"Public status pages, incidents, and monitor visibility settings. API keys require read:status_pages or write:status_pages scope.",
	},
	{
		name: "Target Groups",
		description:
			"Audience targeting for feature flags. Define target groups by rules (country, referrer, etc.) and use them to target flag rollouts.",
	},
	{
		name: "Uptime",
		description:
			"Uptime monitor creation, updates, pause/resume controls, and manual checks. API keys require read:monitors or write:monitors scope.",
	},
	{
		name: "Websites",
		description:
			"Website management: create, list, update, delete websites; transfer between workspaces; configure settings, tracking, and data export.",
	},
] as const;
