'use client';

import { CheckIcon, DownloadIcon } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDataExport } from '@/hooks/use-data-export';
import { useWebsite } from '@/hooks/use-websites';

export default function ExportPage() {
	const params = useParams();
	const websiteId = params.id as string;
	const { data: websiteData } = useWebsite(websiteId);

	type ExportFormat = 'json' | 'csv' | 'txt';
	const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
	const [dateRange, setDateRange] = useState<DayPickerRange | undefined>(
		undefined
	);
	const [useCustomRange, setUseCustomRange] = useState(false);

	const { mutate: exportData, isPending: isExporting } = useDataExport({
		websiteId,
		websiteName: websiteData?.name || undefined,
	});

	const formatOptions = useMemo(
		() => [
			{
				value: 'json' as const,
				label: 'JSON',
				description: 'Structured data for developers',
				icon: '📄',
			},
			{
				value: 'csv' as const,
				label: 'CSV',
				description: 'Works with spreadsheets',
				icon: '📊',
			},
			{
				value: 'txt' as const,
				label: 'TXT',
				description: 'Plain text export',
				icon: '📝',
			},
		],
		[]
	);

	const isExportDisabled =
		isExporting || (useCustomRange && !(dateRange?.from && dateRange?.to));

	const handleExport = useCallback(() => {
		if (!websiteData) {
			return;
		}
		if (useCustomRange && !(dateRange?.from && dateRange?.to)) {
			return;
		}

		if (useCustomRange && dateRange?.from && dateRange?.to) {
			const startDate = dayjs(dateRange.from).format('YYYY-MM-DD');
			const endDate = dayjs(dateRange.to).format('YYYY-MM-DD');
			exportData({ format: selectedFormat, startDate, endDate });
		} else {
			exportData({ format: selectedFormat });
		}
	}, [websiteData, useCustomRange, dateRange, selectedFormat, exportData]);

	if (!websiteData) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Header - align with websites header */}
			<div className="h-[89px] border-b">
				<div className="flex h-full flex-col justify-center gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-3">
							<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
								<DownloadIcon className="h-5 w-5 text-primary" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
										Data Export
									</h1>
									<Badge className="h-5 px-2" variant="secondary">
										Tools
									</Badge>
								</div>
								<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
									Download your analytics data for backup and analysis
								</p>
							</div>
						</div>
					</div>
					{/* Right-side actions (optional) */}
				</div>

				{/* Content */}
				<div className="flex min-h-0 flex-1 flex-col">
					{/* Format selection */}
					<section className="border-b px-4 py-5 sm:px-6">
						<div className="mb-3">
							<Label className="font-medium text-sm">Export format</Label>
						</div>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							{formatOptions.map((format) => (
								<button
									className={`flex items-start gap-3 rounded-md border p-4 text-left transition-colors hover:border-primary/50 ${
										selectedFormat === format.value
											? 'border-primary bg-primary/5'
											: 'border-border'
									}`}
									key={format.value}
									onClick={() => setSelectedFormat(format.value)}
									type="button"
								>
									<div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-lg">
										{format.icon}
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
							))}
						</div>
					</section>

					{/* Date range */}
					<section className="border-b px-4 py-5 sm:px-6">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h2 className="font-medium text-sm">Date range</h2>
								<p className="text-muted-foreground text-xs">
									{useCustomRange
										? 'Export a specific range'
										: 'Export all available data'}
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
									Ready to export {websiteData.name || 'your website'} data
								</h3>
								<p className="text-muted-foreground text-xs">
									Format:{' '}
									<Badge className="font-mono" variant="secondary">
										{selectedFormat.toUpperCase()}
									</Badge>
									{useCustomRange && dateRange?.from && dateRange?.to && (
										<span className="ml-2">
											• {dayjs(dateRange.from).format('MMM D, YYYY')} -{' '}
											{dayjs(dateRange.to).format('MMM D, YYYY')}
										</span>
									)}
								</p>
							</div>
							<Button
								aria-label="Start data export"
								className="min-w-[140px]"
								disabled={isExportDisabled}
								onClick={handleExport}
								size="lg"
							>
								{isExporting ? (
									<>
										<div className="mr-2 h-4 w-4 animate-spin rounded-full border border-current border-t-transparent" />
										Exporting...
									</>
								) : (
									<>
										<DownloadIcon className="mr-2 h-4 w-4" />
										Export Data
									</>
								)}
							</Button>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
