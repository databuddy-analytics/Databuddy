import { getErrorTypeIcon } from "./error-icons";
import {
	getErrorCategory,
	getErrorsPerAffectedUser,
	getSeverityColor,
} from "./utils";
import { BugIcon } from "@databuddy/ui/icons";
import { Badge, formatLocalTime } from "@databuddy/ui";

interface CellInfo<T = unknown> {
	getValue: () => T;
	row?: { original?: Record<string, unknown> };
}

export const errorColumns = [
	{
		id: "errors",
		accessorKey: "errors",
		header: "Total Errors",
		cell: (info: CellInfo<number>) => (
			<span className="font-medium tabular-nums">
				{info.getValue()?.toLocaleString()}
			</span>
		),
	},
	{
		id: "users",
		accessorKey: "users",
		header: "Affected Users",
		cell: (info: CellInfo<number>) => {
			const users = info.getValue() ?? 0;
			const errors = (info.row?.original?.errors as number) ?? 0;
			const errorsPerUser = getErrorsPerAffectedUser(errors, users);

			return (
				<div className="flex flex-col">
					<span className="font-medium tabular-nums">
						{users.toLocaleString()}
					</span>
					<span className="text-muted-foreground text-xs">
						{errorsPerUser.toFixed(1)} error
						{errorsPerUser.toFixed(1) === "1.0" ? "" : "s"} per affected user
					</span>
				</div>
			);
		},
	},
];

export const createErrorTypeColumns = () => [
	{
		id: "name",
		accessorKey: "name",
		header: "Error Message",
		cell: (info: CellInfo<string>) => {
			const message = info.getValue();
			if (!message) {
				return (
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<BugIcon className="size-4 text-muted-foreground" />
							<Badge variant="muted">Unknown Error</Badge>
						</div>
						<p className="text-muted-foreground text-sm">
							No error message available
						</p>
					</div>
				);
			}

			const { type, severity } = getErrorCategory(message);
			return (
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						{getErrorTypeIcon(type)}
						<Badge className={getSeverityColor(severity)}>{type}</Badge>
					</div>
					<p
						className="line-clamp-2 max-w-md text-muted-foreground text-sm"
						title={message}
					>
						{message}
					</p>
				</div>
			);
		},
	},
	{
		id: "count",
		accessorKey: "count",
		header: "Occurrences",
		cell: (info: CellInfo<number>) => (
			<span className="font-medium tabular-nums">
				{info.getValue()?.toLocaleString()}
			</span>
		),
	},
	{
		id: "users",
		accessorKey: "users",
		header: "Affected Users",
		cell: (info: CellInfo<number>) => (
			<span className="font-medium tabular-nums">
				{info.getValue()?.toLocaleString()}
			</span>
		),
	},
	{
		id: "last_seen",
		accessorKey: "last_seen",
		header: "Last Occurrence",
		cell: (info: CellInfo<string>) => {
			const lastSeen = info.getValue();
			const formatted = formatLocalTime(lastSeen, "MMM D, YYYY HH:mm");
			const diffHours = Math.floor(
				(Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60)
			);

			let timeAgo: string;
			if (diffHours < 1) {
				timeAgo = "Just now";
			} else if (diffHours < 24) {
				timeAgo = `${diffHours}h ago`;
			} else {
				timeAgo = `${Math.floor(diffHours / 24)}d ago`;
			}

			return (
				<div className="flex flex-col">
					<span className="font-medium">{formatted}</span>
					<span className="text-muted-foreground text-xs">{timeAgo}</span>
				</div>
			);
		},
	},
];

export const createPageColumn = () => ({
	id: "name",
	accessorKey: "name",
	header: "Page",
	cell: (info: CellInfo<string>) => {
		const raw = info.getValue() || "Unknown";
		let display: string;
		try {
			display = raw.startsWith("http") ? new URL(raw).pathname : raw;
		} catch {
			display = raw.startsWith("/") ? raw : `/${raw}`;
		}
		return (
			<div
				className="max-w-xs truncate font-medium font-mono text-sm"
				title={raw}
			>
				{display}
			</div>
		);
	},
});
