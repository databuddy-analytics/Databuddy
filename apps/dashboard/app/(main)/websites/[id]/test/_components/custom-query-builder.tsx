"use client";

import {
	ANALYTICS_TABLES,
	getTableDefinition,
} from "./schema/analytics-tables";
import type {
	AggregateFunction,
	CustomQueryConfig,
} from "./types/custom-query";
import { useMemo } from "react";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Field } from "@databuddy/ui";

interface CustomQueryBuilderProps {
	disabled?: boolean;
	onChangeAction: (config: CustomQueryConfig) => void;
	value: CustomQueryConfig | null;
}

const AGGREGATES: {
	value: AggregateFunction;
	label: string;
	prefix: string;
	forTypes: ("string" | "number")[];
}[] = [
	{
		value: "count",
		label: "Count",
		prefix: "",
		forTypes: ["string", "number"],
	},
	{
		value: "uniq",
		label: "Count Unique",
		prefix: "Unique ",
		forTypes: ["string"],
	},
	{ value: "sum", label: "Sum", prefix: "Total ", forTypes: ["number"] },
	{ value: "avg", label: "Average", prefix: "Avg ", forTypes: ["number"] },
	{ value: "max", label: "Maximum", prefix: "Max ", forTypes: ["number"] },
	{ value: "min", label: "Minimum", prefix: "Min ", forTypes: ["number"] },
];

export function CustomQueryBuilder({
	value,
	onChangeAction,
	disabled,
}: CustomQueryBuilderProps) {
	const tables = useMemo(
		() => ANALYTICS_TABLES.map((t) => ({ name: t.name, label: t.label })),
		[]
	);

	const { stringColumns, numberColumns } = useMemo(() => {
		if (!value?.table) {
			return { stringColumns: [], numberColumns: [] };
		}
		const table = getTableDefinition(value.table);
		if (!table) {
			return { stringColumns: [], numberColumns: [] };
		}
		return {
			stringColumns: table.columns.filter((c) => c.type === "string"),
			numberColumns: table.columns.filter(
				(c) => c.type === "number" && c.aggregatable
			),
		};
	}, [value?.table]);

	const currentField = value?.selects?.at(0)?.field || "*";
	const currentAggregate = value?.selects?.at(0)?.aggregate || "count";

	const availableAggregates = useMemo(() => {
		if (currentField === "*") {
			return AGGREGATES.filter((a) => a.value === "count");
		}
		const isNumber = numberColumns.some((c) => c.name === currentField);
		return AGGREGATES.filter((a) =>
			a.forTypes.includes(isNumber ? "number" : "string")
		);
	}, [currentField, numberColumns]);

	const getAlias = (field: string, aggregate: AggregateFunction) => {
		if (field === "*") {
			return "Count";
		}
		const col = [...stringColumns, ...numberColumns].find(
			(c) => c.name === field
		);
		const agg = AGGREGATES.find((a) => a.value === aggregate);
		return `${agg?.prefix || ""}${col?.label || field}`;
	};

	const handleTableChange = (tableName: string) => {
		onChangeAction({
			table: tableName,
			selects: [{ field: "*", aggregate: "count", alias: "Count" }],
		});
	};

	const handleFieldChange = (field: string) => {
		if (!value?.table) {
			return;
		}
		const isNumber = numberColumns.some((c) => c.name === field);
		const aggregate: AggregateFunction =
			field === "*" ? "count" : isNumber ? "sum" : "uniq";

		onChangeAction({
			...value,
			selects: [{ field, aggregate, alias: getAlias(field, aggregate) }],
		});
	};

	const handleAggregateChange = (aggregate: AggregateFunction) => {
		if (!value?.table) {
			return;
		}
		onChangeAction({
			...value,
			selects: [
				{
					field: currentField,
					aggregate,
					alias: getAlias(currentField, aggregate),
				},
			],
		});
	};

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Field.Label>Table</Field.Label>
				<Select
					disabled={disabled}
					onValueChange={handleTableChange}
					value={value?.table || ""}
				>
					<SelectTrigger>
						<SelectValue placeholder="Select table..." />
					</SelectTrigger>
					<SelectContent>
						{tables.map((t) => (
							<SelectItem key={t.name} value={t.name}>
								{t.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{value?.table && (
				<>
					<div className="space-y-2">
						<Field.Label>Field</Field.Label>
						<Select
							disabled={disabled}
							onValueChange={handleFieldChange}
							value={currentField}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="*">All rows</SelectItem>
								{stringColumns.length > 0 && (
									<SelectGroup>
										<SelectLabel>Text fields</SelectLabel>
										{stringColumns.map((col) => (
											<SelectItem key={col.name} value={col.name}>
												{col.label}
											</SelectItem>
										))}
									</SelectGroup>
								)}
								{numberColumns.length > 0 && (
									<SelectGroup>
										<SelectLabel>Numeric fields</SelectLabel>
										{numberColumns.map((col) => (
											<SelectItem key={col.name} value={col.name}>
												{col.label}
											</SelectItem>
										))}
									</SelectGroup>
								)}
							</SelectContent>
						</Select>
					</div>

					{availableAggregates.length > 1 && (
						<div className="space-y-2">
							<Field.Label>Calculation</Field.Label>
							<Select
								disabled={disabled}
								onValueChange={(v) =>
									handleAggregateChange(v as AggregateFunction)
								}
								value={currentAggregate}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{availableAggregates.map((agg) => (
										<SelectItem key={agg.value} value={agg.value}>
											{agg.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</>
			)}
		</div>
	);
}
