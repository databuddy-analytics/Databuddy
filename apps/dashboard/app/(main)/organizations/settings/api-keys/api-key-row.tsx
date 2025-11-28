"use client";

import {
	CalendarIcon,
	CaretRightIcon,
	KeyIcon,
	LockIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";

interface ApiKeyRowItem {
	id: string;
	name: string;
	prefix: string;
	start: string;
	enabled: boolean;
	revokedAt: Date | null;
	expiresAt: string | null;
	createdAt: Date;
}

interface ApiKeyRowProps {
	apiKey: ApiKeyRowItem;
	onSelect: (id: string) => void;
}

export const ApiKeyRow = memo(function ApiKeyRowComponent({
	apiKey,
	onSelect,
}: ApiKeyRowProps) {
	const isActive = apiKey.enabled && !apiKey.revokedAt;
	const isExpired =
		apiKey.expiresAt && dayjs(apiKey.expiresAt).isBefore(dayjs());

	return (
		<button
			className="group grid w-full cursor-pointer grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
			onClick={() => onSelect(apiKey.id)}
			type="button"
		>
			{/* Icon */}
			<div className="flex h-10 w-10 items-center justify-center rounded border bg-background transition-colors group-hover:border-primary/30 group-hover:bg-primary/5">
				<KeyIcon
					className="text-muted-foreground transition-colors group-hover:text-primary"
					size={18}
					weight="duotone"
				/>
			</div>

			{/* Info */}
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium">{apiKey.name}</span>
					{!isActive && (
						<Badge className="bg-destructive/10 text-destructive" variant="secondary">
							<LockIcon className="mr-1" size={10} weight="fill" />
							{apiKey.revokedAt ? "Revoked" : "Disabled"}
						</Badge>
					)}
					{isExpired && (
						<Badge className="bg-warning/10 text-warning" variant="secondary">
							<WarningIcon className="mr-1" size={10} weight="fill" />
							Expired
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-3 text-muted-foreground text-sm">
					<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
						{apiKey.prefix}_{apiKey.start}…
					</code>
					<span className="flex items-center gap-1 text-xs">
						<CalendarIcon size={12} />
						{dayjs(apiKey.createdAt).format("MMM D, YYYY")}
					</span>
				</div>
			</div>

			{/* Status */}
			{isActive ? (
				<Badge
					className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
					variant="secondary"
				>
					<div className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500" />
					Active
				</Badge>
			) : (
				<Badge
					className="bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400"
					variant="secondary"
				>
					<div className="mr-1.5 h-1.5 w-1.5 rounded-full bg-gray-400" />
					Inactive
				</Badge>
			)}

			{/* Arrow */}
			<CaretRightIcon
				className="text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
				size={16}
				weight="bold"
			/>
		</button>
	);
});
