export const filterOptions = [
	{ value: "path", label: "Page Path" },
	{ value: "query_string", label: "Query String" },
	{ value: "referrer", label: "Referrer" },
	{ value: "country", label: "Country" },
	{ value: "device_type", label: "Device Type" },
	{ value: "browser_name", label: "Browser" },
	{ value: "os_name", label: "Operating System" },
	{ value: "utm_source", label: "UTM Source" },
	{ value: "utm_medium", label: "UTM Medium" },
	{ value: "utm_campaign", label: "UTM Campaign" },
] as const;

export const tableFilterMapping: Record<string, string> = {
	"Traffic Sources": "referrer",
	Pages: "path",
	Devices: "device_type",
	Browsers: "browser_name",
	"Operating Systems": "os_name",
};
