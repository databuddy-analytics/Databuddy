import type { TrackingOptionConfig } from "../utils/types";

export const COPY_SUCCESS_TIMEOUT = 2000;

export const TOAST_MESSAGES = {
	SCRIPT_COPIED: "Script tag copied to clipboard!",
	TRACKING_COPIED: "Tracking code copied to clipboard!",
	COMMAND_COPIED: "Command copied to clipboard!",
	WEBSITE_ID_COPIED: "Client ID copied to clipboard",
	SHAREABLE_LINK_COPIED: "Shareable link copied to clipboard!",
	PRIVACY_UPDATING: "Updating privacy settings...",
	PRIVACY_UPDATED: "Privacy settings updated!",
	PRIVACY_ERROR: "Failed to update settings.",
	WEBSITE_DELETING: "Deleting website...",
	WEBSITE_DELETED: "Website deleted successfully!",
	WEBSITE_DELETE_ERROR: "Failed to delete website.",
} as const;

const PACKAGE_MANAGERS = {
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

export const ADVANCED_TRACKING_OPTIONS: TrackingOptionConfig[] = [
	{
		key: "trackWebVitals",
		title: "Web Vitals",
		description: "Track page performance and Core Web Vitals",
		data: ["FCP", "LCP", "CLS", "INP", "TTFB", "FPS"],
	},
	{
		key: "trackErrors",
		title: "Error Tracking",
		description: "Capture JavaScript errors and exceptions",
		data: ["Error message", "Stack trace", "File location"],
	},
];
