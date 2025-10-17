'use client';

import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';

type AnyRow = Record<string, unknown>;

type NumericKey = string;
type AxisKey = string;

type ChartKind =
	| 'line'
	| 'area'
	| 'bar'
	| 'stackedBar'
	| 'groupedBar'
	| 'pie'
	| 'donut'
	| 'scatter'
	| 'heatmap'
	| 'histogram'
	| 'table';

type EncodingCommon = { field: string };
type TimeEncoding = EncodingCommon & { type: 'time' | 'date'; format?: string };
type CatEncoding = EncodingCommon & { type: 'category' };
type NumEncoding = EncodingCommon & {
	type: 'number';
	aggregate?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'none';
};

type ChartSpec = {
	kind: ChartKind;
	title?: string;
	description?: string;
	x?: TimeEncoding | CatEncoding | NumEncoding;
	y?: NumEncoding;
	series?: { field: string; type: 'category' | 'number' };
	x2?: NumEncoding;
	y2?: NumEncoding;
	size?: NumEncoding;
	legend?: { position?: 'top' | 'right' | 'bottom' | 'left'; show?: boolean };
	tooltip?: { fields?: string[] };
	color?: {
		scheme?:
			| 'auto'
			| 'category10'
			| 'accent'
			| 'paired'
			| 'pastel'
			| 'set1'
			| 'set2'
			| 'set3';
	};
	filters?: Array<{
		field: string;
		op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not-in' | 'between';
		value: any;
	}>;
	sort?: Array<{ field: string; order?: 'asc' | 'desc' }>;
	maxPoints?: number;
	tableColumns?: string[];
};

