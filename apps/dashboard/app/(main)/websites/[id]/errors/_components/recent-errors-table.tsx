"use client";

import {
	ClockIcon,
	CodeIcon,
	GlobeIcon,
	StackIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";
import { BrowserIcon, CountryFlag, OSIcon } from "@/components/icon";
import { DataTable } from "@/components/table/data-table";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ErrorDetailModal } from "./error-detail-modal";
import { getDeviceIcon, getErrorTypeIcon } from "./error-icons";
import type { RecentError } from "./types";
import {
	formatDateTimeSeconds,
	getErrorCategory,
	getSeverityColor,
} from "./utils";

dayjs.extend(relativeTime);

type Props = {
	recentErrors: RecentError[];
};

const SeverityDot = ({ severity }: { severity: "high" | "medium" | "low" }) => {
	const colors = {
		high: "bg-primary",
		medium: "bg-chart-2",
		low: "bg-chart-3",
	};

	return (
		<span
			className={`size-2 shrink-0 rounded-full ${colors[severity]}`}
			title={`${severity} severity`}
		/>
	);
};

const getRelativeTime = (timestamp: string): string => {
	const date = dayjs(timestamp);
	if (!date.isValid()) {
		return "";
	}
	return date.fromNow();
};

export const RecentErrorsTable = ({ recentErrors }: Props) => {
	const [selectedError, setSelectedError] = useState<RecentError | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);

	const handleViewError = (error: RecentError) => {
		setSelectedError(error);
		setIsModalOpen(true);
	};

	const columns = [
		{
			id: "severity",
			accessorKey: "message",
			header: "",
			size: 24,
			cell: (info: { getValue: () => unknown }) => {
				const message = info.getValue() as string;
				const { severity } = getErrorCategory(message);
				return (
					<div className="flex items-center justify-center">
						<SeverityDot severity={severity} />
					</div>
				);
			},
		},
		{
			id: "message",
			accessorKey: "message",
			header: "Error",
			cell: (info: {
				getValue: () => unknown;
				row: { original: RecentError };
			}) => {
				const message = info.getValue() as string;
				const row = info.row.original;
				const { type } = getErrorCategory(message);

				return (
					<div className="flex max-w-md flex-col gap-1.5">
						<div className="flex items-center gap-2">
							<div className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10">
								{getErrorTypeIcon(type)}
							</div>
							<Badge
								className={getSeverityColor(getErrorCategory(message).severity)}
							>
								{type}
							</Badge>
							{row.stack && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Badge
											className="gap-1 border-chart-2/30 bg-chart-2/10 text-chart-2"
											variant="outline"
										>
											<StackIcon className="size-3" weight="duotone" />
											<span className="hidden sm:inline">Stack</span>
										</Badge>
									</TooltipTrigger>
									<TooltipContent>
										Stack trace available — click to view
									</TooltipContent>
								</Tooltip>
							)}
						</div>
						<Tooltip>
							<TooltipTrigger asChild>
								<p className="line-clamp-2 cursor-help text-muted-foreground text-sm leading-relaxed">
									{message}
								</p>
							</TooltipTrigger>
							<TooltipContent className="max-w-md">
								<p className="wrap-break-word">{message}</p>
							</TooltipContent>
						</Tooltip>
					</div>
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
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="flex max-w-[140px] items-center gap-1.5">
								<CodeIcon
									className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
									weight="duotone"
								/>
								<span className="truncate font-mono text-sm">{pathname}</span>
							</div>
						</TooltipTrigger>
						<TooltipContent>
							<span className="font-mono">{url}</span>
						</TooltipContent>
					</Tooltip>
				);
			},
		},
		{
			id: "environment",
			accessorKey: "browser_name",
			header: "Environment",
			cell: (info: { row: { original: RecentError } }) => {
				const row = info.row.original;
				const browser = row.browser_name;
				const os = row.os_name;
				const device = row.device_type;

				if (!(browser || os)) {
					return <span className="text-muted-foreground text-sm">—</span>;
				}

				return (
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="flex items-center gap-2">
								{browser && <BrowserIcon name={browser} size="sm" />}
								{os && <OSIcon name={os} size="sm" />}
								{device && getDeviceIcon(device)}
							</div>
						</TooltipTrigger>
						<TooltipContent>
							<div className="flex flex-col gap-1 text-xs">
								{browser && <span>Browser: {browser}</span>}
								{os && <span>OS: {os}</span>}
								{device && <span>Device: {device}</span>}
							</div>
						</TooltipContent>
					</Tooltip>
				);
			},
		},
		{
			id: "country",
			accessorKey: "country",
			header: "Location",
			cell: (info: { row: { original: RecentError } }) => {
				const row = info.row.original;
				const countryCode = row.country_code;
				const countryName = row.country_name || row.country;

				if (!(countryCode || countryName)) {
					return (
						<div className="flex items-center gap-1.5">
							<GlobeIcon className="size-4 text-muted-foreground" />
							<span className="text-muted-foreground text-sm">Unknown</span>
						</div>
					);
				}

				return (
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="flex items-center gap-1.5">
								<CountryFlag
									country={countryCode || countryName || ""}
									size={16}
								/>
								<span className="max-w-[80px] truncate text-sm">
									{countryName}
								</span>
							</div>
						</TooltipTrigger>
						<TooltipContent>{countryName}</TooltipContent>
					</Tooltip>
				);
			},
		},
		{
			id: "timestamp",
			accessorKey: "timestamp",
			header: "Time",
			cell: (info: { getValue: () => unknown }) => {
				const time = info.getValue() as string;
				const relative = getRelativeTime(time);
				const full = formatDateTimeSeconds(time);

				return (
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="flex items-center gap-1.5 text-muted-foreground">
								<ClockIcon className="h-3.5 w-3.5 shrink-0" weight="duotone" />
								<span className="whitespace-nowrap text-sm">{relative}</span>
							</div>
						</TooltipTrigger>
						<TooltipContent>
							<span className="font-mono text-xs">{full}</span>
						</TooltipContent>
					</Tooltip>
				);
			},
		},
	];

	return (
		<>
			<DataTable
				columns={columns}
				data={recentErrors.map((error) => ({
					...error,
					name: error.message,
				}))}
				emptyMessage="No errors recorded in this time period"
				initialPageSize={10}
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
