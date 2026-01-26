"use client";

import {
	AndroidLogoIcon,
	AppleLogoIcon,
	ClockCountdownIcon,
	CopyIcon,
	DotsThreeIcon,
	ImageIcon,
	LinkIcon,
	PencilSimpleIcon,
	QrCodeIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useCallback } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Link } from "@/hooks/use-links";
import { fromNow, localDayjs } from "@/lib/time";
import { cn } from "@/lib/utils";

const LINKS_BASE_URL = "https://dby.sh";

function ShortUrlCopy({
	slug,
	onClick,
}: {
	slug: string;
	onClick: (e: React.MouseEvent) => void;
}) {
	const shortUrl = `${LINKS_BASE_URL.replace("https://", "")}/${slug}`;

	return (
		<button
			className="flex shrink-0 items-center gap-1.5 rounded border border-transparent bg-muted px-2 py-1 font-mono text-xs transition-colors hover:border-border hover:bg-background group-hover:border-border group-hover:bg-background"
			onClick={onClick}
			type="button"
		>
			<span className="text-foreground">{shortUrl}</span>
			<CopyIcon className="size-3 text-muted-foreground" weight="duotone" />
		</button>
	);
}

function LinkFeatures({ link }: { link: Link }) {
	const hasOg = Boolean(link.ogTitle ?? link.ogDescription ?? link.ogImageUrl);
	const hasIos = Boolean(link.iosUrl);
	const hasAndroid = Boolean(link.androidUrl);
	const hasAnyFeature = hasOg || hasIos || hasAndroid;

	if (!hasAnyFeature) {
		return null;
	}

	return (
		<div className="flex items-center gap-1 text-muted-foreground">
			{hasOg && <ImageIcon className="size-3.5" weight="duotone" />}
			{hasIos && <AppleLogoIcon className="size-3.5" weight="duotone" />}
			{hasAndroid && <AndroidLogoIcon className="size-3.5" weight="duotone" />}
		</div>
	);
}

function ExpirationBadge({ link }: { link: Link }) {
	if (!link.expiresAt) {
		return null;
	}

	const expiresAt = localDayjs(link.expiresAt);
	const isExpired = expiresAt.isBefore(localDayjs());
	const isExpiringSoon =
		!isExpired && expiresAt.isBefore(localDayjs().add(7, "day"));

	return (
		<Badge
			className="gap-1"
			variant={
				isExpired ? "destructive" : isExpiringSoon ? "amber" : "secondary"
			}
		>
			<ClockCountdownIcon className="size-3" weight="duotone" />
			{isExpired ? "Expired" : expiresAt.fromNow(true)}
		</Badge>
	);
}

