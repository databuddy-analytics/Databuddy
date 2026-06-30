"use client";

import type { ExportFormat } from "@databuddy/rpc";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/date-range-picker";
import { useWebsite } from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	CheckIcon,
	FileDownloadIcon as DownloadIcon,
	FileTextIcon as FileCodeIcon,
	FileTextIcon,
	TableIcon,
} from "@databuddy/ui/icons";
import { Switch } from "@databuddy/ui/client";
import { Badge, Button, Card, dayjs } from "@databuddy/ui";

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
		...orpc.websites.exportDownload.mutationOptions(),
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
				: { websiteId, format: selectedFormat };

		exportMutation.mutate(exportParams, {
			onSuccess: (result) => {
				const buffer = Uint8Array.from(atob(result.data), (c) =>
					c.charCodeAt(0)
				);
				const blob = new Blob([buffer], { type: "application/zip" });
				downloadFile(blob, result.filename);
				toast.success("Data exported successfully!");
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
				<div className="size-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="mx-auto max-w-2xl space-y-6 p-5">
				<Card>
					<Card.Header>
						<Card.Title>Export Format</Card.Title>
						<Card.Description>
							Choose a format for your data export
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							{formatOptions.map((format) => {
								const IconComponent = format.icon;
								const isSelected = selectedFormat === format.value;
								return (
									<button
										className={cn(
											"flex items-start gap-3 rounded border p-4 text-left",
											"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
											isSelected
												? "border-primary/50 bg-primary/5"
												: "border-border/60 hover:border-primary/30 hover:bg-interactive-hover"
										)}
										key={format.value}
										onClick={() => setSelectedFormat(format.value)}
										type="button"
									>
										<div className="flex size-8 items-center justify-center rounded border bg-secondary">
											<IconComponent className="size-5" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="mb-1 flex items-center gap-2">
												<span className="font-medium text-sm">
													{format.label}
												</span>
												{isSelected && (
													<CheckIcon
														className="size-4 text-primary"
														weight="bold"
													/>
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
					</Card.Content>
				</Card>

				<Card>
					<Card.Header>
						<Card.Title>Date Range</Card.Title>
						<Card.Description>
							{useCustomRange
								? "Export a specific date range"
								: "Export all available data"}
						</Card.Description>
					</Card.Header>
					<Card.Content className="space-y-3">
						<div className="flex items-center justify-between gap-3">
							<p className="font-medium text-sm">Use custom date range</p>
							<Switch
								aria-label="Use custom date range"
								checked={useCustomRange}
								onCheckedChange={setUseCustomRange}
							/>
						</div>
						{useCustomRange && (
							<div className="border-t pt-3">
								<DateRangePicker
									className="w-full"
									maxDate={new Date()}
									minDate={new Date(2020, 0, 1)}
									onChange={setDateRange}
									value={dateRange}
								/>
							</div>
						)}
					</Card.Content>
				</Card>

				<Card>
					<Card.Footer>
						<div className="flex w-full items-center justify-between">
							<p className="text-muted-foreground text-xs">
								Format:{" "}
								<Badge className="font-mono" variant="muted">
									{selectedFormat.toUpperCase()}
								</Badge>
								{useCustomRange && dateRange?.from && dateRange?.to && (
									<span className="ml-2">
										{dayjs(dateRange.from).format("MMM D, YYYY")} –{" "}
										{dayjs(dateRange.to).format("MMM D, YYYY")}
									</span>
								)}
							</p>
							<Button
								aria-label="Start data export"
								disabled={isExportDisabled}
								loading={isExporting}
								onClick={handleExport}
							>
								<DownloadIcon className="size-4" />
								Export Data
							</Button>
						</div>
					</Card.Footer>
				</Card>
			</div>
		</div>
	);
}
