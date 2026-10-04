import type {
	AgentComponentType,
	ComponentSpec,
} from "@databuddy/ai/agent/render";
import type { Button, KnownBlock } from "@slack/web-api";

const DASHBOARD_BASE_URL = "https://app.databuddy.cc";
const DASHBOARD_ORIGIN = new URL(DASHBOARD_BASE_URL).origin;
const LINKABLE_HOSTS = new Set([
	new URL(DASHBOARD_BASE_URL).hostname,
	"databuddy.cc",
	"www.databuddy.cc",
]);
const HTTP_URL = /https?:\/\/[^\s<>|`]+/gi;
const URL_TRAILING_PUNCTUATION = /[.,;:!?)\]}'"*_~]+$/;
const URL_SCHEME_AND_SUFFIX = /^https?:\/\/|[?#].*$/gi;
const SLACK_SYNTAX_OPENER = /<(?=[!@#`]|https?:)/gi;
const DATA_TABLE_MAX_COLUMNS = 20;
const DATA_TABLE_MAX_ROWS = 100;
const MAX_ACTION_BUTTONS = 5;
const DRILLDOWN_PROMPT_MAX = 1900;

export const DRILLDOWN_ACTION_ID = "agent_drilldown";

export type Block =
	| KnownBlock
	| { type: "data_table"; caption: string; rows: TableCell[][] }
	| {
			type: "data_visualization";
			title: string;
			chart:
				| { type: "pie"; segments: { label: string; value: number }[] }
				| {
						type: "line" | "area" | "bar";
						series: {
							name: string;
							data: { label: string; value: number }[];
						}[];
						axis_config: { categories: string[] };
				  };
	  };

type Row = unknown[];

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function formatNumber(value: number): string {
	return Number.isInteger(value)
		? value.toLocaleString("en-US")
		: String(value);
}

function formatPercent(value: unknown): string {
	return typeof value === "number" && Number.isFinite(value)
		? `${Number.isInteger(value) ? value : value.toFixed(1)}%`
		: "-";
}

type TableCell =
	| { text: string; type: "raw_text" }
	| { text: string; type: "raw_number"; value: number };

function toTableCell(value: unknown): TableCell {
	if (typeof value === "number" && Number.isFinite(value)) {
		return { type: "raw_number", value, text: formatNumber(value) };
	}
	const text = value == null ? "-" : String(value);
	return { type: "raw_text", text: text.length > 0 ? text : "-" };
}

