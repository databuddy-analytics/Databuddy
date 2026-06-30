"use client";

import { FaviconImage } from "@/components/analytics/favicon-image";
import type { Link } from "@/hooks/use-links";
import { cn } from "@/lib/utils";
import { getDeepLinkApp } from "@databuddy/shared/constants/deep-link-apps";
import NextLink from "next/link";
import { toast } from "sonner";
import { DeepLinkAppIcon } from "./deep-link-icons";
import { LINKS_BASE_URL, LINKS_FULL_URL } from "./link-constants";
import {
	ClockCountdownIcon,
	CopyIcon,
	DotsThreeIcon,
	LinkIcon,
	PencilSimpleIcon,
	QrCodeIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";
import {
	EmptyState,
	Skeleton,
	Tooltip,
	fromNow,
	localDayjs,
} from "@databuddy/ui";

function copyShortUrl(slug: string) {
	navigator.clipboard
		.writeText(`${LINKS_FULL_URL}/${slug}`)
		.then(() => toast.success("Copied to clipboard"))
		.catch(() => toast.error("Failed to copy"));
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
		<Tooltip
			content={
				isExpired
					? `Expired ${localDayjs(link.expiresAt).format("MMM D, YYYY")}`
					: `Expires ${localDayjs(link.expiresAt).format("MMM D, YYYY")}`
			}
			delay={200}
			side="top"
		>
			<span
				className={cn(
					"flex items-center gap-1 rounded px-1.5 py-0.5 text-xs",
					isExpired
						? "bg-destructive/10 text-destructive"
						: "bg-amber-500/10 text-amber-600 dark:text-amber-400"
				)}
			>
				<ClockCountdownIcon className="size-3" weight="duotone" />
				{isExpired ? "Expired" : localDayjs(link.expiresAt).fromNow(true)}
			</span>
		</Tooltip>
	);
}

function LinkRowIcon({ link }: { link: Link }) {
	return (
		<div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-secondary">
			{link.deepLinkApp ? (
				<DeepLinkAppIcon appId={link.deepLinkApp} size={20} />
			) : (
				<FaviconImage
					altText={`${link.name} favicon`}
					domain={link.targetUrl}
					size={20}
				/>
			)}
		</div>
	);
}

export function LinkRow({
	link,
	folderName,
	onEdit,
	onDelete,
	onShowQr,
}: {
	folderName?: string;
	link: Link;
	onEdit: (link: Link) => void;
	onDelete: (linkId: string) => void;
	onShowQr: (link: Link) => void;
}) {
	const isExpired =
		link.expiresAt && localDayjs(link.expiresAt).isBefore(localDayjs());

	return (
		<div
			className={cn(
				"group flex items-center hover:bg-interactive-hover",
				isExpired && "opacity-50"
			)}
		>
			<NextLink
				className="flex flex-1 items-center gap-4 px-5 py-3"
				href={`/links/${link.id}`}
			>
				<LinkRowIcon link={link} />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="truncate font-medium text-foreground text-sm">
							{link.name}
						</span>
						{link.deepLinkApp && (
							<span className="flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary text-xs">
								{getDeepLinkApp(link.deepLinkApp)?.name ?? "Deep Link"}
							</span>
						)}
						<ExpiryBadge link={link} />
					</div>
					<div className="mt-0.5 flex items-center gap-1.5">
						<span className="truncate text-muted-foreground text-xs">
							{LINKS_BASE_URL}/{link.slug}
						</span>
						<span className="text-muted-foreground text-xs">&middot;</span>
						<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
							{fromNow(link.createdAt)}
						</span>
						{folderName && (
							<>
								<span className="text-muted-foreground text-xs">&middot;</span>
								<span className="truncate text-muted-foreground text-xs">
									{folderName}
								</span>
							</>
						)}
					</div>
				</div>
			</NextLink>

			<div className="flex shrink-0 items-center pr-4">
				<DropdownMenu>
					<DropdownMenu.Trigger
						aria-label={`Actions for ${link.name}`}
						className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-interactive-hover hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
					>
						<DotsThreeIcon className="size-4" weight="bold" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" className="w-40">
						<DropdownMenu.Item
							className="gap-2"
							onClick={() => copyShortUrl(link.slug)}
						>
							<CopyIcon className="size-4" weight="duotone" />
							Copy URL
						</DropdownMenu.Item>
						<DropdownMenu.Item className="gap-2" onClick={() => onShowQr(link)}>
							<QrCodeIcon className="size-4" weight="duotone" />
							QR Code
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item className="gap-2" onClick={() => onEdit(link)}>
							<PencilSimpleIcon className="size-4" weight="duotone" />
							Edit
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item
							className="gap-2"
							onClick={() => onDelete(link.id)}
							variant="destructive"
						>
							<TrashIcon className="size-4" weight="duotone" />
							Delete
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu>
			</div>
		</div>
	);
}

interface LinksListProps {
	foldersById?: Map<string, string>;
	links: Link[];
	onCreateLink: () => void;
	onDelete: (linkId: string) => void;
	onEdit: (link: Link) => void;
	onShowQr: (link: Link) => void;
	showEmptyState?: boolean;
}

export function LinksList({
	links,
	foldersById,
	onEdit,
	onDelete,
	onShowQr,
	onCreateLink,
	showEmptyState = true,
}: LinksListProps) {
	if (links.length === 0) {
		if (!showEmptyState) {
			return null;
		}
		return (
			<div className="px-5 py-12">
				<EmptyState
					action={{
						label: "Create Your First Link",
						onClick: onCreateLink,
					}}
					description="Create short links to track clicks and measure engagement across your marketing campaigns."
					icon={<LinkIcon weight="regular" />}
					title="No links yet"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div className="divide-y">
			{links.map((link) => (
				<LinkRow
					folderName={
						link.folderId ? foldersById?.get(link.folderId) : undefined
					}
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
		<div className="divide-y">
			{Array.from({ length: 3 }).map((_, i) => (
				<div
					className="flex items-center gap-4 px-5 py-3"
					key={`skel-${i + 1}`}
				>
					<Skeleton className="size-10 shrink-0 rounded-lg" />
					<div className="min-w-0 flex-1 space-y-2">
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-3 w-48" />
					</div>
				</div>
			))}
		</div>
	);
}

export function LinksSearchBarSkeleton() {
	return (
		<div className="flex items-center gap-1.5 border-b px-4 py-2">
			<Skeleton className="h-7 flex-1 rounded" />
			<Skeleton className="h-7 w-16 shrink-0 rounded sm:w-20" />
		</div>
	);
}

export { LinkRow as LinkItem };
