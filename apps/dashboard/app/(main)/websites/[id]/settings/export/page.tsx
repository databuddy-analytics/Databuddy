"use client";

import type { ExportFormat } from "@databuddy/rpc";
import {
	CheckIcon,
	DownloadIcon,
	FileCodeIcon,
	FileTextIcon,
	TableIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/date-range-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { PageHeader } from "../../../_components/page-header";

function downloadFile(blob: Blob, filename: string) {
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.style.display = "none";
	document.body.appendChild(a);
	a.click();

	window.URL.revokeObjectURL(url);
	document.body.removeChild(a);
}

export default function ExportPage() {
	const params = useParams();
	const websiteId = params.id as string;
	const { data: websiteData } = useWebsite(websiteId);

	const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("csv");
	const [dateRange, setDateRange] = useState<DayPickerRange | undefined>(
		undefined
	);
	const [useCustomRange, setUseCustomRange] = useState(false);

	const exportMutation = useMutation({
		...orpc.export.download.mutationOptions(),
	});

	const handleExport = useCallback(() => {
		if (!websiteData) {
			return;
		}
		if (useCustomRange && !(dateRange?.from && dateRange?.to)) {
			return;
		}

		const exportParams =
			useCustomRange && dateRange?.from && dateRange?.to
				? {
						websiteId,
						format: selectedFormat,
						startDate: dayjs(dateRange.from).format("YYYY-MM-DD"),
						endDate: dayjs(dateRange.to).format("YYYY-MM-DD"),
					}
				: {
						websiteId,
						format: selectedFormat,
					};

		exportMutation.mutate(exportParams, {
			onSuccess: (result) => {
				const buffer = Uint8Array.from(atob(result.data), (c) =>
					c.charCodeAt(0)
				);
				const blob = new Blob([buffer], { type: "application/zip" });
				downloadFile(blob, result.filename);
				toast.success("Data exported successfully!");
			},
			onError: (error) => {
				toast.error(error.message || "Export failed");
			},
		});
	}, [
		websiteData,
		useCustomRange,
		dateRange,
		selectedFormat,
		exportMutation,
		websiteId,
	]);

	const isExporting = exportMutation.isPending;

	const formatOptions = useMemo(
		() => [
			{
				value: "json" as const,
				label: "JSON",
				description: "Structured data for developers",
				icon: FileCodeIcon,
			},
			{
				value: "csv" as const,
				label: "CSV",
				description: "Works with spreadsheets",
				icon: TableIcon,
			},
			{
				value: "txt" as const,
				label: "TXT",
				description: "Plain text export",
				icon: FileTextIcon,
			},
		],
		[]
	);

	const isExportDisabled =
		isExporting || (useCustomRange && !(dateRange?.from && dateRange?.to));

	if (!websiteData) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<PageHeader
				badgeContent="Tools"
				description="Download your analytics data for backup and analysis"
				icon={<DownloadIcon />}
				title="Data Export"
			/>

			{/* Content */}
			<div className="flex min-h-0 flex-1 flex-col">
				{/* Format selection */}
				<section className="border-b px-4 py-5 sm:px-6">
					<div className="mb-3">
						<Label className="font-medium text-sm">Export format</Label>
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						{formatOptions.map((format) => {
							const IconComponent = format.icon;
							return (
								<button
									className={`flex items-start gap-3 rounded-md border p-4 text-left transition-colors hover:border-primary/50 ${
										selectedFormat === format.value
											? "bg-secondary"
											: "border-border"
									}`}
									key={format.value}
									onClick={() => setSelectedFormat(format.value)}
									type="button"
								>
									<div className="flex h-8 w-8 items-center justify-center rounded-md border bg-secondary-brighter">
										<IconComponent className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="mb-1 flex items-center gap-2">
											<span className="font-medium text-sm">
												{format.label}
											</span>
											{selectedFormat === format.value && (
												<CheckIcon className="h-4 w-4 text-primary" />
											)}
										</div>
										<p className="text-muted-foreground text-xs">
											{format.description}
										</p>
									</div>
								</button>
							);
						})}
					</div>
				</section>

				{/* Date range */}
				<section className="border-b px-4 py-5 sm:px-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="font-medium text-sm">Date range</h2>
							<p className="text-muted-foreground text-xs">
								{useCustomRange
									? "Export a specific range"
									: "Export all available data"}
							</p>
						</div>
						<Switch
							aria-label="Use custom date range"
							checked={useCustomRange}
							id="custom-range"
							onCheckedChange={setUseCustomRange}
						/>
					</div>
					{useCustomRange && (
						<div className="mt-3 border-t pt-3">
							<div className="flex items-center gap-3">
								<Label className="shrink-0 font-medium text-sm">
									From - To:
								</Label>
								<DateRangePicker
									className="flex-1"
									maxDate={new Date()}
									minDate={new Date(2020, 0, 1)}
									onChange={setDateRange}
									value={dateRange}
								/>
							</div>
						</div>
					)}
				</section>

				{/* Export action */}
				<section className="px-4 py-5 sm:px-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 className="font-medium text-sm">
								Ready to export {websiteData.name || "your website"} data
							</h3>
							<p className="mt-2 text-muted-foreground text-xs">
								Format:{" "}
								<Badge className="font-mono" variant="secondary">
									{selectedFormat.toUpperCase()}
								</Badge>
								{useCustomRange && dateRange?.from && dateRange?.to && (
									<span className="ml-2">
										• {dayjs(dateRange.from).format("MMM D, YYYY")} -{" "}
										{dayjs(dateRange.to).format("MMM D, YYYY")}
									</span>
								)}
							</p>
						</div>
						<Button
							aria-label="Start data export"
							disabled={isExportDisabled}
							onClick={handleExport}
							size="lg"
						>
							{isExporting ? (
								<>
									<div className="size-4 animate-spin rounded-full border border-current border-t-transparent" />
									Exporting...
								</>
							) : (
								<>
									<DownloadIcon className="size-4" />
									Export Data
								</>
							)}
						</Button>
					</div>
				</section>
			</div>
		</div>
	);
}
