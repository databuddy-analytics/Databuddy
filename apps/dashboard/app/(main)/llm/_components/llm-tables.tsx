"use client";

import { RobotIcon } from "@phosphor-icons/react/dist/ssr/Robot";
import { WrenchIcon } from "@phosphor-icons/react/dist/ssr/Wrench";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/table/data-table";
import { PercentageBadge } from "@/components/ui/percentage-badge";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
	formatCurrency,
	formatDuration,
	formatNumber,
	type LLMModelData,
	type LLMToolData,
} from "./llm-types";

// Helper components
function createMetricDisplay(
	value: number,
	label: string,
	format = formatNumber
) {
	return (
		<div>
			<div className="font-medium text-foreground">{format(value)}</div>
			<div className="text-muted-foreground text-xs">{label}</div>
		</div>
	);
}

function createToolIndicator() {
	return <div className="size-2 shrink-0 rounded bg-chart-1" />;
}

function createModelIndicator() {
	return <div className="size-2 shrink-0 rounded bg-blue-500" />;
}

// Tool columns
function createToolColumns(
	totalCalls: number
): ColumnDef<LLMToolData & { name: string }>[] {
	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Tool Name",
			cell: ({ getValue }) => {
				const name = getValue() as string;
				return (
					<div className="flex items-center gap-3">
						{createToolIndicator()}
						<WrenchIcon
							className="size-4 shrink-0 text-muted-foreground"
							weight="duotone"
						/>
						<TruncatedText
							className="truncate font-medium text-foreground"
							text={name}
						/>
					</div>
				);
			},
		},
		{
			id: "calls",
			accessorKey: "calls",
			header: "Calls",
			cell: ({ getValue }) =>
				createMetricDisplay(getValue() as number, "total"),
		},
		{
			id: "percentage",
			accessorKey: "calls",
			header: "Share",
			cell: ({ getValue }) => {
				const calls = getValue() as number;
				const percentage = totalCalls > 0 ? (calls / totalCalls) * 100 : 0;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}

// Model columns
function createModelColumns(
	totalCost: number
): ColumnDef<LLMModelData & { name: string }>[] {
	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Model",
			cell: ({ row }) => {
				const model = row.original;
				return (
					<div className="flex items-center gap-3">
						{createModelIndicator()}
						<RobotIcon
							className="size-4 shrink-0 text-muted-foreground"
							weight="duotone"
						/>
						<div className="min-w-0">
							<TruncatedText
								className="block truncate font-medium text-foreground"
								text={model.model}
							/>
							<span className="text-muted-foreground text-xs">
								{model.provider}
							</span>
						</div>
					</div>
				);
			},
		},
		{
			id: "calls",
			accessorKey: "calls",
			header: "Requests",
			cell: ({ getValue }) =>
				createMetricDisplay(getValue() as number, "total"),
		},
		{
			id: "total_tokens",
			accessorKey: "total_tokens",
			header: "Tokens",
			cell: ({ getValue }) => createMetricDisplay(getValue() as number, "used"),
		},
		{
			id: "avg_duration_ms",
			accessorKey: "avg_duration_ms",
			header: "Latency",
			cell: ({ getValue }) =>
				createMetricDisplay(getValue() as number, "avg", formatDuration),
		},
		{
			id: "total_cost",
			accessorKey: "total_cost",
			header: "Cost",
			cell: ({ getValue }) =>
				createMetricDisplay(getValue() as number, "total", formatCurrency),
		},
		{
			id: "percentage",
			accessorKey: "total_cost",
			header: "Share",
			cell: ({ getValue }) => {
				const cost = getValue() as number;
				const percentage = totalCost > 0 ? (cost / totalCost) * 100 : 0;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}

interface LLMTablesProps {
	tools: LLMToolData[];
	models: LLMModelData[];
	isLoading: boolean;
}

export function LLMTables({ tools, models, isLoading }: LLMTablesProps) {
	// Calculate totals for percentage
	const totalToolCalls = useMemo(
		() => tools.reduce((sum, t) => sum + (t.calls || 0), 0),
		[tools]
	);
	const totalModelCost = useMemo(
		() => models.reduce((sum, m) => sum + (m.total_cost || 0), 0),
		[models]
	);

	// Transform data for DataTable (needs `name` field)
	const toolsTableData = useMemo(
		() => tools.map((t) => ({ ...t, name: t.tool_name })),
		[tools]
	);
	const modelsTableData = useMemo(
		() => models.map((m) => ({ ...m, name: m.model })),
		[models]
	);

	const toolColumns = useMemo(
		() => createToolColumns(totalToolCalls),
		[totalToolCalls]
	);
	const modelColumns = useMemo(
		() => createModelColumns(totalModelCost),
		[totalModelCost]
	);

	return (
		<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
			<DataTable
				columns={toolColumns}
				data={toolsTableData}
				description="Most frequently called tools and functions"
				isLoading={isLoading}
				minHeight={350}
				title="Tool Calls"
			/>
			<DataTable
				columns={modelColumns}
				data={modelsTableData}
				description="Usage and cost breakdown by model"
				isLoading={isLoading}
				minHeight={350}
				title="Models"
			/>
		</div>
	);
}
