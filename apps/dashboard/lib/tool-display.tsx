import type { ReactNode } from "react";

type Input = Record<string, unknown>;
type Output = Record<string, unknown>;

const QUERY_LABELS: Record<string, string> = {
	traffic: "traffic",
	sessions: "sessions",
	devices: "devices",
	browsers: "browsers",
	os: "operating systems",
	countries: "geo data",
	cities: "cities",
	regions: "regions",
	pages: "pages",
	referrers: "referrers",
	sources: "traffic sources",
	utm: "UTM parameters",
	events: "events",
	custom_events: "custom events",
	vitals: "web vitals",
	performance: "performance",
	errors: "errors",
	summary: "summary",
	engagement: "engagement",
	profiles: "profiles",
	llm_analytics: "LLM analytics",
	uptime: "uptime",
	links: "links",
};

// Helper to count array results
function countArray(output: Output, key: string): number | null {
	const arr = output[key];
	return Array.isArray(arr) ? arr.length : null;
}

// Helper for confirmation-based labels
function confirmLabel(input: Input, pending: string, active: string): string {
	return input.confirmed === true ? active : pending;
}

// Helper for mutation outputs (preview/success states)
function mutationOutput(output: Output, successText: string): ReactNode | null {
	if (output.preview === true || output.confirmationRequired === true) {
		return <p className="text-muted-foreground">Preview ready</p>;
	}
	if (output.success === true) {
		return <p className="text-primary">{successText}</p>;
	}
	return null;
}

type ToolConfig = [
	(input: Input) => string,
	(output: Output) => ReactNode | null,
];

