export const COPY_SUCCESS_TIMEOUT = 2000;
export const BATCH_SIZE_LIMITS = { min: 1, max: 10 } as const;
export const RETRY_LIMITS = { min: 1, max: 10 } as const;
export const TIMEOUT_LIMITS = { min: 100, max: 5000, step: 100 } as const;
export const SAMPLING_RATE_LIMITS = { min: 1, max: 100, step: 1 } as const;

export const SETTINGS_TABS = {
	TRACKING: "tracking",
	BASIC: "basic",
	ADVANCED: "advanced",
	OPTIMIZATION: "optimization",
	PRIVACY: "privacy",
	EXPORT: "export",
} as const;

export type SettingsTab = (typeof SETTINGS_TABS)[keyof typeof SETTINGS_TABS];

export const TOAST_MESSAGES = {
	SCRIPT_COPIED: "Script tag copied to clipboard!",
	TRACKING_COPIED: "Tracking code copied to clipboard!",
	COMMAND_COPIED: "Command copied to clipboard!",
	WEBSITE_ID_COPIED: "Website ID copied to clipboard",
	SHAREABLE_LINK_COPIED: "Shareable link copied to clipboard!",
	PRIVACY_UPDATING: "Updating privacy settings...",
	PRIVACY_UPDATED: "Privacy settings updated!",
	PRIVACY_ERROR: "Failed to update settings.",
	WEBSITE_DELETING: "Deleting website...",
	WEBSITE_DELETED: "Website deleted successfully!",
	WEBSITE_DELETE_ERROR: "Failed to delete website.",
} as const;

export const PACKAGE_MANAGERS = {
	NPM: "npm",
	YARN: "yarn",
	PNPM: "pnpm",
	BUN: "bun",
} as const;

export const INSTALL_COMMANDS = {
	[PACKAGE_MANAGERS.NPM]: "npm install @databuddy/sdk",
	[PACKAGE_MANAGERS.YARN]: "yarn add @databuddy/sdk",
	[PACKAGE_MANAGERS.PNPM]: "pnpm add @databuddy/sdk",
	[PACKAGE_MANAGERS.BUN]: "bun add @databuddy/sdk",
} as const;

export const CODE_LANGUAGES = {
	BASH: "bash",
	HTML: "html",
	JSX: "jsx",
	JAVASCRIPT: "javascript",
} as const;

export const DOCUMENTATION_URLS = {
	DOCS: "https://www.databuddy.cc/docs",
	API: "https://www.databuddy.cc/docs/api",
} as const;

export const BADGE_STATUS = {
	READY: "Ready",
	CUSTOM: "Custom",
	DEFAULT: "Default",
} as const;

export const WARNING_MESSAGES = {
	PAGE_VIEWS_REQUIRED:
		"Disabling page views will prevent analytics from working. This option is required.",
	DELETE_WARNING: "Warning:",
	DELETE_CONSEQUENCES: [
		"All analytics data will be permanently deleted",
		"Tracking will stop immediately",
		"All website settings will be lost",
	],
} as const;
