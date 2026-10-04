const COMPONENT_START = '{"type":"';

const CHART_COMPONENT_TYPES = [
	"area-chart",
	"line-chart",
	"bar-chart",
	"stacked-bar-chart",
	"donut-chart",
	"pie-chart",
] as const;

export const AGENT_COMPONENT_TYPES = [
	"data-table",
	...CHART_COMPONENT_TYPES,
	"referrers-list",
	"mini-map",
	"links-list",
	"funnels-list",
	"goals-list",
	"annotations-list",
	"dashboard-actions",
	"suggested-actions",
	"link-preview",
	"feedback-preview",
	"funnel-preview",
	"goal-preview",
	"annotation-preview",
] as const;

export type AgentComponentType = (typeof AGENT_COMPONENT_TYPES)[number];

export type AgentOutput = "components" | "markdown";

export interface ComponentSpec {
	type: string;
	[key: string]: unknown;
}

interface SplitResult {
	components: ComponentSpec[];
	text: string;
}

const KNOWN_COMPONENT_TYPES = new Set<string>(AGENT_COMPONENT_TYPES);
const CHART_TYPES = new Set<string>(CHART_COMPONENT_TYPES);

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
	readonly #inline?: (spec: ComponentSpec) => string;

	constructor(inline?: (spec: ComponentSpec) => string) {
		this.#inline = inline;
	}

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
			if (component && this.#inline) {
				emitted += this.#inline(component);
				this.#buffer = rest.slice(closeIndex + 1);
			} else if (component) {
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

export function splitAgentText(
	text: string,
	inline?: (spec: ComponentSpec) => string
): SplitResult {
	const splitter = new ComponentStreamSplitter(inline);
	const head = splitter.push(text);
	const rest = splitter.flush();
	return { components: rest.components, text: head + rest.text };
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function cell(value: unknown): string {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Number.isInteger(value)
			? value.toLocaleString("en-US")
			: String(value);
	}
	const text = value == null ? "" : String(value).replaceAll("|", "\\|").trim();
	return text || "-";
}

export function componentToPlainText(spec: ComponentSpec): string {
	const title = typeof spec.title === "string" ? spec.title.trim() : "";
	const rows = asArray(spec.rows).filter((row): row is unknown[] =>
		Array.isArray(row)
	);
	let body = "";
	if (spec.type === "data-table") {
		const columns = asArray(spec.columns).map(cell);
		body =
			columns.length > 0
				? [
						columns,
						columns.map(() => "---"),
						...rows.map((row) => columns.map((_, index) => cell(row[index]))),
					]
						.map((line) => `| ${line.join(" | ")} |`)
						.join("\n")
				: "";
	} else if (CHART_TYPES.has(spec.type)) {
		const series = asArray(spec.series).map(cell);
		body = rows
			.map(([label, ...values]) => {
				const parts = values.map((value, index) =>
					series[index] ? `${series[index]} ${cell(value)}` : cell(value)
				);
				return `- ${cell(label)}: ${parts.join(", ")}`;
			})
			.join("\n");
	}
	return [title && `**${title}**`, body].filter(Boolean).join("\n");
}
