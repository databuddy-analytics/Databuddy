"use client";

import { useCallback, useMemo, useState } from "react";
import { Tooltip } from "@databuddy/ui";
import { BrowserIcon, CountryFlag, OSIcon } from "@/components/icon";
import { DataTable } from "@/components/table/data-table";
import { dayjs } from "@databuddy/ui";
import { formatDateTime } from "@databuddy/ui";
import { ErrorDetailModal } from "./error-detail-modal";
import { getDeviceIcon, getErrorTypeIcon } from "./error-icons";
import type { RecentError } from "./types";
import { getErrorCategory } from "./utils";
import { ClockIcon, CodeIcon, GlobeIcon } from "@databuddy/ui/icons";

interface Props {
	isLoading?: boolean;
	recentErrors: RecentError[];
}

const SEVERITY_COLORS: Record<"high" | "medium" | "low", string> = {
	high: "bg-destructive",
	medium: "bg-amber-500",
	low: "bg-muted-foreground/50",
};

const SeverityDot = ({ severity }: { severity: "high" | "medium" | "low" }) => (
	<span
		className={`size-2 shrink-0 rounded-full ${SEVERITY_COLORS[severity]}`}
		title={`${severity} severity`}
	/>
);

const getRelativeTime = (timestamp: string): string => {
	const date = dayjs(timestamp);
	return date.isValid() ? date.fromNow() : "";
};

export const RecentErrorsTable = ({ isLoading, recentErrors }: Props) => {
	const [selectedError, setSelectedError] = useState<RecentError | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);

	const handleViewError = useCallback((error: RecentError) => {
		setSelectedError(error);
		setIsModalOpen(true);
	}, []);

	const tableData = useMemo(() => {
		const seen = new Set<string>();
		return recentErrors
			.filter((error) => {
				const key = error.stack || error.message;
				if (seen.has(key)) {
					return false;
				}
				seen.add(key);
				return true;
			})
			.map((error) => ({ ...error, name: error.message }));
	}, [recentErrors]);

	const columns = useMemo(
		() => [
			{
				id: "message",
				accessorKey: "message",
				header: "Error",
				cell: (info: { getValue: () => unknown }) => {
					const message = info.getValue() as string;
					const { type, severity } = getErrorCategory(message);

					return (
						<Tooltip
							content={<p className="max-w-sm text-pretty">{message}</p>}
						>
							<div className="flex max-w-md flex-col gap-1.5">
								<div className="flex items-center gap-2">
									<div className="flex size-5 shrink-0 items-center justify-center rounded bg-destructive/10">
										{getErrorTypeIcon(type)}
									</div>
									<span className="font-medium text-sm">{type}</span>
									<SeverityDot severity={severity} />
								</div>
								<p className="line-clamp-2 text-pretty">{message}</p>
							</div>
						</Tooltip>
					);
				},
			},
			{
				id: "path",
				accessorKey: "path",
				header: "Page",
				cell: (info: { getValue: () => unknown }) => {
					const url = info.getValue() as string;
					let pathname: string;
					try {
						pathname = url.startsWith("http") ? new URL(url).pathname : url;
					} catch {
						pathname = url;
					}

					return (
						<Tooltip content={<span className="font-mono">{url}</span>}>
							<div className="flex max-w-[140px] items-center gap-1.5">
								<CodeIcon className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="truncate font-mono text-sm">{pathname}</span>
							</div>
						</Tooltip>
					);
				},
			},
			{
				id: "environment",
				accessorKey: "browser_name",
				header: "Environment",
				cell: (info: { row: { original: RecentError } }) => {
					const {
						browser_name: browser,
						os_name: os,
						device_type: device,
					} = info.row.original;

					if (!(browser || os)) {
						return <span className="text-muted-foreground text-sm">—</span>;
					}

					return (
						<Tooltip
							content={
								<div className="flex flex-col gap-1 text-xs">
									{browser && <span>Browser: {browser}</span>}
									{os && <span>OS: {os}</span>}
									{device && <span>Device: {device}</span>}
								</div>
							}
						>
							<div className="flex items-center gap-2">
								{browser && <BrowserIcon name={browser} size="sm" />}
								{os && <OSIcon name={os} size="sm" />}
								{device && getDeviceIcon(device)}
							</div>
						</Tooltip>
					);
				},
			},
			{
				id: "country",
				accessorKey: "country",
				header: "Location",
				cell: (info: { row: { original: RecentError } }) => {
					const {
						country_code: countryCode,
						country_name,
						country,
					} = info.row.original;
					const countryName = country_name || country;

					if (!(countryCode || countryName)) {
						return (
							<div className="flex items-center gap-1.5">
								<GlobeIcon className="size-4 text-muted-foreground" />
								<span className="text-muted-foreground text-sm">Unknown</span>
							</div>
						);
					}

					return (
						<div className="flex items-center gap-1.5">
							<CountryFlag
								country={countryCode || countryName || ""}
								size={16}
							/>
							<span className="max-w-[80px] truncate text-sm">
								{countryName}
							</span>
						</div>
					);
				},
			},
			{
				id: "timestamp",
				accessorKey: "timestamp",
				header: "Time",
				cell: (info: { getValue: () => unknown }) => {
					const time = info.getValue() as string;
					return (
						<Tooltip
							content={
								<span className="font-mono text-xs">
									{formatDateTime(time)}
								</span>
							}
						>
							<div className="flex items-center gap-1.5 text-muted-foreground">
								<ClockIcon className="size-3.5 shrink-0" />
								<span className="whitespace-nowrap text-sm">
									{getRelativeTime(time)}
								</span>
							</div>
						</Tooltip>
					);
				},
			},
		],
		[]
	);

	return (
		<>
			<DataTable
				columns={columns}
				data={tableData}
				emptyMessage="No errors in this time range"
				initialPageSize={10}
				isLoading={isLoading}
				minHeight={400}
				onRowAction={(row) => handleViewError(row)}
				title="Recent Errors"
			/>

			{selectedError && (
				<ErrorDetailModal
					error={selectedError}
					isOpen={isModalOpen}
					onClose={() => {
						setIsModalOpen(false);
						setSelectedError(null);
					}}
				/>
			)}
		</>
	);
};
