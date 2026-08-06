const COMPONENT_START = '{"type":"';

const DASHBOARD_BASE_URL = "https://app.databuddy.cc";
const DATA_TABLE_MAX_COLUMNS = 20;
const DATA_TABLE_MAX_ROWS = 100;
const MAX_ACTION_BUTTONS = 5;

export interface ComponentSpec {
	type: string;
	[key: string]: unknown;
}

export type Block = Record<string, unknown>;

interface SplitResult {
	components: ComponentSpec[];
	text: string;
}

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

function section(text: string): Block {
	return { type: "section", text: { type: "mrkdwn", text } };
}

function context(text: string): Block {
	return { type: "context", elements: [{ type: "mrkdwn", text }] };
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
	const header = columns.map((column) => ({
		type: "raw_text" as const,
		text: column.length > 0 ? column : " ",
	}));
	const body = rows
		.slice(0, DATA_TABLE_MAX_ROWS - 1)
		.map((row) => columns.map((_, index) => toTableCell(row[index])));
	return { type: "data_table", caption, rows: [header, ...body] };
}

function absoluteUrl(href: string): string | null {
	if (href.startsWith("http://") || href.startsWith("https://")) {
		return href;
	}
	if (href.startsWith("/")) {
		return `${DASHBOARD_BASE_URL}${href}`;
	}
	return null;
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

function renderReferrers(spec: ComponentSpec): Block[] {
	const rows = asArray(spec.referrers).map((item) => {
		const ref = item as Record<string, unknown>;
		return [
			asString(ref.name) || asString(ref.domain),
			ref.visitors,
			formatPercent(ref.percentage),
		];
	});
	const block = dataTable(
		title(spec, "Top referrers"),
		["Referrer", "Visitors", "Share"],
		rows
	);
	return block ? [block] : [];
}

function renderMiniMap(spec: ComponentSpec): Block[] {
	const rows = asArray(spec.countries).map((item) => {
		const country = item as Record<string, unknown>;
		return [
			asString(country.name),
			country.visitors,
			formatPercent(country.percentage),
		];
	});
	const block = dataTable(
		title(spec, "Top countries"),
		["Country", "Visitors", "Share"],
		rows
	);
	return block ? [block] : [];
}

function renderLinksList(spec: ComponentSpec): Block[] {
	const rows = asArray(spec.links).map((item) => {
		const link = item as Record<string, unknown>;
		return [asString(link.name), asString(link.slug), asString(link.targetUrl)];
	});
	const block = dataTable(
		title(spec, "Links"),
		["Name", "Slug", "Destination"],
		rows
	);
	return block ? [block] : [];
}

function renderFunnelsList(spec: ComponentSpec): Block[] {
	const rows = asArray(spec.funnels).map((item) => {
		const funnel = item as Record<string, unknown>;
		return [
			asString(funnel.name),
			asArray(funnel.steps).length,
			funnel.isActive ? "Active" : "Paused",
		];
	});
	const block = dataTable(
		title(spec, "Funnels"),
		["Funnel", "Steps", "Status"],
		rows
	);
	return block ? [block] : [];
}

function renderGoalsList(spec: ComponentSpec): Block[] {
	const rows = asArray(spec.goals).map((item) => {
		const goal = item as Record<string, unknown>;
		return [
			asString(goal.name),
			asString(goal.type),
			asString(goal.target),
			goal.isActive ? "Active" : "Paused",
		];
	});
	const block = dataTable(
		title(spec, "Goals"),
		["Goal", "Type", "Target", "Status"],
		rows
	);
	return block ? [block] : [];
}

function renderAnnotationsList(spec: ComponentSpec): Block[] {
	const rows = asArray(spec.annotations).map((item) => {
		const annotation = item as Record<string, unknown>;
		return [
			asString(annotation.text),
			asString(annotation.annotationType),
			asString(annotation.xValue),
		];
	});
	const block = dataTable(
		title(spec, "Annotations"),
		["Annotation", "Type", "When"],
		rows
	);
	return block ? [block] : [];
}

function renderDashboardActions(spec: ComponentSpec): Block[] {
	const elements = asArray(spec.actions)
		.map((item): Block | null => {
			const action = item as Record<string, unknown>;
			const url = absoluteUrl(asString(action.href));
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
		.filter((element): element is Block => element !== null)
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

const RENDERERS: Record<string, (spec: ComponentSpec) => Block[]> = {
	"data-table": renderDataTable,
	"area-chart": renderTimeSeries,
	"line-chart": renderTimeSeries,
	"bar-chart": renderTimeSeries,
	"stacked-bar-chart": renderTimeSeries,
	"donut-chart": renderDistribution,
	"pie-chart": renderDistribution,
	"referrers-list": renderReferrers,
	"mini-map": renderMiniMap,
	"links-list": renderLinksList,
	"funnels-list": renderFunnelsList,
	"goals-list": renderGoalsList,
	"annotations-list": renderAnnotationsList,
	"dashboard-actions": renderDashboardActions,
	"link-preview": renderLinkPreview,
	"feedback-preview": renderFeedbackPreview,
	"funnel-preview": renderFunnelPreview,
	"goal-preview": renderGoalPreview,
	"annotation-preview": renderAnnotationPreview,
};

const KNOWN_COMPONENT_TYPES = new Set(Object.keys(RENDERERS));

function isPrefixOfMarker(value: string): boolean {
	return (
		COMPONENT_START.startsWith(value) && value.length < COMPONENT_START.length
	);
}

function findCloseBrace(text: string, start: number): number {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (ch === "{") {
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0) {
				return i;
			}
		}
	}
	return -1;
}

function parseComponent(json: string): ComponentSpec | null {
	try {
		const parsed = JSON.parse(json) as unknown;
		if (
			parsed &&
			typeof parsed === "object" &&
			!Array.isArray(parsed) &&
			typeof (parsed as Record<string, unknown>).type === "string" &&
			KNOWN_COMPONENT_TYPES.has(
				(parsed as Record<string, unknown>).type as string
			)
		) {
			return parsed as ComponentSpec;
		}
	} catch {}
	return null;
}

export class ComponentStreamSplitter {
	#buffer = "";
	readonly #components: ComponentSpec[] = [];

	push(chunk: string): string {
		this.#buffer += chunk;
		return this.#drain(false);
	}

	flush(): SplitResult {
		const text = this.#drain(true) + this.#buffer;
		this.#buffer = "";
		return { components: [...this.#components], text };
	}

	#drain(final: boolean): string {
		let emitted = "";
		while (this.#buffer.length > 0) {
			const markerIndex = this.#buffer.indexOf(COMPONENT_START);

			if (markerIndex === -1) {
				if (final) {
					break;
				}
				const held = this.#heldPartialMarkerIndex();
				emitted += this.#buffer.slice(0, held);
				this.#buffer = this.#buffer.slice(held);
				return emitted;
			}

			emitted += this.#buffer.slice(0, markerIndex);
			const rest = this.#buffer.slice(markerIndex);
			const closeIndex = findCloseBrace(rest, 0);

			if (closeIndex === -1) {
				if (final) {
					break;
				}
				this.#buffer = rest;
				return emitted;
			}

			const json = rest.slice(0, closeIndex + 1);
			const component = parseComponent(json);
			if (component) {
				this.#components.push(component);
				this.#buffer = rest.slice(closeIndex + 1);
			} else {
				emitted += rest.slice(0, 1);
				this.#buffer = rest.slice(1);
			}
		}

		if (final) {
			return emitted;
		}
		this.#buffer = "";
		return emitted;
	}

	#heldPartialMarkerIndex(): number {
		const lastBrace = this.#buffer.lastIndexOf("{");
		if (lastBrace === -1) {
			return this.#buffer.length;
		}
		const tail = this.#buffer.slice(lastBrace);
		return isPrefixOfMarker(tail) ? lastBrace : this.#buffer.length;
	}
}

export function splitAgentText(text: string): SplitResult {
	const splitter = new ComponentStreamSplitter();
	const head = splitter.push(text);
	const rest = splitter.flush();
	return { components: rest.components, text: head + rest.text };
}

export function componentToBlocks(spec: ComponentSpec): Block[] {
	const renderer = RENDERERS[spec.type];
	const blocks = renderer ? renderer(spec) : [];
	if (blocks.length > 0) {
		return blocks;
	}
	return [context(`_${title(spec, spec.type)}_`)];
}

export function componentsToBlocks(components: ComponentSpec[]): Block[] {
	return components.flatMap(componentToBlocks);
}

export const FEEDBACK_ACTION_ID = "agent_feedback";
export const FEEDBACK_POSITIVE_SIGNAL = "thumbsup";
export const FEEDBACK_NEGATIVE_SIGNAL = "thumbsdown";

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
