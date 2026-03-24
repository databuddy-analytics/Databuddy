"use client";

import {
	ClockCountdownIcon,
	CopyIcon,
	DotsThreeIcon,
	PencilSimpleIcon,
	QrCodeIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import NextLink from "next/link";
import { toast } from "sonner";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Link } from "@/hooks/use-links";
import { fromNow, localDayjs } from "@/lib/time";
import { cn } from "@/lib/utils";
import { LINKS_BASE_URL, LINKS_FULL_URL } from "./link-constants";
import { formatTarget } from "./link-utils";

function copyShortUrl(slug: string) {
	navigator.clipboard
		.writeText(`${LINKS_FULL_URL}/${slug}`)
		.then(() => toast.success("Copied to clipboard"))
		.catch(() => toast.error("Failed to copy"));
}

function LinkActions({
	link,
	onEdit,
	onDelete,
	onShowQr,
}: {
	link: Link;
	onEdit: (link: Link) => void;
	onDelete: (linkId: string) => void;
	onShowQr: (link: Link) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					aria-label="Link actions"
					className="size-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
					size="icon"
					variant="ghost"
				>
					<DotsThreeIcon className="size-4" weight="bold" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				<DropdownMenuItem
					className="gap-2"
					onClick={() => copyShortUrl(link.slug)}
				>
					<CopyIcon className="size-4" weight="duotone" />
					Copy URL
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
	);
}

function ExpiryBadge({ link }: { link: Link }) {
	if (!link.expiresAt) {
		return null;
	}

	const isExpired = localDayjs(link.expiresAt).isBefore(localDayjs());
	const isExpiringSoon =
		!isExpired &&
		localDayjs(link.expiresAt).isBefore(localDayjs().add(7, "day"));

	if (!(isExpired || isExpiringSoon)) {
		return null;
	}

	return (
		<Tooltip delayDuration={200}>
			<TooltipTrigger asChild>
				<span
					className={cn(
						"flex items-center gap-1 rounded px-1.5 py-0.5 text-xs",
						isExpired
							? "bg-destructive/10 text-destructive"
							: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
					)}
				>
					<ClockCountdownIcon className="size-3" weight="duotone" />
					{isExpired
						? "Expired"
						: localDayjs(link.expiresAt).fromNow(true)}
				</span>
			</TooltipTrigger>
			<TooltipContent side="top">
				{isExpired
					? `Expired ${localDayjs(link.expiresAt).format("MMM D, YYYY")}`
					: `Expires ${localDayjs(link.expiresAt).format("MMM D, YYYY")}`}
			</TooltipContent>
		</Tooltip>
	);
}

function LinkRow({
	link,
	onEdit,
	onDelete,
	onShowQr,
}: {
	link: Link;
	onEdit: (link: Link) => void;
	onDelete: (linkId: string) => void;
	onShowQr: (link: Link) => void;
}) {
	const isExpired =
		link.expiresAt && localDayjs(link.expiresAt).isBefore(localDayjs());

	return (
		<NextLink
			className={cn(
				"group flex w-full items-center gap-3 border-b px-3 py-3 transition-colors hover:bg-accent/50 sm:gap-4 sm:px-4",
				isExpired && "opacity-50",
			)}
			href={`/links/${link.id}`}
		>
			<div className="flex size-9 shrink-0 items-center justify-center rounded border bg-card">
				<FaviconImage
					altText={`${link.name} favicon`}
					domain={link.targetUrl}
					size={18}
				/>
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-sm">{link.name}</span>
					<ExpiryBadge link={link} />
				</div>

				<div className="mt-0.5 flex items-center gap-1.5 text-xs">
					<span
						className="truncate font-mono text-foreground/70"
						title={`${LINKS_FULL_URL}/${link.slug}`}
					>
						{LINKS_BASE_URL}/{link.slug}
					</span>
					<button
						aria-label="Copy short URL"
						className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							copyShortUrl(link.slug);
						}}
						type="button"
					>
						<CopyIcon className="size-3" weight="bold" />
					</button>
					<span className="text-muted-foreground/30">→</span>
					<span className="hidden truncate text-muted-foreground sm:inline">
						{formatTarget(link.targetUrl)}
					</span>
				</div>
			</div>

			<span className="hidden shrink-0 text-muted-foreground text-xs tabular-nums sm:block">
				{fromNow(link.createdAt)}
			</span>

			<div
				className="shrink-0"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
				}}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				<LinkActions
					link={link}
					onDelete={onDelete}
					onEdit={onEdit}
					onShowQr={onShowQr}
				/>
			</div>
		</NextLink>
	);
}

interface LinksListProps {
	links: Link[];
	onEdit: (link: Link) => void;
	onDelete: (linkId: string) => void;
	onShowQr: (link: Link) => void;
	onCreateLink: () => void;
}

export function LinksList({
	links,
	onEdit,
	onDelete,
	onShowQr,
	onCreateLink,
}: LinksListProps) {
	if (links.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center py-16">
				<EmptyState
					action={{
						label: "Create Your First Link",
						onClick: onCreateLink,
					}}
					description="Create short links to track clicks and measure engagement across your marketing campaigns."
					icon={<LinkIcon weight="duotone" />}
					title="No links yet"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div className="w-full">
			{links.map((link) => (
				<LinkRow
					key={link.id}
					link={link}
					onDelete={onDelete}
					onEdit={onEdit}
					onShowQr={onShowQr}
				/>
			))}
		</div>
	);
}

export function LinksListSkeleton() {
	return (
		<div className="w-full">
			{Array.from({ length: 5 }).map((_, i) => (
				<div
					className="flex items-center gap-3 border-b px-3 py-3 sm:gap-4 sm:px-4"
					key={`skeleton-${i + 1}`}
				>
					<Skeleton className="size-9 shrink-0 rounded" />
					<div className="min-w-0 flex-1 space-y-1.5">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-44" />
					</div>
					<Skeleton className="hidden h-3 w-14 shrink-0 sm:block" />
					<Skeleton className="size-7 shrink-0 rounded" />
				</div>
			))}
		</div>
	);
}

export { LinkRow as LinkItem };
export function LinkItemSkeleton() {
	return (
		<div className="flex items-center gap-3 border-b px-3 py-3 sm:gap-4 sm:px-4">
			<Skeleton className="size-9 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-1.5">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-44" />
			</div>
			<Skeleton className="hidden h-3 w-14 shrink-0 sm:block" />
			<Skeleton className="size-7 shrink-0 rounded" />
		</div>
	);
}