export function DataAnalysisChart({
	spec,
	rows,
	height = 320,
}: {
	spec: ChartSpec | null;
	rows: AnyRow[];
	height?: number;
}) {
	if (!(spec && rows?.length)) {
		return (
			<div
				className="flex h-[240px] w-full items-center justify-center text-neutral-500 text-sm dark:text-neutral-400"
				style={{ height }}
			>
				No data to visualize
			</div>
		);
	}

	// Apply filters, sort, and point cap
	let data = [...rows];
	data = applyFilters(data, spec.filters ?? []);
	data = applySort(data, spec.sort ?? []);
	const cap = clamp(spec.maxPoints ?? 2000, 10, 5000);
	if (data.length > cap) {
		data = thin(data, Math.ceil(data.length / cap));
	}

	// Field helpers
	const xKey: AxisKey | null = spec.x?.field ?? null;
	const yKey: NumericKey | null = spec.y?.field ?? null;
	const sKey: string | null = spec.series?.field ?? null;

	// Rendering switches
	switch (spec.kind) {
		case 'line':
			return (
				<ChartShell height={height} title={spec.title}>
					<ResponsiveContainer height="100%" width="100%">
						<LineChart data={data}>
							<Grid />
							<XAxis dataKey={xKey ?? inferFirstKey(data)} />
							<YAxis />
							<Tooltip
								content={<Tip fields={spec.tooltip?.fields} />}
								wrapperStyle={{ zIndex: 9999 }}
							/>
							{sKey ? (
								seriesKeys(data, sKey).map((k) => (
									<Line
										dataKey={(row) => getNumber(row, yKey, k, sKey)}
										dot={false}
										key={k}
										name={`${yKey} (${k})`}
										strokeWidth={2}
										type="monotone"
									/>
								))
							) : (
								<Line
									dataKey={yKey ?? inferFirstNumeric(data)}
									dot={false}
									strokeWidth={2}
									type="monotone"
								/>
							)}
							{spec.legend?.show !== false ? (
								<Legend height={24} verticalAlign="top" />
							) : null}
						</LineChart>
					</ResponsiveContainer>
				</ChartShell>
			);

		case 'area':
			return (
				<ChartShell height={height} title={spec.title}>
					<ResponsiveContainer height="100%" width="100%">
						<AreaChart data={data}>
							<Grid />
							<XAxis dataKey={xKey ?? inferFirstKey(data)} />
							<YAxis />
							<Tooltip
								content={<Tip fields={spec.tooltip?.fields} />}
								wrapperStyle={{ zIndex: 9999 }}
							/>
							{sKey ? (
								seriesKeys(data, sKey).map((k) => (
									<Area
										dataKey={(row) => getNumber(row, yKey, k, sKey)}
										fillOpacity={0.1}
										key={k}
										name={`${yKey} (${k})`}
										strokeWidth={2}
										type="monotone"
									/>
								))
							) : (
								<Area
									dataKey={yKey ?? inferFirstNumeric(data)}
									fillOpacity={0.1}
									strokeWidth={2}
									type="monotone"
								/>
							)}
							{spec.legend?.show !== false ? (
								<Legend height={24} verticalAlign="top" />
							) : null}
						</AreaChart>
					</ResponsiveContainer>
				</ChartShell>
			);

		case 'bar':
		case 'groupedBar':
			return (
				<ChartShell height={height} title={spec.title}>
					<ResponsiveContainer height="100%" width="100%">
						<BarChart data={data}>
							<Grid />
							<XAxis dataKey={xKey ?? inferFirstKey(data)} />
							<YAxis />
							<Tooltip
								content={<Tip fields={spec.tooltip?.fields} />}
								wrapperStyle={{ zIndex: 9999 }}
							/>
							{sKey ? (
								seriesKeys(data, sKey).map((k) => (
									<Bar
										dataKey={(row) => getNumber(row, yKey, k, sKey)}
										key={k}
										name={`${yKey} (${k})`}
									/>
								))
							) : (
								<Bar dataKey={yKey ?? inferFirstNumeric(data)} />
							)}
							{spec.legend?.show !== false ? (
								<Legend height={24} verticalAlign="top" />
							) : null}
						</BarChart>
					</ResponsiveContainer>
				</ChartShell>
			);

		case 'stackedBar':
			return (
				<ChartShell height={height} title={spec.title}>
					<ResponsiveContainer height="100%" width="100%">
						<BarChart data={data}>
							<Grid />
							<XAxis dataKey={xKey ?? inferFirstKey(data)} />
							<YAxis />
							<Tooltip
								content={<Tip fields={spec.tooltip?.fields} />}
								wrapperStyle={{ zIndex: 9999 }}
							/>
							{sKey ? (
								seriesKeys(data, sKey).map((k) => (
									<Bar
										dataKey={(row) => getNumber(row, yKey, k, sKey)}
										key={k}
										name={`${yKey} (${k})`}
										stackId="1"
									/>
								))
							) : (
								<Bar dataKey={yKey ?? inferFirstNumeric(data)} />
							)}
							{spec.legend?.show !== false ? (
								<Legend height={24} verticalAlign="top" />
							) : null}
						</BarChart>
					</ResponsiveContainer>
				</ChartShell>
			);

		case 'pie':
		case 'donut': {
			const valueKey = yKey ?? inferFirstNumeric(data);
			const nameKey = xKey ?? inferFirstKey(data);
			const pieData = toPiePairs(data, nameKey, valueKey);
			const innerRadius = spec.kind === 'donut' ? 60 : 0;

			return (
				<ChartShell height={height} title={spec.title}>
					<ResponsiveContainer height="100%" width="100%">
						<PieChart>
							<Tooltip
								content={<Tip fields={spec.tooltip?.fields} />}
								wrapperStyle={{ zIndex: 9999 }}
							/>
							<Legend height={24} verticalAlign="top" />
							<Pie
								data={pieData}
								dataKey="value"
								innerRadius={innerRadius}
								isAnimationActive={false}
								nameKey="name"
								outerRadius={90}
							>
								{pieData.map((_entry, idx) => (
									<Cell key={`cell-${idx}`} />
								))}
							</Pie>
						</PieChart>
					</ResponsiveContainer>
				</ChartShell>
			);
		}

		case 'scatter': {
			const x = spec.x?.field ?? inferFirstNumeric(data);
			const y = spec.y?.field ?? inferSecondNumeric(data, x);
			return (
				<ChartShell height={height} title={spec.title}>
					<ResponsiveContainer height="100%" width="100%">
						<ScatterChart>
							<Grid />
							<XAxis dataKey={x} type="number" />
							<YAxis dataKey={y} type="number" />
							<Tooltip
								cursor={{ strokeDasharray: '3 3' }}
								wrapperStyle={{ zIndex: 9999 }}
							/>
							<Scatter data={data} fill="currentColor" />
						</ScatterChart>
					</ResponsiveContainer>
				</ChartShell>
			);
		}

		case 'histogram': {
			const valueKey = yKey ?? inferFirstNumeric(data);
			const bins = 20;
			const hist = histogram(data, valueKey, bins);
			return (
				<ChartShell height={height} title={spec.title}>
					<ResponsiveContainer height="100%" width="100%">
						<BarChart data={hist}>
							<Grid />
							<XAxis dataKey="bin" />
							<YAxis />
							<Tooltip wrapperStyle={{ zIndex: 9999 }} />
							<Bar dataKey="count" />
						</BarChart>
					</ResponsiveContainer>
				</ChartShell>
			);
		}

		case 'heatmap': {
			// Recharts has no native heatmap; render a simple CSS grid heatmap
			// Expect x=category/time field, y=category field, and y2 or size/value numeric
			const x = spec.x?.field ?? inferFirstKey(data);
			const y = spec.y?.field ?? inferSecondKey(data, x);
			const v = spec.y2?.field ?? spec.size?.field ?? inferFirstNumeric(data);

			const grid = toHeatGrid(data, x, y, v);
			const allVals = grid.cells.map((c) => c.value);
			const min = Math.min(...allVals);
			const max = Math.max(...allVals);

			return (
				<ChartShell height={height} title={spec.title}>
					<div className="overflow-auto">
						<div className="mb-2 flex gap-2 text-neutral-500 text-xs dark:text-neutral-400">
							<span>X: {x}</span>
							<span>Y: {y}</span>
							<span>Value: {v}</span>
						</div>
						<div
							className="grid border border-neutral-200 dark:border-neutral-800"
							style={{
								gridTemplateColumns: `repeat(${grid.xs.length + 1}, minmax(72px, auto))`,
							}}
						>
							{/* header row */}
							<div className="sticky top-0 left-0 z-10 bg-neutral-50 p-2 font-medium text-xs dark:bg-neutral-900" />
							{grid.xs.map((xv) => (
								<div
									className="bg-neutral-50 p-2 font-medium text-xs dark:bg-neutral-900"
									key={`hx-${xv}`}
								>
									{String(xv)}
								</div>
							))}
							{/* rows */}
							{grid.ys.map((yv) => (
								<>
									<div
										className="sticky left-0 bg-neutral-50 p-2 font-medium text-xs dark:bg-neutral-900"
										key={`hy-${yv}`}
									>
										{String(yv)}
									</div>
									{grid.xs.map((xv) => {
										const cell = grid.cells.find(
											(c) => c.x === xv && c.y === yv
										);
										const value = cell?.value ?? 0;
										const t = normalize(value, min, max);
										return (
											<div
												className="h-10 w-24 border border-neutral-200 text-center text-xs dark:border-neutral-800"
												key={`c-${xv}-${yv}`}
												style={{
													background: `rgba(0,0,0,${0.08 + 0.5 * t})`,
													color: t > 0.6 ? 'white' : 'black',
												}}
												title={`${value}`}
											>
												{value}
											</div>
										);
									})}
								</>
							))}
						</div>
					</div>
				</ChartShell>
			);
		}
		default:
			return (
				<ChartShell height={height} title={spec.title ?? 'Table'}>
					<Table columns={spec.tableColumns} rows={data} />
				</ChartShell>
			);
	}
}

