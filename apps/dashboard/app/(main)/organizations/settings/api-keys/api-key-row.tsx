"use client";

import {
	CalendarIcon,
	CaretRightIcon,
	KeyIcon,
	LockKeyIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ApiKeyRowItem = {
	id: string;
	name: string;
	prefix: string;
	start: string;
	enabled: boolean;
	revokedAt: Date | null;
	expiresAt: string | null;
	createdAt: Date;
	scopes: string[];
};

type ApiKeyRowProps = {
	apiKey: ApiKeyRowItem;
	onSelect: () => void;
};

export function ApiKeyRow({ apiKey, onSelect }: ApiKeyRowProps) {
	const isActive = apiKey.enabled && !apiKey.revokedAt;
	const isExpired =
		apiKey.expiresAt && dayjs(apiKey.expiresAt).isBefore(dayjs());
	const isRevoked = !!apiKey.revokedAt;

	return (
		<button
			className={cn(
				"group grid w-full cursor-pointer grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4 text-left hover:bg-accent",
				!isActive && "opacity-60"
			)}
			onClick={onSelect}
			type="button"
		>
			{/* Icon */}
			<div
				className={cn(
					"flex size-10 items-center justify-center rounded border bg-background",
					isActive
						? "group-hover:border-primary/30 group-hover:bg-primary/5"
						: "border-dashed"
				)}
			>
				{isActive ? (
					<KeyIcon
						className="text-muted-foreground group-hover:text-primary"
						size={18}
						weight="duotone"
					/>
				) : (
					<LockKeyIcon
						className="text-muted-foreground"
						size={18}
						weight="duotone"
					/>
				)}
			</div>

			{/* Info */}
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"truncate font-medium",
							!isActive && "line-through decoration-muted-foreground/50"
						)}
					>
						{apiKey.name}
					</span>
					{isExpired && (
						<Badge variant="amber">
							<WarningIcon className="mr-1" size={10} weight="fill" />
							Expired
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-3 text-muted-foreground text-sm">
					<code className="rounded border bg-secondary px-1.5 py-0.5 font-mono text-foreground text-xs">
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
				<Badge variant="green">
					<div className="mr-1.5 size-1.5 rounded-full bg-green-600 dark:bg-green-400" />
					Active
				</Badge>
			) : (
				<Badge variant="gray">{isRevoked ? "Revoked" : "Disabled"}</Badge>
			)}

			{/* Arrow */}
			<CaretRightIcon
				className={cn(
					"text-muted-foreground/40 transition-all",
					isActive && "group-hover:translate-x-0.5 group-hover:text-primary"
				)}
				size={16}
				weight="bold"
			/>
		</button>
	);
}
