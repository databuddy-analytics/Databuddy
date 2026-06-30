const COMPONENT_START_REGEX = /\{\s*"type"\s*:\s*"([^"]+)"/g;
const CLOSING_JSON_FENCE_REGEX = /^\s*```/;
const TRAILING_JSON_FENCE_REGEX = /```(?:json)?\s*$/i;
const TRAILING_SLASH_REGEX = /\/$/;
const PARTIAL_COMPONENT_LOOKBACK_CHARS = 80;
const MAX_TABLE_ROWS = 8;
const MAX_LIST_ITEMS = 10;

const SUPPORTED_DASHBOARD_COMPONENT_TYPES = new Set([
	"line-chart",
	"bar-chart",
	"area-chart",
	"stacked-bar-chart",
	"pie-chart",
	"donut-chart",
	"data-table",
	"referrers-list",
	"mini-map",
	"links-list",
	"link-preview",
	"funnels-list",
	"funnel-preview",
	"goals-list",
	"goal-preview",
	"annotations-list",
	"annotation-preview",
]);

export interface SlackRenderedAgentOutput {
	convertedComponents: number;
	droppedComponents: number;
	markdown: string;
}

interface SlackOutputRenderOptions {
	streaming?: boolean;
}

type DashboardComponentPayload = Record<string, unknown> & { type: string };

type OutputSegment =
	| { kind: "text"; text: string }
	| { component: DashboardComponentPayload; kind: "component" };

export function renderAgentOutputForSlack(
	raw: string,
	options: SlackOutputRenderOptions = {}
): SlackRenderedAgentOutput {
	const { droppedComponents, segments } = parseAgentOutputSegments(
		raw,
		options
	);
	let convertedComponents = 0;
	const markdown = segments
		.map((segment) => {
			if (segment.kind === "text") {
				return segment.text.trim();
			}
			convertedComponents++;
			return renderDashboardComponent(segment.component);
		})
		.filter(Boolean)
		.join("\n\n")
		.trim();

	return { convertedComponents, droppedComponents, markdown };
}

function parseAgentOutputSegments(
	raw: string,
	options: SlackOutputRenderOptions
): { droppedComponents: number; segments: OutputSegment[] } {
	const segments: OutputSegment[] = [];
	let droppedComponents = 0;
	let index = 0;

	while (index < raw.length) {
		COMPONENT_START_REGEX.lastIndex = index;
		const match = COMPONENT_START_REGEX.exec(raw);
		if (!match) {
			appendTextSegment(
				segments,
				options.streaming
					? hidePotentialPartialComponent(raw.slice(index))
					: raw.slice(index)
			);
			break;
		}

		const start = match.index;
		const type = match[1];
		if (!SUPPORTED_DASHBOARD_COMPONENT_TYPES.has(type)) {
			appendTextSegment(segments, raw.slice(index, start + 1));
			index = start + 1;
			continue;
		}

		appendTextSegment(
			segments,
			stripTrailingJsonFence(raw.slice(index, start))
		);

		const end = findBalancedJsonEnd(raw, start);
		if (end === -1) {
			if (!options.streaming) {
				droppedComponents++;
			}
			break;
		}

		const parsed = parseDashboardComponent(raw.slice(start, end + 1));
		if (parsed) {
			segments.push({ kind: "component", component: parsed });
		} else {
			droppedComponents++;
		}

		index = skipClosingJsonFence(raw, end + 1);
	}

	return { droppedComponents, segments };
}