/* ---------------- UI shells and utilities ---------------- */

function ChartShell({
	children,
	title,
	height,
}: {
	children: React.ReactNode;
	title?: string;
	height: number;
}) {
	return (
		<div className="w-full">
			{title ? (
				<div className="mb-2 font-medium text-neutral-700 text-sm dark:text-neutral-200">
					{title}
				</div>
			) : null}
			<div style={{ height }}>{children}</div>
		</div>
	);
}

function Grid() {
	return (
		<CartesianGrid
			className="dark:stroke-[#1d1d1d]"
			stroke="#e6e6e6"
			strokeDasharray="3 3"
		/>
	);
}

function Tip({ fields }: { fields?: string[] }) {
	return (
		<div className="rounded border border-neutral-200 bg-white p-2 text-[11px] text-black shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-white">
			{fields?.length ? (
				<ul className="space-y-1">
					{fields.map((f) => (
						<li className="text-neutral-600 dark:text-neutral-400" key={f}>
							{f}
						</li>
					))}
				</ul>
			) : (
				<div className="text-neutral-600 dark:text-neutral-400">Values</div>
			)}
		</div>
	);
}

function Table({ rows, columns }: { rows: AnyRow[]; columns?: string[] }) {
	if (!rows.length) {
		return <div className="text-neutral-500 text-sm">No rows</div>;
	}
	const cols = columns?.length ? columns : Object.keys(rows[0]);
	return (
		<div className="w-full overflow-auto rounded border border-neutral-200 dark:border-neutral-800">
			<table className="w-full min-w-[640px] text-sm">
				<thead className="bg-neutral-50 dark:bg-neutral-900">
					<tr>
						{cols.map((c) => (
							<th
								className="px-3 py-2 text-left font-medium text-neutral-700 dark:text-neutral-200"
								key={c}
							>
								{c}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.slice(0, 500).map((r, i) => (
						<tr
							className="border-neutral-200 border-t dark:border-neutral-800"
							key={i}
						>
							{cols.map((c) => (
								<td
									className="px-3 py-2 text-neutral-800 dark:text-neutral-100"
									key={c}
								>
									{formatCell(r[c])}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function formatCell(v: unknown) {
	if (v == null) {
		return '';
	}
	if (typeof v === 'number') {
		return Number.isFinite(v) ? String(v) : '';
	}
	if (v instanceof Date) {
		return v.toISOString();
	}
	return String(v);
}

/* ---------------- data helpers ---------------- */

function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}

function thin<T>(arr: T[], every: number): T[] {
	if (every <= 1) {
		return arr;
	}
	const out: T[] = [];
	for (let i = 0; i < arr.length; i += every) {
		out.push(arr[i]);
	}
	return out;
}

function getNumber(
	row: AnyRow,
	yKey: string | null,
	_seriesValue: string,
	_seriesKey: string
) {
	// If yKey is a single measure and seriesKey partitions rows, look for yKey
	const base = yKey ? row[yKey] : undefined;
	if (typeof base === 'number') {
		return base;
	}
	// If measure is encoded in wide format like value_<series>, you can adapt here
	// For now, fallback to 0
	return 0;
}

function applyFilters(
	rows: AnyRow[],
	filters: NonNullable<ChartSpec['filters']>
) {
	if (!filters.length) {
		return rows;
	}
	return rows.filter((r) =>
		filters.every((f) => {
			const v = r[f.field as keyof AnyRow] as any;
			switch (f.op) {
				case '=':
					return v === (f.value as any);
				case '!=':
					return v !== (f.value as any);
				case '>':
					return Number(v) > Number(f.value);
				case '>=':
					return Number(v) >= Number(f.value);
				case '<':
					return Number(v) < Number(f.value);
				case '<=':
					return Number(v) <= Number(f.value);
				case 'in':
					return Array.isArray(f.value) && (f.value as any[]).includes(v);
				case 'not-in':
					return Array.isArray(f.value) && !(f.value as any[]).includes(v);
				case 'between': {
					if (!Array.isArray(f.value)) {
						return true;
					}
					const [a, b] = f.value as [number, number];
					const nv = Number(v);
					return nv >= a && nv <= b;
				}
				default:
					return true;
			}
		})
	);
}

function applySort(rows: AnyRow[], sort: NonNullable<ChartSpec['sort']>) {
	if (!sort.length) {
		return rows;
	}
	const copy = [...rows];
	copy.sort((a, b) => {
		for (const s of sort) {
			const av = a[s.field as keyof AnyRow] as any;
			const bv = b[s.field as keyof AnyRow] as any;
			if (av < bv) {
				return s.order === 'desc' ? 1 : -1;
			}
			if (av > bv) {
				return s.order === 'desc' ? -1 : 1;
			}
		}
		return 0;
	});
	return copy;
}

function inferFirstKey(rows: AnyRow[]) {
	return Object.keys(rows[0] ?? {})[0] ?? 'x';
}

function inferSecondKey(rows: AnyRow[], first: string) {
	const keys = Object.keys(rows[0] ?? {});
	return keys.find((k) => k !== first) ?? first;
}

function inferFirstNumeric(rows: AnyRow[]) {
	const keys = Object.keys(rows[0] ?? {});
	return keys.find((k) => typeof rows[0]?.[k] === 'number') ?? keys[0];
}

function inferSecondNumeric(rows: AnyRow[], first: string) {
	const keys = Object.keys(rows[0] ?? {});
	return (
		keys.find((k) => k !== first && typeof rows[0]?.[k] === 'number') ?? first
	);
}

function seriesKeys(rows: AnyRow[], field: string): string[] {
	const set = new Set<string>();
	for (const r of rows) {
		const v = r[field];
		if (v != null) {
			set.add(String(v));
		}
	}
	return Array.from(set.values()).slice(0, 12);
}

function toPiePairs(rows: AnyRow[], nameKey: string, valueKey: string) {
	const out: Array<{ name: string; value: number }> = [];
	for (const r of rows) {
		const name = String(r[nameKey] ?? '');
		const v = Number(r[valueKey] ?? 0);
		out.push({ name, value: Number.isFinite(v) ? v : 0 });
	}
	return out;
}

function histogram(rows: AnyRow[], key: string, bins: number) {
	const vals = rows
		.map((r) => Number(r[key] ?? 0))
		.filter((n) => Number.isFinite(n));
	if (!vals.length) {
		return [];
	}
	const min = Math.min(...vals);
	const max = Math.max(...vals);
	const step = (max - min) / bins || 1;
	const buckets = Array.from({ length: bins }, (_, i) => ({
		bin: `${(min + i * step).toFixed(1)}-${(min + (i + 1) * step).toFixed(1)}`,
		count: 0,
	}));

	for (const v of vals) {
		const idx = Math.min(Math.floor((v - min) / step), bins - 1);
		buckets[idx].count += 1;
	}
	return buckets;
}

function toHeatGrid(rows: AnyRow[], xKey: string, yKey: string, vKey: string) {
	const xs = Array.from(new Set(rows.map((r) => String(r[xKey]))).values());
	const ys = Array.from(new Set(rows.map((r) => String(r[yKey]))).values());
	const cells: Array<{ x: string; y: string; value: number }> = [];

	for (const y of ys) {
		for (const x of xs) {
			const val = rows
				.filter((r) => String(r[xKey]) === x && String(r[yKey]) === y)
				.reduce((acc, r) => acc + Number(r[vKey] ?? 0), 0);
			cells.push({ x, y, value: Number.isFinite(val) ? val : 0 });
		}
	}
	return { xs, ys, cells };
}

function normalize(v: number, min: number, max: number) {
	if (max === min) {
		return 0.5;
	}
	return (v - min) / (max - min);
}
