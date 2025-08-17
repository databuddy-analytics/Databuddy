export const filterOptions = [
	{ value: 'browser_name', label: 'Browser' },
	{ value: 'os_name', label: 'Operating System' },
	{ value: 'country', label: 'Country' },
	{ value: 'device_type', label: 'Device Type' },
	{ value: 'utm_source', label: 'UTM Source' },
	{ value: 'utm_medium', label: 'UTM Medium' },
	{ value: 'utm_campaign', label: 'UTM Campaign' },
	{ value: 'referrer', label: 'Referrer' },
	{ value: 'path', label: 'Page Path' },
] as const;

// Table title to filter field mapping - use exact database column names
export const tableFilterMapping: Record<string, string> = {
	'Traffic Sources': 'referrer',
	Pages: 'path',
	Devices: 'device_type',
	Browsers: 'browser_name',
	'Operating Systems': 'os_name',
};

// Map display device names back to filter values
export const deviceDisplayToFilterMap: Record<string, string> = {
	laptop: 'laptop',
	tablet: 'tablet',
	desktop: 'desktop',
};
