import type { TrackingOptionConfig } from "../utils/types";

// Toast messages
export const TOAST_MESSAGES = {
	SCRIPT_COPIED: "Script tag copied to clipboard!",
	TRACKING_COPIED: "Tracking code copied to clipboard!",
	COMMAND_COPIED: "Command copied to clipboard!",
	WEBSITE_ID_COPIED: "Website ID copied to clipboard!",
	SHAREABLE_LINK_COPIED: "Shareable link copied to clipboard!",
	PRIVACY_UPDATING: "Updating privacy settings...",
	PRIVACY_UPDATED: "Privacy settings updated successfully",
	PRIVACY_ERROR: "Failed to update privacy settings",
	WEBSITE_DELETING: "Deleting website...",
	WEBSITE_DELETED: "Website deleted successfully",
	WEBSITE_DELETE_ERROR: "Failed to delete website",
} as const;

// Copy success timeout
export const COPY_SUCCESS_TIMEOUT = 2000;

// Basic tracking options configuration
export const BASIC_TRACKING_OPTIONS: TrackingOptionConfig[] = [
	{
		key: "disabled",
		title: "Enable Tracking",
		description: "Master switch for all tracking functionality",
		inverted: true,
		data: [
			"Controls whether any tracking occurs",
			"When disabled, no data is collected",
		],
	},
	{
		key: "trackHashChanges",
		title: "Hash Changes",
		description: "Track URL hash changes for SPA routing",
		data: ["Hash fragment changes", "Useful for single-page applications"],
	},
	{
		key: "trackAttributes",
		title: "Data Attributes",
		description: "Auto-track via data-track HTML attributes",
		data: ["Elements with data-track", "Auto camelCase conversion"],
	},
	{
		key: "trackOutgoingLinks",
		title: "Outbound Links",
		description: "Track clicks to external sites",
		data: ["Target URL", "Link text"],
	},
	{
		key: "trackInteractions",
		title: "Interactions",
		description: "Track button clicks and form submissions",
		data: ["Element clicked", "Form submissions"],
	},
];

// Advanced tracking options configuration
export const ADVANCED_TRACKING_OPTIONS: TrackingOptionConfig[] = [
	{
		key: "trackPerformance",
		title: "Performance",
		description: "Track page load and runtime performance",
		data: ["Page load time", "DOM ready", "First paint"],
	},
	{
		key: "trackWebVitals",
		title: "Web Vitals",
		description: "Track Core Web Vitals (LCP, FID, CLS, INP)",
		data: ["LCP", "FID", "CLS", "INP", "TTFB"],
	},
	{
		key: "trackErrors",
		title: "Error Tracking",
		description: "Capture JavaScript errors and exceptions",
		data: ["Error message", "Stack trace", "File location"],
	},
	{
		key: "trackScrollDepth",
		title: "Scroll Depth",
		description: "Track how far users scroll on pages",
		data: ["Max scroll %", "Scroll milestones"],
	},
];

// Settings tabs
export const SETTINGS_TABS = {
	TRACKING: "tracking" as const,
	BASIC: "basic" as const,
	ADVANCED: "advanced" as const,
	OPTIMIZATION: "optimization" as const,
	PRIVACY: "privacy" as const,
	EXPORT: "export" as const,
};

// Package manager install commands
export const INSTALL_COMMANDS = {
	npm: "npm install @databuddy/sdk",
	yarn: "yarn add @databuddy/sdk",
	pnpm: "pnpm add @databuddy/sdk",
	bun: "bun add @databuddy/sdk",
} as const;
