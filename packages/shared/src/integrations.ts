export const GOOGLE_SEARCH_CONSOLE_PROVIDER_ID = "google-search-console";
export const GOOGLE_SEARCH_CONSOLE_SCOPE =
	"https://www.googleapis.com/auth/webmasters.readonly";

// Keep production rollout decisions in code until an integration is ready for everyone.
// OAuth credentials remain environment configuration; this map only controls availability.
export const INTEGRATION_PRODUCTION_READY = {
	[GOOGLE_SEARCH_CONSOLE_PROVIDER_ID]: false,
} as const;
