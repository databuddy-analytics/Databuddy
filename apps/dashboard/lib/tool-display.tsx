import { isRecord } from "@/lib/ai-components/message-parts";

type Input = Record<string, unknown>;

export interface ToolApprovalField {
	code: boolean;
	key: string;
	label: string;
	value: string;
}

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
	uptime: "uptime",
	links: "links",
};

function confirmLabel(input: Input, pending: string, active: string): string {
	return input.confirmed === true ? active : pending;
}

const INVESTIGATION_LABELS: Record<string, string> = {
	brief: "Reading insights",
	list: "Listing investigations",
	get: "Reading investigation",
	reply: "Replying to investigation",
};

const HIDDEN_APPROVAL_FIELDS = new Set([
	"chartContext",
	"chartType",
	"confirmed",
	"limit",
	"offset",
	"replyId",
]);
const FIELD_WORD_BOUNDARY = /([a-z0-9])([A-Z])/g;
const FIELD_ACRONYM = /\b(id|og|url)\b/g;

function crudLabel(
	entity: string
): (action: string) => (input: Input) => string {
	return (action) => (input) => {
		const pendingMap: Record<string, string> = {
			create: `Preparing ${entity}`,
			update: `Preparing ${entity} update`,
			delete: `Preparing ${entity} deletion`,
		};
		const activeMap: Record<string, string> = {
			create: `Creating ${entity}`,
			update: `Updating ${entity}`,
			delete: `Deleting ${entity}`,
		};
		return confirmLabel(
			input,
			pendingMap[action] ?? `Processing ${entity}`,
			activeMap[action] ?? `Processing ${entity}`
		);
	};
}

const TOOL_LABELS: Record<string, (input: Input) => string> = {
	dashboard_actions: () => "Preparing dashboard action",
	execute_sql_query: () => "Running custom query",
	get_data: (input) => {
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

	list_links: () => "Fetching links",
	create_link: crudLabel("link")("create"),
	update_link: crudLabel("link")("update"),
	delete_link: crudLabel("link")("delete"),

	list_funnels: () => "Fetching funnels",
	get_funnel_analytics: () => "Analyzing funnel",
	get_funnel_analytics_by_referrer: () => "Analyzing funnel by source",
	create_funnel: crudLabel("funnel")("create"),

	create_flag: crudLabel("flag")("create"),
	update_flag: crudLabel("flag")("update"),
	add_users_to_flag: (input) =>
		confirmLabel(input, "Preparing flag targeting", "Updating flag targeting"),

	investigations: (input) =>
		INVESTIGATION_LABELS[String(input.action)] ?? "Reading investigations",
	configure_investigations: (input) => {
		if (input.action === "run") {
			return confirmLabel(
				input,
				"Preparing investigation run",
				"Starting investigation run"
			);
		}
		if (input.action === "configure") {
			return confirmLabel(
				input,
				"Preparing investigation settings",
				"Updating investigation settings"
			);
		}
		return "Checking investigation settings";
	},

	list_goals: () => "Fetching goals",
	get_goal_analytics: () => "Analyzing goal",
	create_goal: crudLabel("goal")("create"),
	update_goal: crudLabel("goal")("update"),
	delete_goal: crudLabel("goal")("delete"),

	list_annotations: () => "Fetching annotations",
	create_annotation: crudLabel("annotation")("create"),
	update_annotation: crudLabel("annotation")("update"),
	delete_annotation: crudLabel("annotation")("delete"),

	list_profiles: () => "Listing visitors",
	get_profile: () => "Getting visitor profile",
	get_profile_sessions: () => "Loading visitor sessions",

	search_memory: () => "Recalling memories",
	save_memory: () => "Saving memory",
	forget_memory: () => "Forgetting memory",
};

export function formatToolLabel(toolName: string, input: Input): string {
	const labelFn = TOOL_LABELS[toolName];
	return labelFn ? labelFn(input) : "Processing";
}

function formatFieldLabel(key: string): string {
	const words = key
		.replace(FIELD_WORD_BOUNDARY, "$1 $2")
		.toLowerCase()
		.replace(FIELD_ACRONYM, (word) => word.toUpperCase());
	return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function formatRecord(record: Record<string, unknown>): string {
	return Object.entries(record)
		.map(
			([key, value]) =>
				`${key}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}`
		)
		.join(", ");
}

function isStructured(value: unknown): boolean {
	return Array.isArray(value) ? value.some(isRecord) : isRecord(value);
}

function formatFieldValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "None";
	}
	if (typeof value === "boolean") {
		return value ? "Yes" : "No";
	}
	if (!Array.isArray(value)) {
		return isRecord(value) ? formatRecord(value) : String(value);
	}
	return isStructured(value)
		? value
				.map((item) => (isRecord(item) ? formatRecord(item) : String(item)))
				.join("\n")
		: value.join(", ");
}

export function formatToolApprovalFields(input: Input): ToolApprovalField[] {
	return Object.entries(input)
		.filter(([key]) => !HIDDEN_APPROVAL_FIELDS.has(key))
		.map(([key, value]) => ({
			code: isStructured(value),
			key,
			label: formatFieldLabel(key),
			value: formatFieldValue(value),
		}));
}
