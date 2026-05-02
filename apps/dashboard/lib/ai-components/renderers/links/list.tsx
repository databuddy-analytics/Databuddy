"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { LinkSheet } from "@/app/(main)/links/_components/link-sheet";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { type Link, useDeleteLink } from "@/hooks/use-links";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../../types";
import {
	ArrowRightIcon,
	CheckIcon,
	ClockCountdownIcon,
	CopyIcon,
	DotsThreeIcon,
	LinkIcon,
	PencilSimpleIcon,
	PlusIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { DeleteDialog, DropdownMenu } from "@databuddy/ui/client";
import { Badge, Button, Card, fromNow, localDayjs } from "@databuddy/ui";

const BASE_URL = "dby.sh";

interface LinkItem {
	androidUrl?: string | null;
	createdAt?: string;
	expiredRedirectUrl?: string | null;
	expiresAt?: string | null;
	id: string;
	iosUrl?: string | null;
	name: string;
	ogDescription?: string | null;
	ogImageUrl?: string | null;
	ogTitle?: string | null;
	ogVideoUrl?: string | null;
	organizationId?: string;
	slug: string;
	targetUrl: string;
}

export interface LinksListProps extends BaseComponentProps {
	links: LinkItem[];
	title?: string;
}

function formatUrl(url: string, maxLen = 40): string {
	try {
		const { host, pathname } = new URL(url);
		const display = host + (pathname === "/" ? "" : pathname);
		return display.length > maxLen
			? `${display.slice(0, maxLen - 3)}...`
			: display;
	} catch {
		return url.length > maxLen ? `${url.slice(0, maxLen - 3)}...` : url;
	}
}

function ExpirationBadge({ date, className }: { date: string | null; className?: string }) {
	if (!date) {
		return null;
	}

	const expires = localDayjs(date);
	const isExpired = expires.isBefore(localDayjs());
	const isSoon = !isExpired && expires.isBefore(localDayjs().add(7, "day"));

	return (
		<Badge
			className={cn("gap-1 text-[10px]", className)}
			variant={isExpired ? "destructive" : isSoon ? "warning" : "muted"}
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

	const { copyToClipboard, isCopied } = useCopyToClipboard({
		onCopy: () => toast.success("Link copied"),
	});

	const handleCopy = useCallback(
		(e?: React.MouseEvent) => {
			e?.stopPropagation();
			copyToClipboard(`https://${shortUrl}`);
		},
		[copyToClipboard, shortUrl]
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: Can't use button - contains nested buttons (dropdown trigger, copy button)
		<div
			className={cn(
				"group/link-row flex w-full cursor-pointer gap-3 rounded-sm bg-muted/30 px-2 py-2.5 text-left transition-colors hover:bg-muted",
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
			<div className="h-max shrink-0 rounded border border-transparent bg-accent p-1.5 text-primary transition-colors group-hover/link-row:bg-primary/10">
				<LinkIcon className="size-3.5" weight="duotone" />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium text-sm">{link.name}</p>
					<ExpirationBadge date={link.expiresAt ?? null} className="rounded py-px px-1.5" />
				</div>
				<div className="mt-1 flex items-center gap-2">
					<button
						className="flex shrink-0 items-center gap-1.5 rounded border border-transparent bg-muted px-1.5 py-px font-mono text-[10px] transition-colors hover:border-border group-hover/link-row:bg-primary/10"
						onClick={handleCopy}
						type="button"
					>
						<span>{shortUrl}</span>
						{isCopied ? (
							<CheckIcon aria-hidden className="size-2.5 shrink-0" />
						) : (
							<CopyIcon
								className="size-2.5 shrink-0 text-muted-foreground"
								weight="duotone"
							/>
						)}
					</button>
					<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
						<ArrowRightIcon aria-hidden className="size-3 shrink-0" />
						<span className="truncate text-ring">
							{formatUrl(link.targetUrl)}
						</span>
					</span>
				</div>
			</div>

			{link.createdAt && (
				<span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
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
					<DropdownMenu.Trigger
						aria-label="Actions"
						className="inline-flex size-7 items-center justify-center gap-1.5 rounded-md bg-secondary p-0 font-medium text-muted-foreground opacity-70 transition-all duration-(--duration-quick) ease-(--ease-smooth) hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 group-hover/link-row:bg-interactive-hover group-hover/link-row:text-foreground data-[state=open]:opacity-100"
					>
						<DotsThreeIcon className="size-4" weight="bold" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" className="w-40">
						<DropdownMenu.Item className="gap-2" onClick={handleCopy}>
							<CopyIcon className="size-4" weight="duotone" />
							Copy
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item className="gap-2" onClick={onEdit}>
							<PencilSimpleIcon className="size-4" weight="duotone" />
							Edit
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item
							className="gap-2"
							onClick={onDelete}
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
				className={cn(
					"gap-0 overflow-hidden border-0 bg-secondary p-1",
					className
				)}
			>
				<div className="rounded-md bg-background px-3 py-8">
					<div className="flex flex-col items-center justify-center gap-2 text-center">
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
				className={cn(
					"gap-0 overflow-hidden border-0 bg-secondary p-1",
					className
				)}
			>
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2.5 rounded-md bg-background px-2 py-2">
						<div className="flex size-6 items-center justify-center rounded bg-accent">
							<LinkIcon
								className="size-3.5 text-muted-foreground"
								weight="duotone"
							/>
						</div>
						<p className="font-medium text-sm">{title ?? "Links"}</p>
						<div className="ml-auto flex items-center gap-2">
							<Button onClick={openCreate} size="sm" variant="primary">
								<PlusIcon className="size-3.5" />
								New
							</Button>
						</div>
					</div>

					<div className="rounded-md bg-background px-1 py-1">
						<div className="space-y-1">
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
					</div>
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