function escapeMrkdwn(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function neutralizeUrls(value: string): string {
	return value.replace(HTTP_URL, (match) => {
		const trailing = URL_TRAILING_PUNCTUATION.exec(match)?.[0] ?? "";
		const href = match.slice(0, match.length - trailing.length);
		const url = URL.parse(href);
		if (
			url &&
			LINKABLE_HOSTS.has(url.hostname) &&
			href.split("://").length === 2
		) {
			return `${url.href}${trailing}`;
		}
		const label = url
			? hostAndPath(url)
			: href.replace(URL_SCHEME_AND_SUFFIX, "");
		return label ? `\`${label}\`${trailing}` : match;
	});
}

export function safeMrkdwn(value: string): string {
	return escapeMrkdwn(neutralizeUrls(value));
}

export function safeMarkdown(value: string): string {
	return neutralizeUrls(value).replace(SLACK_SYNTAX_OPENER, "");
}

function hostAndPath(url: URL): string {
	return url.pathname === "/" ? url.host : `${url.host}${url.pathname}`;
}

function section(text: string): Block {
	return {
		type: "section",
		text: { type: "mrkdwn", text: safeMrkdwn(text) },
	};
}

function context(text: string): Block {
	return {
		type: "context",
		elements: [{ type: "mrkdwn", text: safeMrkdwn(text) }],
	};
}

function dataTable(
	caption: string,
	columns: string[],
	rows: Row[]
): Block | null {
	if (columns.length === 0 || rows.length === 0) {
		return null;
	}
	if (columns.length > DATA_TABLE_MAX_COLUMNS) {
		return null;
	}
	if (!rows.every(Array.isArray)) {
		return null;
	}
	const header = columns.map((column) => ({
		type: "raw_text" as const,
		text: column.length > 0 ? column : " ",
	}));
	const body = rows
		.slice(0, DATA_TABLE_MAX_ROWS - 1)
		.map((row) => columns.map((_, index) => toTableCell(row[index])));
	return {
		type: "data_table",
		caption:
			body.length < rows.length
				? `${caption} (showing ${body.length} of ${rows.length} rows)`
				: caption,
		rows: [header, ...body],
	};
}

function dashboardUrl(href: string): string | null {
	const url = URL.parse(
		href,
		href.startsWith("/") ? DASHBOARD_BASE_URL : undefined
	);
	return url?.origin === DASHBOARD_ORIGIN ? url.href : null;
}

function title(spec: ComponentSpec, fallback: string): string {
	const value = asString(spec.title).trim();
	return value.length > 0 ? value : fallback;
}

function renderDataTable(spec: ComponentSpec): Block[] {
	const columns = asArray(spec.columns).map((column) => asString(column));
	const block = dataTable(
		title(spec, "Results"),
		columns,
		asArray(spec.rows) as Row[]
	);
	return block ? [block] : [];
}

function renderTimeSeries(spec: ComponentSpec): Block[] {
	const series = asArray(spec.series).map((name) => asString(name));
	const rows = asArray(spec.rows) as Row[];
	const xHeader = spec.type === "bar-chart" ? "Category" : "Period";
	const block = dataTable(title(spec, "Trend"), [xHeader, ...series], rows);
	return block ? [block] : [];
}

function renderDistribution(spec: ComponentSpec): Block[] {
	const rows = asArray(spec.rows) as Row[];
	const block = dataTable(title(spec, "Breakdown"), ["Segment", "Value"], rows);
	return block ? [block] : [];
}

const CHART_TYPES: Record<string, "line" | "area" | "bar" | "pie"> = {
	"line-chart": "line",
	"area-chart": "area",
	"bar-chart": "bar",
	"pie-chart": "pie",
	"donut-chart": "pie",
};

function isChartLabel(value: unknown): value is string {
	return (
		typeof value === "string" && value.trim().length > 0 && value.length <= 20
	);
}

function nativeChart(spec: ComponentSpec): Block | null {
	const type = CHART_TYPES[spec.type];
	if (!type) {
		return null;
	}
	const chartTitle = title(spec, type === "pie" ? "Breakdown" : "Trend");
	const names = type === "pie" ? ["Value"] : asArray(spec.series);
	const rows = asArray(spec.rows);
	// Slack's chart limits: https://docs.slack.dev/reference/block-kit/blocks/data-visualization-block/
	// Keep the table when a chart would require dropping, renaming, or coercing data.
	if (
		chartTitle.length > 50 ||
		names.length === 0 ||
		names.length > 12 ||
		!names.every(isChartLabel) ||
		new Set(names).size !== names.length ||
		rows.length === 0 ||
		rows.length > (type === "pie" ? 12 : 20) ||
		!rows.every(
			(row): row is [string, number, ...number[]] =>
				Array.isArray(row) &&
				row.length === names.length + 1 &&
				isChartLabel(row[0]) &&
				row
					.slice(1)
					.every(
						(value) =>
							typeof value === "number" &&
							Number.isFinite(value) &&
							(type !== "pie" || value > 0)
					)
		) ||
		new Set(rows.map((row) => row[0])).size !== rows.length
	) {
		return null;
	}
	return {
		type: "data_visualization",
		title: chartTitle,
		chart:
			type === "pie"
				? { type, segments: rows.map(([label, value]) => ({ label, value })) }
				: {
						type,
						axis_config: { categories: rows.map(([label]) => label) },
						series: names.map((name, index) => ({
							name,
							data: rows.flatMap(([label, ...values]) => {
								const value = values[index];
								return value === undefined ? [] : [{ label, value }];
							}),
						})),
					},
	};
}

interface ListTableConfig {
	columns: string[];
	items: string;
	row: (item: Record<string, unknown>) => Row;
	title: string;
}

const LIST_TABLES: Record<string, ListTableConfig> = {
	"referrers-list": {
		items: "referrers",
		title: "Top referrers",
		columns: ["Referrer", "Visitors", "Share"],
		row: (r) => [
			asString(r.name) || asString(r.domain),
			r.visitors,
			formatPercent(r.percentage),
		],
	},
	"mini-map": {
		items: "countries",
		title: "Top countries",
		columns: ["Country", "Visitors", "Share"],
		row: (c) => [asString(c.name), c.visitors, formatPercent(c.percentage)],
	},
	"links-list": {
		items: "links",
		title: "Links",
		columns: ["Name", "Slug", "Destination"],
		row: (l) => [asString(l.name), asString(l.slug), asString(l.targetUrl)],
	},
	"funnels-list": {
		items: "funnels",
		title: "Funnels",
		columns: ["Funnel", "Steps", "Status"],
		row: (f) => [
			asString(f.name),
			asArray(f.steps).length,
			f.isActive ? "Active" : "Paused",
		],
	},
	"goals-list": {
		items: "goals",
		title: "Goals",
		columns: ["Goal", "Type", "Target", "Status"],
		row: (g) => [
			asString(g.name),
			asString(g.type),
			asString(g.target),
			g.isActive ? "Active" : "Paused",
		],
	},
	"annotations-list": {
		items: "annotations",
		title: "Annotations",
		columns: ["Annotation", "Type", "When"],
		row: (a) => [
			asString(a.text),
			asString(a.annotationType),
			asString(a.xValue),
		],
	},
};

function renderListTable(spec: ComponentSpec): Block[] {
	const config = LIST_TABLES[spec.type];
	if (!config) {
		return [];
	}
	const rows = asArray(spec[config.items]).map((item) =>
		config.row(item as Record<string, unknown>)
	);
	const block = dataTable(title(spec, config.title), config.columns, rows);
	return block ? [block] : [];
}

function renderDashboardActions(spec: ComponentSpec): Block[] {
	const elements = asArray(spec.actions)
		.map((item): Button | null => {
			const action = item as Record<string, unknown>;
			const url = dashboardUrl(asString(action.href));
			const label = asString(action.label).trim();
			if (!(url && label)) {
				return null;
			}
			return {
				type: "button",
				text: { type: "plain_text", text: label.slice(0, 75) },
				url,
			};
		})
		.filter((element): element is Button => element !== null)
		.slice(0, MAX_ACTION_BUTTONS);
	return elements.length > 0 ? [{ type: "actions", elements }] : [];
}

function renderSuggestedActions(spec: ComponentSpec): Block[] {
	const elements = asArray(spec.actions)
		.map((item, index): Button | null => {
			const action = item as Record<string, unknown>;
			const label = asString(action.label).trim();
			const prompt = asString(action.prompt).trim();
			if (!(label && prompt)) {
				return null;
			}
			return {
				type: "button",
				text: { type: "plain_text", text: label.slice(0, 75) },
				action_id: `${DRILLDOWN_ACTION_ID}_${index}`,
				value: prompt.slice(0, DRILLDOWN_PROMPT_MAX),
			};
		})
		.filter((element): element is Button => element !== null)
		.slice(0, MAX_ACTION_BUTTONS);
	return elements.length > 0 ? [{ type: "actions", elements }] : [];
}

function previewCard(
	headline: string,
	lines: string[],
	mode?: string
): Block[] {
	const body = [headline, ...lines.filter((line) => line.length > 0)].join(
		"\n"
	);
	const blocks: Block[] = [section(body)];
	if (mode) {
		blocks.push(context(mode));
	}
	return blocks;
}

function renderLinkPreview(spec: ComponentSpec): Block[] {
	const link = (spec.link ?? {}) as Record<string, unknown>;
	return previewCard(
		`*${asString(link.name) || "Short link"}*`,
		[
			asString(link.targetUrl),
			asString(link.slug) ? `slug: ${asString(link.slug)}` : "",
		],
		asString(spec.mode)
	);
}

function renderFeedbackPreview(spec: ComponentSpec): Block[] {
	const feedback = (spec.feedback ?? {}) as Record<string, unknown>;
	return previewCard(
		`*${asString(feedback.title) || "Feedback"}*`,
		[
			asString(feedback.description),
			asString(feedback.category)
				? `category: ${asString(feedback.category)}`
				: "",
		],
		asString(spec.mode) === "sent" ? "Sent to the Databuddy team" : undefined
	);
}

function renderFunnelPreview(spec: ComponentSpec): Block[] {
	const funnel = (spec.funnel ?? {}) as Record<string, unknown>;
	const steps = asArray(funnel.steps)
		.map(
			(step, index) =>
				`${index + 1}. ${asString((step as Record<string, unknown>).name)}`
		)
		.join("\n");
	return previewCard(
		`*${asString(funnel.name) || "Funnel"}*`,
		[asString(funnel.description), steps],
		asString(spec.mode)
	);
}

function renderGoalPreview(spec: ComponentSpec): Block[] {
	const goal = (spec.goal ?? {}) as Record<string, unknown>;
	return previewCard(
		`*${asString(goal.name) || "Goal"}*`,
		[
			asString(goal.description),
			`${asString(goal.type)} → ${asString(goal.target)}`,
		],
		asString(spec.mode)
	);
}

function renderAnnotationPreview(spec: ComponentSpec): Block[] {
	const annotation = (spec.annotation ?? {}) as Record<string, unknown>;
	return previewCard(
		`*${asString(annotation.text) || "Annotation"}*`,
		[`${asString(annotation.annotationType)} · ${asString(annotation.xValue)}`],
		asString(spec.mode)
	);
}

type Renderer = (spec: ComponentSpec) => Block[];

const RENDERERS: Record<string, Renderer> = {
	"data-table": renderDataTable,
	"area-chart": renderTimeSeries,
	"line-chart": renderTimeSeries,
	"bar-chart": renderTimeSeries,
	"stacked-bar-chart": renderTimeSeries,
	"donut-chart": renderDistribution,
	"pie-chart": renderDistribution,
	"referrers-list": renderListTable,
	"mini-map": renderListTable,
	"links-list": renderListTable,
	"funnels-list": renderListTable,
	"goals-list": renderListTable,
	"annotations-list": renderListTable,
	"dashboard-actions": renderDashboardActions,
	"suggested-actions": renderSuggestedActions,
	"link-preview": renderLinkPreview,
	"feedback-preview": renderFeedbackPreview,
	"funnel-preview": renderFunnelPreview,
	"goal-preview": renderGoalPreview,
	"annotation-preview": renderAnnotationPreview,
} satisfies Record<AgentComponentType, Renderer>;

export function componentToBlocks(spec: ComponentSpec, charts = true): Block[] {
	const chart = charts ? nativeChart(spec) : null;
	if (chart) {
		return [chart];
	}
	const renderer = RENDERERS[spec.type];
	const blocks = renderer ? renderer(spec) : [];
	if (blocks.length > 0) {
		return blocks;
	}
	return [context(`_${title(spec, spec.type)}_`)];
}

export function componentsToBlocks(
	components: ComponentSpec[],
	charts = true
): Block[] {
	let chartCount = 0;
	return components.flatMap((spec) => {
		const blocks = componentToBlocks(spec, charts && chartCount < 2);
		chartCount += blocks.filter(
			(block) => block.type === "data_visualization"
		).length;
		return blocks;
	});
}

export const FEEDBACK_ACTION_ID = "agent_feedback";
const FEEDBACK_POSITIVE_SIGNAL = "thumbsup";
const FEEDBACK_NEGATIVE_SIGNAL = "thumbsdown";

export function feedbackButtonsBlock(): Block {
	return {
		type: "context_actions",
		elements: [
			{
				type: "feedback_buttons",
				action_id: FEEDBACK_ACTION_ID,
				positive_button: {
					text: { type: "plain_text", text: "Good response" },
					value: FEEDBACK_POSITIVE_SIGNAL,
					accessibility_label: "Good response",
				},
				negative_button: {
					text: { type: "plain_text", text: "Bad response" },
					value: FEEDBACK_NEGATIVE_SIGNAL,
					accessibility_label: "Bad response",
				},
			},
		],
	};
}