function LinkActions({
	link,
	onEdit,
	onDelete,
	onShowQr,
	onCopy,
}: {
	link: Link;
	onEdit: (link: Link) => void;
	onDelete: (linkId: string) => void;
	onShowQr: (link: Link) => void;
	onCopy: () => void;
}) {
	return (
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
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuItem className="gap-2" onClick={onCopy}>
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
					Edit Link
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="gap-2 text-destructive focus:text-destructive"
					onClick={() => onDelete(link.id)}
					variant="destructive"
				>
					<TrashIcon className="size-4" weight="duotone" />
					Delete Link
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function formatTargetUrl(targetUrl: string): string {
	try {
		const parsed = new URL(targetUrl);
		let display =
			parsed.host + (parsed.pathname !== "/" ? parsed.pathname : "");
		if (display.length > 50) {
			display = `${display.slice(0, 47)}...`;
		}
		return display;
	} catch {
		return targetUrl.length > 50 ? `${targetUrl.slice(0, 47)}...` : targetUrl;
	}
}

interface LinkRowProps {
	link: Link;
	onClick: (link: Link) => void;
	onEdit: (link: Link) => void;
	onDelete: (linkId: string) => void;
	onShowQr: (link: Link) => void;
}

function LinkRow({ link, onClick, onEdit, onDelete, onShowQr }: LinkRowProps) {
	const displayTargetUrl = formatTargetUrl(link.targetUrl);
	const isExpired =
		link.expiresAt && localDayjs(link.expiresAt).isBefore(localDayjs());

	const handleCopy = useCallback(
		async (e?: React.MouseEvent) => {
			e?.stopPropagation();
			try {
				await navigator.clipboard.writeText(`${LINKS_BASE_URL}/${link.slug}`);
				toast.success("Link copied to clipboard");
			} catch {
				toast.error("Failed to copy link");
			}
		},
		[link.slug]
	);

	return (
		<button
			className={cn(
				"group flex w-full cursor-pointer items-center gap-4 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50",
				isExpired && "opacity-60"
			)}
			onClick={() => onClick(link)}
			type="button"
		>
			{/* Link icon */}
			<div className="shrink-0 rounded border border-transparent bg-accent p-1.5 text-primary transition-colors group-hover:border-primary/20 group-hover:bg-primary/10">
				<LinkIcon className="size-4" weight="duotone" />
			</div>

			{/* Name and short URL */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium text-foreground text-sm">
						{link.name}
					</p>
					<LinkFeatures link={link} />
				</div>
				<div className="mt-1 flex items-center gap-2">
					<ShortUrlCopy onClick={handleCopy} slug={link.slug} />
					<span className="truncate text-muted-foreground text-xs">
						→ {displayTargetUrl}
					</span>
				</div>
			</div>

			{/* Expiration - desktop only */}
			<div className="hidden w-24 shrink-0 sm:block">
				<ExpirationBadge link={link} />
			</div>

			{/* Created date - desktop only */}
			<div className="hidden w-24 shrink-0 text-right sm:block">
				<span className="text-muted-foreground text-sm">
					{fromNow(link.createdAt)}
				</span>
			</div>

			{/* Actions */}
			<div
				className="shrink-0"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				<LinkActions
					link={link}
					onCopy={handleCopy}
					onDelete={onDelete}
					onEdit={onEdit}
					onShowQr={onShowQr}
				/>
			</div>
		</button>
	);
}

interface LinksListProps {
	links: Link[];
	onClick: (link: Link) => void;
	onEdit: (link: Link) => void;
	onDelete: (linkId: string) => void;
	onShowQr: (link: Link) => void;
}

export function LinksList({
	links,
	onClick,
	onEdit,
	onDelete,
	onShowQr,
}: LinksListProps) {
	return (
		<div className="w-full">
			{links.map((link) => (
				<LinkRow
					key={link.id}
					link={link}
					onClick={onClick}
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
					className="flex items-center gap-4 border-b px-4 py-3"
					key={`skeleton-${i + 1}`}
				>
					<Skeleton className="size-7 shrink-0 rounded" />
					<div className="min-w-0 flex-1 space-y-2">
						<Skeleton className="h-4 w-32" />
						<div className="flex items-center gap-2">
							<Skeleton className="h-6 w-28" />
							<Skeleton className="h-3 w-40" />
						</div>
					</div>
					<Skeleton className="hidden h-5 w-16 sm:block" />
					<Skeleton className="hidden h-4 w-20 sm:block" />
					<Skeleton className="size-8 shrink-0 rounded" />
				</div>
			))}
		</div>
	);
}

// Legacy exports for backward compatibility
export { LinkRow as LinkItem };
export function LinkItemSkeleton() {
	return (
		<div className="flex items-center gap-4 border-b px-4 py-3">
			<Skeleton className="size-7 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-2">
				<Skeleton className="h-4 w-32" />
				<div className="flex items-center gap-2">
					<Skeleton className="h-6 w-28" />
					<Skeleton className="h-3 w-40" />
				</div>
			</div>
			<Skeleton className="hidden h-5 w-16 sm:block" />
			<Skeleton className="hidden h-4 w-20 sm:block" />
			<Skeleton className="size-8 shrink-0 rounded" />
		</div>
	);
}