const TOOLS: Record<string, ToolConfig> = {
	// Query tools
	execute_query_builder: [
		(input) => {
			const type = input.type as string | undefined;
			const label = type
				? (QUERY_LABELS[type] ?? type.replace(/_/g, " "))
				: "analytics";
			return `Querying ${label}`;
		},
		(output) => {
			const count = countArray(output, "data") ?? countArray(output, "pages");
			return count === null ? null : <p>Found {count} results</p>;
		},
	],
	execute_sql_query: [
		() => "Running custom query",
		(output) => {
			const count = countArray(output, "data");
			return count === null ? null : <p>Found {count} results</p>;
		},
	],
	get_top_pages: [
		() => "Getting top pages",
		(output) => {
			const count = countArray(output, "pages");
			return count === null ? null : <p>Found {count} pages</p>;
		},
	],

	// Link tools
	list_links: [
		() => "Fetching links",
		(output) => {
			const count =
				countArray(output, "links") ?? (output.count as number | null);
			return count === null ? null : <p>Found {count} links</p>;
		},
	],
	get_link: [
		() => "Getting link details",
		(output) => {
			const link = output.link as Record<string, unknown> | undefined;
			return link?.slug ? <p>/{link.slug as string}</p> : null;
		},
	],
	create_link: [
		(input) => confirmLabel(input, "Preparing link", "Creating link"),
		(output) => {
			if (output.preview === true || output.confirmationRequired === true) {
				return <p className="text-muted-foreground">Preview ready</p>;
			}
			if (output.success === true) {
				const link = output.link as Record<string, unknown> | undefined;
				const slug = (link?.slug as string) ?? "link";
				return <p className="text-primary">Created /{slug}</p>;
			}
			return null;
		},
	],
	update_link: [
		(input) => confirmLabel(input, "Preparing update", "Updating link"),
		(output) => mutationOutput(output, "Link updated"),
	],
	delete_link: [
		(input) => confirmLabel(input, "Preparing deletion", "Deleting link"),
		(output) => {
			if (output.preview === true || output.confirmationRequired === true) {
				return <p className="text-muted-foreground">Confirm deletion</p>;
			}
			if (output.success === true) {
				return <p className="text-primary">Link deleted</p>;
			}
			return null;
		},
	],
	search_links: [
		() => "Searching links",
		(output) => {
			const count = countArray(output, "links");
			return count === null ? null : <p>Found {count} matches</p>;
		},
	],

	// Funnel tools
	list_funnels: [
		() => "Fetching funnels",
		(output) => {
			const count = countArray(output, "funnels");
			return count === null ? null : <p>Found {count} funnels</p>;
		},
	],
	get_funnel_by_id: [
		() => "Getting funnel details",
		(output) => {
			const funnel = output.funnel as Record<string, unknown> | undefined;
			return funnel?.name ? <p>{funnel.name as string}</p> : null;
		},
	],
	get_funnel_analytics: [
		() => "Analyzing funnel",
		(output) => {
			if ("conversionRate" in output) {
				const rate = output.conversionRate as number;
				const safeRate = rate == null || Number.isNaN(rate) ? 0 : rate;
				return <p>{(safeRate * 100).toFixed(1)}% conversion</p>;
			}
			return <p>Analysis complete</p>;
		},
	],
	get_funnel_analytics_by_referrer: [
		() => "Analyzing funnel by source",
		(output) => {
			const count = countArray(output, "data");
			return count === null ? (
				<p>Analysis complete</p>
			) : (
				<p>Found {count} sources</p>
			);
		},
	],
	create_funnel: [
		(input) => confirmLabel(input, "Preparing funnel", "Creating funnel"),
		(output) => mutationOutput(output, "Funnel created"),
	],
	update_funnel: [
		(input) => confirmLabel(input, "Preparing update", "Updating funnel"),
		(output) => mutationOutput(output, "Funnel updated"),
	],
	delete_funnel: [
		(input) => confirmLabel(input, "Preparing deletion", "Deleting funnel"),
		(output) => {
			if (output.preview === true || output.confirmationRequired === true) {
				return <p className="text-muted-foreground">Confirm deletion</p>;
			}
			if (output.success === true) {
				return <p className="text-primary">Funnel deleted</p>;
			}
			return null;
		},
	],

	// Goal tools
	list_goals: [
		() => "Fetching goals",
		(output) => {
			const count = countArray(output, "goals");
			return count === null ? null : <p>Found {count} goals</p>;
		},
	],
	get_goal_by_id: [
		() => "Getting goal details",
		(output) => {
			const goal = output.goal as Record<string, unknown> | undefined;
			return goal?.name ? <p>{goal.name as string}</p> : null;
		},
	],
	get_goal_analytics: [
		() => "Analyzing goal",
		(output) => {
			if ("overall_conversion_rate" in output) {
				const rate = output.overall_conversion_rate as number;
				const safeRate = rate == null || Number.isNaN(rate) ? 0 : rate;
				return <p>{safeRate.toFixed(1)}% conversion</p>;
			}
			return <p>Analysis complete</p>;
		},
	],
	create_goal: [
		(input) => confirmLabel(input, "Preparing goal", "Creating goal"),
		(output) => {
			if (output.preview === true || output.confirmationRequired === true) {
				return <p className="text-muted-foreground">Preview ready</p>;
			}
			if (output.success === true) {
				const goal = output.goal as Record<string, unknown> | undefined;
				const name = (goal?.name as string) ?? "goal";
				return <p className="text-primary">Created {name}</p>;
			}
			return null;
		},
	],
	update_goal: [
		(input) => confirmLabel(input, "Preparing update", "Updating goal"),
		(output) => mutationOutput(output, "Goal updated"),
	],
	delete_goal: [
		(input) => confirmLabel(input, "Preparing deletion", "Deleting goal"),
		(output) => {
			if (output.preview === true || output.confirmationRequired === true) {
				return <p className="text-muted-foreground">Confirm deletion</p>;
			}
			if (output.success === true) {
				return <p className="text-primary">Goal deleted</p>;
			}
			return null;
		},
	],

	// Annotation tools
	list_annotations: [
		() => "Fetching annotations",
		(output) => {
			const count = countArray(output, "annotations");
			return count === null ? null : <p>Found {count} annotations</p>;
		},
	],
	get_annotation_by_id: [
		() => "Getting annotation",
		(output) => {
			const text = output.text as string | undefined;
			return text ? <p className="max-w-[200px] truncate">{text}</p> : null;
		},
	],
	create_annotation: [
		(input) =>
			confirmLabel(input, "Preparing annotation", "Creating annotation"),
		(output) => mutationOutput(output, "Annotation created"),
	],
	update_annotation: [
		(input) => confirmLabel(input, "Preparing update", "Updating annotation"),
		(output) => mutationOutput(output, "Annotation updated"),
	],
	delete_annotation: [
		(input) => confirmLabel(input, "Preparing deletion", "Deleting annotation"),
		(output) => {
			if (output.preview === true || output.confirmationRequired === true) {
				return <p className="text-muted-foreground">Confirm deletion</p>;
			}
			if (output.success === true) {
				return <p className="text-primary">Annotation deleted</p>;
			}
			return null;
		},
	],

	// Batch query tool
	get_data: [
		(input) => {
			const queries = input.queries as { type: string }[] | undefined;
			if (queries?.length) {
				const types = queries
					.map((q) => QUERY_LABELS[q.type] ?? (q.type ?? "").replace(/_/g, " "))
					.slice(0, 3)
					.join(", ");
				return `Querying ${types}`;
			}
			return "Fetching analytics";
		},
		(output) => {
			const results = output.results as Record<string, unknown> | undefined;
			const count = results ? Object.keys(results).length : 0;
			return count > 0 ? <p>Loaded {count} datasets</p> : null;
		},
	],

	// Profile tools
	list_profiles: [
		() => "Listing visitors",
		(output) => {
			const count =
				countArray(output, "profiles") ?? (output.count as number | null);
			return count === null ? null : <p>Found {count} visitors</p>;
		},
	],
	get_profile: [
		() => "Getting visitor profile",
		(output) => {
			const profile = output.profile as Record<string, unknown> | undefined;
			return profile?.country ? <p>{profile.country as string}</p> : null;
		},
	],
	get_profile_sessions: [
		() => "Loading visitor sessions",
		(output) => {
			const count =
				countArray(output, "sessions") ?? (output.count as number | null);
			return count === null ? null : <p>Found {count} sessions</p>;
		},
	],

	// Web search
	web_search: [
		(input) => {
			const query = input.query as string | undefined;
			return query ? `Searching: ${query.slice(0, 40)}` : "Searching the web";
		},
		() => <p>Search complete</p>,
	],

	// Misc tools
	competitor_analysis: [
		() => "Analyzing competitors",
		(output) => (output.success === true ? <p>Analysis complete</p> : null),
	],
};

export function formatToolLabel(toolName: string, input: Input): string {
	const config = TOOLS[toolName];
	return config ? config[0](input) : "Processing";
}

export function formatToolOutput(
	toolName: string,
	output: unknown
): ReactNode | null {
	// Parse output
	let parsed: Output;
	if (typeof output === "string") {
		try {
			parsed = JSON.parse(output) as Output;
		} catch {
			return null;
		}
	} else if (typeof output === "object" && output !== null) {
		parsed = output as Output;
	} else {
		return null;
	}

	// Handle errors
	if ("errorText" in parsed && typeof parsed.errorText === "string") {
		return <p className="text-destructive">Error: {parsed.errorText}</p>;
	}

	const config = TOOLS[toolName];
	return config ? config[1](parsed) : null;
}
