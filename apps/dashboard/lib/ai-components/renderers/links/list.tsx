"use client";

import {
	ClockCountdownIcon,
	CopyIcon,
	DotsThreeIcon,
	LinkIcon,
	PencilSimpleIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { LinkSheet } from "@/app/(main)/links/_components/link-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Link, useDeleteLink } from "@/hooks/use-links";
import { fromNow, localDayjs } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../../types";

const BASE_URL = "dby.sh";

interface LinkItem {
	id: string;
	name: string;
	slug: string;
	targetUrl: string;
	expiresAt?: string | null;
	createdAt?: string;
	ogTitle?: string | null;
	ogDescription?: string | null;
	ogImageUrl?: string | null;
	iosUrl?: string | null;
	androidUrl?: string | null;
	expiredRedirectUrl?: string | null;
	ogVideoUrl?: string | null;
	organizationId?: string;
}

export interface LinksListProps extends BaseComponentProps {
	title?: string;
	links: LinkItem[];
}

function formatUrl(url: string, maxLen = 40): string {
	try {
		const { host, pathname } = new URL(url);
		const display = host + (pathname !== "/" ? pathname : "");
		return display.length > maxLen
			? `${display.slice(0, maxLen - 3)}...`
			: display;
	} catch {
		return url.length > maxLen ? `${url.slice(0, maxLen - 3)}...` : url;
	}
}

function ExpirationBadge({ date }: { date: string | null }) {
	if (!date) {
		return null;
	}

	const expires = localDayjs(date);
	const isExpired = expires.isBefore(localDayjs());
	const isSoon = !isExpired && expires.isBefore(localDayjs().add(7, "day"));

	return (
		<Badge
			className="gap-1 text-[10px]"
			variant={isExpired ? "destructive" : isSoon ? "amber" : "secondary"}
		>
			<ClockCountdownIcon className="size-3" weight="duotone" />
			{isExpired ? "Expired" : expires.fromNow(true)}
		</Badge>
	);
}

function LinkRow({
	link,
	onNavigate,
	onEdit,
	onDelete,
}: {
	link: LinkItem;
	onNavigate: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const isExpired =
		link.expiresAt && localDayjs(link.expiresAt).isBefore(localDayjs());
	const shortUrl = `${BASE_URL}/${link.slug}`;

	const handleCopy = useCallback(
		async (e?: React.MouseEvent) => {
			e?.stopPropagation();
			try {
				await navigator.clipboard.writeText(`https://${shortUrl}`);
				toast.success("Link copied");
			} catch {
				toast.error("Failed to copy");
			}
		},
		[shortUrl]
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: Can't use button - contains nested buttons (dropdown trigger, copy button)
		<div
			className={cn(
				"group flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50",
				isExpired && "opacity-60"
			)}
			onClick={onNavigate}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onNavigate();
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="shrink-0 rounded border border-transparent bg-accent p-1.5 text-primary transition-colors group-hover:border-primary/20 group-hover:bg-primary/10">
				<LinkIcon className="size-3.5" weight="duotone" />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium text-sm">{link.name}</p>
					<ExpirationBadge date={link.expiresAt ?? null} />
				</div>
				<div className="mt-0.5 flex items-center gap-2">
					<button
						className="flex shrink-0 items-center gap-1 rounded border border-transparent bg-muted px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:border-border hover:bg-background"
						onClick={handleCopy}
						type="button"
					>
						<span>{shortUrl}</span>
						<CopyIcon
							className="size-2.5 text-muted-foreground"
							weight="duotone"
						/>
					</button>
					<span className="truncate text-muted-foreground text-xs">
						→ {formatUrl(link.targetUrl)}
					</span>
				</div>
			</div>

			{link.createdAt && (
				<span className="hidden shrink-0 text-muted-foreground text-xs sm:block">
					{fromNow(link.createdAt)}
				</span>
			)}

			<div
				className="shrink-0"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="presentation"
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label="Actions"
							className="size-7 opacity-50 hover:opacity-100 data-[state=open]:opacity-100"
							size="icon"
							variant="ghost"
						>
							<DotsThreeIcon className="size-4" weight="bold" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-40">
						<DropdownMenuItem className="gap-2" onClick={handleCopy}>
							<CopyIcon className="size-4" weight="duotone" />
							Copy
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem className="gap-2" onClick={onEdit}>
							<PencilSimpleIcon className="size-4" weight="duotone" />
							Edit
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="gap-2"
							onClick={onDelete}
							variant="destructive"
						>
							<TrashIcon className="size-4" weight="duotone" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

export function LinksListRenderer({ title, links, className }: LinksListProps) {
	const router = useRouter();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const deleteMutation = useDeleteLink();

	const openCreate = useCallback(() => {
		setEditingLink(null);
		setSheetOpen(true);
	}, []);

	const openEdit = useCallback((link: LinkItem) => {
		setEditingLink(link);
		setSheetOpen(true);
	}, []);

	const closeSheet = useCallback(() => {
		setSheetOpen(false);
		setEditingLink(null);
	}, []);

	const confirmDelete = useCallback(async () => {
		if (!deletingId) {
			return;
		}
		try {
			await deleteMutation.mutateAsync({ id: deletingId });
			toast.success("Link deleted");
			setDeletingId(null);
		} catch {
			toast.error("Failed to delete");
		}
	}, [deletingId, deleteMutation]);

	if (links.length === 0) {
		return (
			<Card
				className={className ?? "gap-0 overflow-hidden border bg-card py-0"}
			>
				<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
					<LinkIcon
						className="size-8 text-muted-foreground/40"
						weight="duotone"
					/>
					<p className="font-medium text-sm">No links found</p>
					<p className="text-muted-foreground text-xs">
						Create your first short link
					</p>
					<Button
						className="mt-2"
						onClick={openCreate}
						size="sm"
						variant="secondary"
					>
						<PlusIcon className="size-4" />
						Create Link
					</Button>
				</div>
				<LinkSheet
					link={editingLink as Link | null}
					onOpenChange={closeSheet}
					open={sheetOpen}
				/>
			</Card>
		);
	}

	return (
		<>
			<Card
				className={className ?? "gap-0 overflow-hidden border bg-card py-0"}
			>
				{title && (
					<div className="flex items-center justify-between border-b px-3 py-2">
						<p className="font-medium text-sm">{title}</p>
						<Button onClick={openCreate} size="sm" variant="ghost">
							<PlusIcon className="size-3.5" />
							New
						</Button>
					</div>
				)}
				<div>
					{links.map((link) => (
						<LinkRow
							key={link.id}
							link={link}
							onDelete={() => setDeletingId(link.id)}
							onEdit={() => openEdit(link)}
							onNavigate={() => router.push(`/links/${link.id}`)}
						/>
					))}
				</div>
				<div className="border-t bg-muted/30 px-3 py-1.5">
					<p className="text-muted-foreground text-xs">
						{links.length} {links.length === 1 ? "link" : "links"}
					</p>
				</div>
			</Card>

			<LinkSheet
				link={editingLink as Link | null}
				onOpenChange={closeSheet}
				open={sheetOpen}
			/>

			<DeleteDialog
				confirmLabel="Delete Link"
				description="This action cannot be undone and will permanently remove all click data."
				isDeleting={deleteMutation.isPending}
				isOpen={!!deletingId}
				onClose={() => setDeletingId(null)}
				onConfirm={confirmDelete}
				title="Delete Link"
			/>
		</>
	);
}
