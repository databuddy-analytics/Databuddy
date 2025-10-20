import type { TrackingOptionConfig } from '../utils/types';

// Toast messages
export const TOAST_MESSAGES = {
	SCRIPT_COPIED: 'Script tag copied to clipboard!',
	TRACKING_COPIED: 'Tracking code copied to clipboard!',
	COMMAND_COPIED: 'Command copied to clipboard!',
	WEBSITE_ID_COPIED: 'Website ID copied to clipboard!',
	SHAREABLE_LINK_COPIED: 'Shareable link copied to clipboard!',
	PRIVACY_UPDATING: 'Updating privacy settings...',
	PRIVACY_UPDATED: 'Privacy settings updated successfully',
	PRIVACY_ERROR: 'Failed to update privacy settings',
	WEBSITE_DELETING: 'Deleting website...',
	WEBSITE_DELETED: 'Website deleted successfully',
	WEBSITE_DELETE_ERROR: 'Failed to delete website',
} as const;

// Copy success timeout
export const COPY_SUCCESS_TIMEOUT = 2000;

// Basic tracking options configuration
export const BASIC_TRACKING_OPTIONS: TrackingOptionConfig[] = [
	{
		key: 'disabled',
		title: 'Enable Tracking',
		description: 'Master switch for all tracking functionality',
		required: false,
		inverted: true, // This option is inverted (checked when disabled is false)
		data: [
			'Controls whether any tracking occurs',
			'When disabled, no data is collected',
			'Useful for privacy compliance or testing',
		],
	},
	{
		key: 'trackScreenViews',
		title: 'Page Views',
		description: 'Track when users navigate to different pages',
		required: true,
		data: ['Page URL, title and referrer', 'Timestamp', 'User session ID'],
	},
	{
		key: 'trackHashChanges',
		title: 'Hash Changes',
		description: 'Track navigation using URL hash changes (SPA routing)',
		data: [
			'Hash fragment changes',
			'Previous and new hash values',
			'Useful for single-page applications',
		],
	},
	{
		key: 'trackSessions',
		title: 'Sessions',
		description: 'Track user sessions and engagement',
		data: [
			'Session duration',
			'Session start/end times',
			'Number of pages visited',
			'Bounce detection',
		],
	},
	{
		key: 'trackInteractions',
		title: 'Interactions',
		description: 'Track button clicks and form submissions',
		data: [
			'Element clicked (button, link, etc.)',
			'Element ID, class and text content',
			'Form submission success/failure',
		],
	},
	{
		key: 'trackAttributes',
		title: 'Data Attributes',
		description: 'Track events automatically using HTML data-* attributes',
		data: [
			'Elements with data-track attributes',
			'All data-* attribute values converted to camelCase',
			'Automatic event generation from markup',
		],
	},
	{
		key: 'trackOutgoingLinks',
		title: 'Outbound Links',
		description: 'Track when users click links to external sites',
		data: ['Target URL', 'Link text', 'Page URL where link was clicked'],
	},
];

// Advanced tracking options configuration
export const ADVANCED_TRACKING_OPTIONS: TrackingOptionConfig[] = [
	{
		key: 'trackEngagement',
		title: 'Engagement Tracking',
		description: 'Track detailed user engagement metrics',
		data: [
			'Time on page',
			'Scroll behavior',
			'Mouse movements',
			'Interaction patterns',
		],
	},
	{
		key: 'trackScrollDepth',
		title: 'Scroll Depth',
		description: 'Track how far users scroll on pages',
		data: [
			'Maximum scroll percentage',
			'Scroll milestones (25%, 50%, 75%, 100%)',
			'Time spent at different scroll positions',
		],
	},
	{
		key: 'trackErrors',
		title: 'Error Tracking',
		description: 'Track JavaScript errors and exceptions',
		data: [
			'Error message and type',
			'Stack trace',
			'Browser and OS info',
			'Page URL where error occurred',
		],
	},
	{
		key: 'trackPerformance',
		title: 'Performance',
		description: 'Track page load and runtime performance',
		data: [
			'Page load time',
			'DOM content loaded time',
			'First paint and first contentful paint',
			'Resource timing',
		],
	},
	{
		key: 'trackWebVitals',
		title: 'Web Vitals',
		description: 'Track Core Web Vitals metrics',
		data: [
			'Largest Contentful Paint (LCP)',
			'First Input Delay (FID)',
			'Cumulative Layout Shift (CLS)',
			'Interaction to Next Paint (INP)',
		],
	},
	{
		key: 'trackExitIntent',
		title: 'Exit Intent',
		description: 'Track exit behavior',
		data: [
			'Mouse movement patterns',
			'Exit intent detection',
			'Time before exit',
		],
	},
	{
		key: 'trackBounceRate',
		title: 'Bounce Rate',
		description: 'Track bounce detection',
		data: [
			'Single page sessions',
			'Time spent on page',
			'Engagement threshold',
		],
	},
];

// Settings tabs
export const SETTINGS_TABS = {
	TRACKING: 'tracking' as const,
	BASIC: 'basic' as const,
	ADVANCED: 'advanced' as const,
	OPTIMIZATION: 'optimization' as const,
	PRIVACY: 'privacy' as const,
	EXPORT: 'export' as const,
};

// Package manager install commands
export const INSTALL_COMMANDS = {
	npm: 'npm install @databuddy/sdk',
	yarn: 'yarn add @databuddy/sdk',
	pnpm: 'pnpm add @databuddy/sdk',
	bun: 'bun add @databuddy/sdk',
} as const;
