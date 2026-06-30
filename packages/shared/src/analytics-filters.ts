export const goalFunnelFilterFields = [
	{ value: "event_name", label: "Event Name" },
	{ value: "path", label: "Page Path" },
	{ value: "referrer", label: "Referrer" },
	{ value: "country", label: "Country" },
	{ value: "city", label: "City" },
	{ value: "device_type", label: "Device Type" },
	{ value: "browser_name", label: "Browser" },
	{ value: "os_name", label: "Operating System" },
	{ value: "language", label: "Language" },
	{ value: "utm_source", label: "UTM Source" },
	{ value: "utm_medium", label: "UTM Medium" },
	{ value: "utm_campaign", label: "UTM Campaign" },
	{ value: "utm_term", label: "UTM Term" },
	{ value: "utm_content", label: "UTM Content" },
	{ value: "user_agent", label: "User Agent" },
	{ value: "screen_resolution", label: "Screen Resolution" },
] as const;

export type GoalFunnelFilterField =
	(typeof goalFunnelFilterFields)[number]["value"];

export const goalFunnelFilterFieldSet: ReadonlySet<string> = new Set(
	goalFunnelFilterFields.map((f) => f.value)
);
