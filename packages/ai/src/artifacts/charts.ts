import { z } from 'zod';

export const ChartKind = z.enum([
	'line',
	'area',
	'bar',
	'stackedBar',
	'groupedBar',
	'pie',
	'donut',
	'scatter',
	'heatmap',
	'histogram',
	'table',
]);

const StringOrNumber = z.union([z.string(), z.number()]);

// Common encodings used across charts
const TimeEncoding = z.object({
	field: z.string().min(1),
	type: z.enum(['time', 'date']),
	format: z.string().optional(), // ISO, unix, custom
});

const CategoryEncoding = z.object({
	field: z.string().min(1),
	type: z.literal('category'),
});

const NumericEncoding = z.object({
	field: z.string().min(1),
	type: z.literal('number'),
	aggregate: z
		.enum(['sum', 'avg', 'min', 'max', 'count', 'none'])
		.default('none'),
});

const SeriesEncoding = z
	.object({
		field: z.string().min(1),
		type: z.enum(['category', 'number']),
	})
	.optional();

// A generic filter syntax that is easy to validate
const FilterOp = z.enum([
	'=',
	'!=',
	'>',
	'>=',
	'<',
	'<=',
	'in',
	'not-in',
	'between',
]);
export const ChartFilter = z.object({
	field: z.string().min(1),
	op: FilterOp,
	// Use an array (1 or 2 entries) instead of a tuple to avoid producing
	// JSON Schema tuple types which some response-format validators reject.
	value: z.union([StringOrNumber, z.array(StringOrNumber).min(1).max(2)]),
});

const SortOrder = z.enum(['asc', 'desc']);
const SortSpec = z.object({
	field: z.string().min(1),
	order: SortOrder.default('asc'),
});

const _AxisSpec = z.object({
	label: z.string().optional(),
	tickFormat: z.string().optional(),
	hide: z.boolean().optional(),
});

// Basic legend config
const LegendSpec = z
	.object({
		position: z.enum(['top', 'right', 'bottom', 'left']).default('top'),
		show: z.boolean().default(true),
	})
	.optional();

// Tooltip fields to show
const TooltipSpec = z
	.object({
		fields: z.array(z.string()).max(6).optional(),
	})
	.optional();

const ColorSpec = z
	.object({
		scheme: z
			.enum([
				'auto',
				'category10',
				'accent',
				'paired',
				'pastel',
				'set1',
				'set2',
				'set3',
			])
			.default('auto'),
	})
	.optional();

/**
 * ChartSpec is the contract the model must produce and we strictly validate.
 * Only safe, allowed properties. No freeform code, no functions.
 */
export const ChartSpec = z.object({
	kind: ChartKind,
	title: z.string().optional(),
	description: z.string().optional(),
	// Data bindings
	x: z.union([TimeEncoding, CategoryEncoding, NumericEncoding]).optional(),
	y: NumericEncoding.optional(),
	// Optional split into series or groups
	series: SeriesEncoding,
	// Extra encodings for certain charts
	x2: NumericEncoding.optional(), // for hist bins, ranges, interval charts
	y2: NumericEncoding.optional(), // stacked or band
	size: NumericEncoding.optional(), // scatter
	// Visual settings
	legend: LegendSpec,
	tooltip: TooltipSpec,
	color: ColorSpec,
	// Transform hints
	filters: z.array(ChartFilter).default([]),
	sort: z.array(SortSpec).default([]),
	// Limits to keep things sane in UI
	maxPoints: z.number().int().positive().max(5000).default(2000),
	// Optional table columns for "table" kind
	tableColumns: z.array(z.string()).optional(),
});

export type ChartSpec = z.infer<typeof ChartSpec>;
export type ChartKind = z.infer<typeof ChartKind>;

/**
 * Minimal schema summary of rows so we can prompt safely.
 */
export type Row = Record<string, unknown>;

export function summarizeSchema(rows: Row[]) {
	const sample = rows[0] || {};
	const columns = Object.keys(sample);
	const types: Record<
		string,
		'number' | 'string' | 'boolean' | 'date' | 'unknown'
	> = {};
	for (const c of columns) {
		const v = sample[c];
		types[c] =
			typeof v === 'number'
				? 'number'
				: typeof v === 'string' && looksLikeDate(v)
					? 'date'
					: typeof v === 'string'
						? 'string'
						: typeof v === 'boolean'
							? 'boolean'
							: v instanceof Date
								? 'date'
								: 'unknown';
	}
	return { columns, types };
}

function looksLikeDate(s: string): boolean {
	if (!s) {
		return false;
	}
	const d = new Date(s);
	return !Number.isNaN(d.getTime());
}

/**
 * Hard sanitize a validated spec to enforce caps and remove unknown props.
 */
export function sanitizeChartSpec(spec: ChartSpec): ChartSpec {
	// Limit fields count in tooltip
	const tooltip =
		spec.tooltip?.fields && spec.tooltip.fields.length > 6
			? { fields: spec.tooltip.fields.slice(0, 6) }
			: spec.tooltip;

	const maxPoints = Math.min(Math.max(spec.maxPoints ?? 2000, 10), 5000);

	return { ...spec, tooltip, maxPoints };
}