function findBalancedJsonEnd(input: string, start: number): number {
	let depth = 0;
	let escaped = false;
	let inString = false;

	for (let index = start; index < input.length; index++) {
		const char = input[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (char === "{") {
			depth++;
		} else if (char === "}") {
			depth--;
			if (depth === 0) {
				return index;
			}
		}
	}

	return -1;
}

function parseDashboardComponent(
	raw: string
): DashboardComponentPayload | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		return isDashboardComponentPayload(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function renderDashboardComponent(
	component: DashboardComponentPayload
): string {
	switch (component.type) {
		case "line-chart":
		case "bar-chart":
		case "area-chart":
		case "stacked-bar-chart":
			return renderTimeSeries(component);
		case "pie-chart":
		case "donut-chart":
			return renderDistribution(component);
		case "data-table":
			return renderDataTable(component);
		case "referrers-list":
			return renderReferrers(component);
		case "mini-map":
			return renderMiniMap(component);
		case "links-list":
			return renderLinksList(component);
		case "link-preview":
			return renderLinkPreview(component);
		case "funnels-list":
			return renderItemList(component, "funnels", "Funnels");
		case "goals-list":
			return renderItemList(component, "goals", "Goals");
		case "annotations-list":
			return renderItemList(component, "annotations", "Annotations");
		case "funnel-preview":
			return renderConfirmationPreview(component, "funnel");
		case "goal-preview":
			return renderConfirmationPreview(component, "goal");
		case "annotation-preview":
			return renderConfirmationPreview(component, "annotation");
		default:
			return "I found dashboard-only output and summarized it for Slack.";
	}
}

function renderTimeSeries(component: DashboardComponentPayload): string {
	const series = getStringArray(component.series);
	const headers = ["Period", ...series].slice(0, 6);
	const rows = getRows(component.rows)
		.slice(-MAX_TABLE_ROWS)
		.map((row) => row.slice(0, headers.length));
	return withDashboardTitle(component, renderCodeTable(headers, rows));
}

function renderDistribution(component: DashboardComponentPayload): string {
	const rows = getRows(component.rows)
		.slice(0, MAX_TABLE_ROWS)
		.map((row) => row.slice(0, 2));
	return withDashboardTitle(
		component,
		renderCodeTable(["Name", "Value"], rows)
	);
}

function renderDataTable(component: DashboardComponentPayload): string {
	const columns = getStringArray(component.columns).slice(0, 6);
	const rows = getRows(component.rows)
		.slice(0, MAX_TABLE_ROWS)
		.map((row) => row.slice(0, columns.length));
	const body = [
		getString(component.description),
		renderCodeTable(columns, rows),
		getString(component.footer),
	]
		.filter(Boolean)
		.join("\n");
	return withDashboardTitle(component, body);
}

function renderReferrers(component: DashboardComponentPayload): string {
	const referrers = getRecordArray(component.referrers);
	const lines = referrers.slice(0, MAX_LIST_ITEMS).map((item, index) => {
		const name = getString(item.name) ?? "Unknown";
		const domain = getString(item.domain) ?? getString(item.referrer);
		const visitors = getNumber(item.visitors);
		const percentage = getNumber(item.percentage);
		return `${index + 1}. *${escapeSlackText(name)}*${domain ? ` (${escapeSlackText(domain)})` : ""}${visitors === undefined ? "" : ` - ${formatNumber(visitors)} visitors`}${percentage === undefined ? "" : `, ${formatNumber(percentage)}%`}`;
	});
	return withDashboardTitle(
		component,
		lines.join("\n") || "No referrers returned."
	);
}

function renderMiniMap(component: DashboardComponentPayload): string {
	const countries = getRecordArray(component.countries);
	const lines = countries.slice(0, MAX_LIST_ITEMS).map((item, index) => {
		const name = getString(item.name) ?? "Unknown";
		const visitors = getNumber(item.visitors);
		const percentage = getNumber(item.percentage);
		return `${index + 1}. *${escapeSlackText(name)}*${visitors === undefined ? "" : ` - ${formatNumber(visitors)} visitors`}${percentage === undefined ? "" : `, ${formatNumber(percentage)}%`}`;
	});
	return withDashboardTitle(
		component,
		lines.join("\n") || "No country data returned."
	);
}

function renderLinksList(component: DashboardComponentPayload): string {
	const links = getRecordArray(component.links);
	const baseUrl = getString(component.baseUrl);
	const lines = links.slice(0, MAX_LIST_ITEMS).map((link) => {
		const name =
			getString(link.name) ?? getString(link.slug) ?? "Untitled link";
		const targetUrl = getString(link.targetUrl);
		const slug = getString(link.slug);
		const shortUrl =
			baseUrl && slug
				? `${baseUrl.replace(TRAILING_SLASH_REGEX, "")}/${slug}`
				: null;
		const primary = shortUrl ?? targetUrl;
		const label = primary
			? slackLink(primary, name)
			: `*${escapeSlackText(name)}*`;
		return `- ${label}${targetUrl ? ` -> ${escapeSlackText(targetUrl)}` : ""}`;
	});
	return withDashboardTitle(
		component,
		lines.join("\n") || "No links returned."
	);
}

function renderLinkPreview(component: DashboardComponentPayload): string {
	const link = isRecord(component.link) ? component.link : {};
	const mode = getString(component.mode) ?? "update";
	const name = getString(link.name) ?? "link";
	const slug = getString(link.slug);
	const targetUrl = getString(link.targetUrl);
	const lines = [
		getString(component.message),
		`*${capitalize(mode)} link:* ${escapeSlackText(name)}`,
		slug ? `Slug: \`${escapeSlackText(slug)}\`` : null,
		targetUrl ? `Target: ${escapeSlackText(targetUrl)}` : null,
		"Reply with confirmation if you want me to apply this change.",
	];
	return lines.filter(Boolean).join("\n");
}

function renderItemList(
	component: DashboardComponentPayload,
	key: string,
	fallbackTitle: string
): string {
	const items = getRecordArray(component[key]);
	const lines = items.slice(0, MAX_LIST_ITEMS).map((item) => {
		const name = getString(item.name) ?? getString(item.text) ?? "Untitled";
		const target = getString(item.target);
		const active = typeof item.isActive === "boolean" ? item.isActive : null;
		return `- *${escapeSlackText(name)}*${target ? ` - ${escapeSlackText(target)}` : ""}${active === null ? "" : active ? " (active)" : " (inactive)"}`;
	});
	return withDashboardTitle(
		component,
		lines.join("\n") || `No ${fallbackTitle.toLowerCase()} returned.`,
		fallbackTitle
	);
}

function renderConfirmationPreview(
	component: DashboardComponentPayload,
	key: string
): string {
	const value = isRecord(component[key]) ? component[key] : {};
	const mode = getString(component.mode) ?? "update";
	const name = getString(value.name) ?? getString(value.text) ?? key;
	return [
		`*${capitalize(mode)} ${key}:* ${escapeSlackText(name)}`,
		"Reply with confirmation if you want me to apply this change.",
	].join("\n");
}

function withDashboardTitle(
	component: DashboardComponentPayload,
	body: string,
	fallbackTitle = "Databuddy result"
): string {
	const title = getString(component.title) ?? fallbackTitle;
	return [`*${escapeSlackText(title)}*`, body].filter(Boolean).join("\n");
}

function renderCodeTable(headers: string[], rows: unknown[][]): string {
	if (headers.length === 0) {
		return "";
	}
	const stringRows = rows.map((row) =>
		headers.map((_, index) => formatCell(row[index]))
	);
	const stringHeaders = headers.map(formatCell);
	const widths = stringHeaders.map((header, index) =>
		Math.min(
			24,
			Math.max(
				header.length,
				...stringRows.map((row) => row[index]?.length ?? 0)
			)
		)
	);
	const formatRow = (row: string[]) =>
		row
			.map((cell, index) =>
				truncate(cell, widths[index] ?? 12).padEnd(widths[index] ?? 12)
			)
			.join("  ");
	const divider = widths.map((width) => "-".repeat(width)).join("  ");
	return [
		"```",
		formatRow(stringHeaders),
		divider,
		...stringRows.map(formatRow),
		"```",
	].join("\n");
}

function stripTrailingJsonFence(text: string): string {
	return text.replace(TRAILING_JSON_FENCE_REGEX, "");
}

function skipClosingJsonFence(text: string, index: number): number {
	const match = CLOSING_JSON_FENCE_REGEX.exec(text.slice(index));
	return match ? index + match[0].length : index;
}

function hidePotentialPartialComponent(text: string): string {
	const lastBrace = text.lastIndexOf("{");
	if (lastBrace === -1) {
		return text;
	}
	return text.length - lastBrace <= PARTIAL_COMPONENT_LOOKBACK_CHARS
		? text.slice(0, lastBrace)
		: text;
}

function appendTextSegment(segments: OutputSegment[], text: string): void {
	const trimmed = text.trim();
	if (trimmed) {
		segments.push({ kind: "text", text: trimmed });
	}
}

function getRows(value: unknown): unknown[][] {
	return Array.isArray(value)
		? value.filter((row): row is unknown[] => Array.isArray(row))
		: [];
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => isRecord(item))
		: [];
}

function getStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function formatCell(value: unknown): string {
	if (typeof value === "number") {
		return formatNumber(value);
	}
	if (typeof value === "boolean") {
		return value ? "yes" : "no";
	}
	if (value === null || value === undefined) {
		return "";
	}
	return String(value).replace(/\s+/g, " ").trim();
}

function formatNumber(value: number): string {
	return Number.isInteger(value)
		? value.toLocaleString("en-US")
		: value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function slackLink(url: string, label: string): string {
	return `<${url.replace(/[<>]/g, "")}|${escapeSlackText(label)}>`;
}

function escapeSlackText(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function truncate(value: string, max: number): string {
	if (value.length <= max) {
		return value;
	}
	if (max <= 3) {
		return value.slice(0, max);
	}
	return `${value.slice(0, max - 3)}...`;
}

function capitalize(value: string): string {
	return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDashboardComponentPayload(
	value: unknown
): value is DashboardComponentPayload {
	return (
		isRecord(value) &&
		typeof value.type === "string" &&
		SUPPORTED_DASHBOARD_COMPONENT_TYPES.has(value.type)
	);
}
