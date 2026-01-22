"use client";

import {
	CopyIcon,
	DotsThreeIcon,
	LinkIcon,
	PencilSimpleIcon,
	QrCodeIcon,
	TrashIcon,
} from"@phosphor-icons/react";
import dayjs from"dayjs";
import relativeTime from"dayjs/plugin/relativeTime";
import { useCallback } from"react";
import { toast } from"sonner";
import { Badge } from"@/components/ui/badge";
import { Button } from"@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from"@/components/ui/dropdown-menu";
import { Skeleton } from"@/components/ui/skeleton";
import type { Link } from"@/hooks/use-links";
import { cn } from"@/lib/utils";

dayjs.extend(relativeTime);

const LINKS_BASE_URL ="https://dby.sh";

interface LinkItemProps {
	link: Link;
	onClick: (link: Link) => void;
	onEdit: (link: Link) => void;
	onDelete: (linkId: string) => void;
	onShowQr: (link: Link) => void;
	className?: string;
}

export function LinkItem({
	link,
	onClick,
	onEdit,
	onDelete,
	onShowQr,
	className,
}: LinkItemProps) {
	const shortUrl = `${LINKS_BASE_URL.replace("https://","")}/${link.slug}`;

	const handleCopy = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			try {
				await navigator.clipboard.writeText(`${LINKS_BASE_URL}/${link.slug}`);
				toast.success("Link copied to clipboard");
			} catch {
				toast.error("Failed to copy link");
			}
		},
		[link.slug]
	);

	// Truncate target URL for display
	let displayTargetUrl = link.targetUrl;
	try {
		const parsed = new URL(link.targetUrl);
		displayTargetUrl =
			parsed.host + (parsed.pathname !=="/" ? parsed.pathname :"");
		if (displayTargetUrl.length > 50) {
			displayTargetUrl = `${displayTargetUrl.slice(0, 47)}...`;
		}
	} catch {
		if (displayTargetUrl.length > 50) {
			displayTargetUrl = `${displayTargetUrl.slice(0, 47)}...`;
		}
	}

	return (
		<button
			className={cn(
				"group flex w-full cursor-pointer items-center gap-4 border-b px-4 py-3 text-left transition-colors hover:bg-accent/50 sm:px-6 sm:py-4",
				className
			)}
			onClick={() => onClick(link)}
			type="button"
		>
			{/* Link icon */}
			<div className="shrink-0 bg-accent p-1.5 text-primary">
				<LinkIcon className="size-4" weight="duotone" />
			</div>

			{/* Name & URLs */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<h3 className="truncate font-medium text-foreground text-sm">
						{link.name}
					</h3>
					<button
						className="flex shrink-0 items-center gap-1 bg-muted px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-muted/80"
						onClick={handleCopy}
						type="button"
					>
						<span className="text-foreground">{shortUrl}</span>
						<CopyIcon
							className="size-3 text-muted-foreground"
							weight="duotone"
						/>
					</button>
				</div>
				<p className="mt-0.5 truncate text-muted-foreground text-xs">
					→ {displayTargetUrl}
				</p>
			</div>

			{/* Stats - Desktop */}
			<div className="hidden items-center gap-6 md:flex">
				{/* Clicks placeholder - will be populated when stats are available */}
				<div className="w-20 text-right">
					<div className="font-semibold tabular-nums">-</div>
					<div className="text-muted-foreground text-xs">clicks</div>
				</div>

				{/* Created date */}
				<div className="w-28 text-right">
					<div className="text-muted-foreground text-sm">
						{dayjs(link.createdAt).fromNow()}
					</div>
				</div>
			</div>

			{/* Stats - Mobile */}
			<div className="flex items-center gap-2 md:hidden">
				<Badge variant="secondary">{dayjs(link.createdAt).fromNow()}</Badge>
			</div>

			{/* Actions */}
			<div
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label="Link actions"
							className="size-8 opacity-50 hover:opacity-100 data-[state=open]:opacity-100"
							size="icon"
							variant="ghost"
						>
							<DotsThreeIcon className="size-5" weight="bold" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-40">
						<DropdownMenuItem className="gap-2" onClick={handleCopy}>
							<CopyIcon className="size-4" weight="duotone" />
							Copy Link
						</DropdownMenuItem>
						<DropdownMenuItem className="gap-2" onClick={() => onShowQr(link)}>
							<QrCodeIcon className="size-4" weight="duotone" />
							QR Code
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem className="gap-2" onClick={() => onEdit(link)}>
							<PencilSimpleIcon className="size-4" weight="duotone" />
							Edit
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="gap-2 text-destructive focus:text-destructive"
							onClick={() => onDelete(link.id)}
							variant="destructive"
						>
							<TrashIcon className="size-4" weight="duotone" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</button>
	);
}

export function LinkItemSkeleton() {
	return (
		<div className="flex items-center gap-4 border-b px-4 py-3 sm:px-6 sm:py-4">
			<Skeleton className="size-7 shrink-0" />
			<div className="min-w-0 flex-1 space-y-1.5">
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-5 w-24" />
				</div>
				<Skeleton className="h-3 w-48" />
			</div>
			<div className="hidden items-center gap-6 md:flex">
				<div className="w-20 space-y-1 text-right">
					<Skeleton className="ml-auto h-5 w-8" />
					<Skeleton className="ml-auto h-3 w-10" />
				</div>
				<div className="w-28 text-right">
					<Skeleton className="ml-auto h-4 w-16" />
				</div>
			</div>
			<Skeleton className="size-8 shrink-0" />
		</div>
	);
}
