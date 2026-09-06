import { z } from "zod";

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

/** Read-only segmentation, restricted to context rather than funnel step selectors. */
export const analyticsCohortSchema = z
	.strictObject({
		filters: z
			.array(
				z.strictObject({
					field: z.enum([
						"browser_name",
						"device_type",
						"os_name",
						"country",
						"referrer",
						"utm_source",
						"utm_medium",
						"utm_campaign",
					]),
					operator: z.enum(["equals", "not_equals", "in", "not_in"]),
					value: z.union([
						z.string().min(1),
						z.array(z.string().min(1)).min(1).max(50),
					]),
				})
			)
			.min(1)
			.max(8),
	})
	.describe(
		"Read-only cohort. Funnel filters select first-step visitors; subsequent ordered steps may have different context. Goal filters select page-view visitors and matching completions. Saved filters are ANDed. These are visitors, not attempts."
	);
