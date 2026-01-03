import type {
	ProcessedMiniChartData,
	Website,
} from "@databuddy/shared/types/website";
import {
	ArrowSquareOutIcon,
	CodeIcon,
	CopyIcon,
	EyeIcon,
	GearIcon,
	MinusIcon,
	PencilSimpleIcon,
	TrashIcon,
	TrendDownIcon,
	TrendUpIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { FaviconImage } from "@/components/analytics/favicon-image";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { WebsiteDialog } from "@/components/website-dialog";
import { useDeleteWebsite } from "@/hooks/use-websites";
import { TOAST_MESSAGES } from "../[id]/_components/shared/tracking-constants";
import MiniChart from "./mini-chart";

interface WebsiteCardProps {
	website: Website;
	chartData?: ProcessedMiniChartData;
	activeUsers?: number;
	isLoadingChart?: boolean;
}

function TrendStat({
	trend,
	className = "flex items-center gap-1 font-semibold text-xs",
}: {
	trend: ProcessedMiniChartData["trend"] | undefined;
	className?: string;
}) {
	if (trend?.type === "up") {
		return (
			<div className={className}>
				<TrendUpIcon
					aria-hidden="true"
					className="size-4 text-success"
					weight="fill"
				/>
				<span className="text-success">+{trend.value.toFixed(0)}%</span>
			</div>
		);
	}
	if (trend?.type === "down") {
		return (
			<div className={className}>
				<TrendDownIcon
					aria-hidden
					className="size-4 text-destructive"
					weight="fill"
				/>
				<span className="text-destructive">-{trend.value.toFixed(0)}%</span>
			</div>
		);
	}
	return (
		<div className={className}>
			<MinusIcon aria-hidden className="size-4 text-muted-foreground" />
			<span className="text-muted-foreground">0%</span>
		</div>
	);
}

const formatNumber = (num: number) => {
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toString();
};

export const WebsiteCard = memo(
	({ website, chartData, activeUsers, isLoadingChart }: WebsiteCardProps) => {
		const router = useRouter();
		const [showEditDialog, setShowEditDialog] = useState(false);
		const [showDeleteDialog, setShowDeleteDialog] = useState(false);
		const deleteWebsiteMutation = useDeleteWebsite();

		const handleOpen = useCallback(() => {
			router.push(`/websites/${website.id}`);
		}, [router, website.id]);

		const handleOpenNewTab = useCallback(() => {
			window.open(`/websites/${website.id}`, "_blank", "noopener,noreferrer");
		}, [website.id]);

		const handleCopyLink = useCallback(async () => {
			const url = `${window.location.origin}/websites/${website.id}`;
			try {
				await navigator.clipboard.writeText(url);
				toast.success("Link copied to clipboard");
			} catch {
				toast.error("Failed to copy link");
			}
		}, [website.id]);

		const handleEdit = useCallback(() => {
			setShowEditDialog(true);
		}, []);

		const handleSettings = useCallback(() => {
			router.push(`/websites/${website.id}/settings`);
		}, [router, website.id]);

		const handleDelete = useCallback(() => {
			setShowDeleteDialog(true);
		}, []);

		const handleDeleteConfirm = useCallback(async () => {
			try {
				await toast.promise(
					deleteWebsiteMutation.mutateAsync({ id: website.id }),
					{
						loading: TOAST_MESSAGES.WEBSITE_DELETING,
						success: TOAST_MESSAGES.WEBSITE_DELETED,
						error: TOAST_MESSAGES.WEBSITE_DELETE_ERROR,
					}
				);
				setShowDeleteDialog(false);
			} catch {
				// handled by toast
			}
		}, [website.id, deleteWebsiteMutation]);

		const handleWebsiteUpdated = useCallback(() => {
			setShowEditDialog(false);
		}, []);

		return (
			<>
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<Link
							aria-label={`Open ${website.name} analytics`}
							className="group block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							data-section="website-grid"
							data-track="website-card-click"
							data-website-id={website.id}
							data-website-name={website.name}
							href={`/websites/${website.id}`}
						>
							<Card className="flex h-full select-none flex-col gap-0 overflow-hidden bg-background p-0 transition-all duration-300 ease-in-out group-hover:border-primary/60 motion-reduce:transform-none motion-reduce:transition-none">
								<CardHeader className="dotted-bg relative gap-0! border-b bg-accent px-0 pt-4 pb-0!">
									{activeUsers !== undefined && activeUsers > 0 && (
										<div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 font-medium text-success text-xs tabular-nums backdrop-blur-sm">
											<span className="relative flex size-1.5">
												<span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
												<span className="relative inline-flex size-1.5 rounded-full bg-success" />
											</span>
											{activeUsers}
										</div>
									)}
									{isLoadingChart ? (
										<div className="px-3">
											<Skeleton className="mx-auto h-24 w-full rounded sm:h-28" />
										</div>
									) : chartData ? (
										chartData.hasAnyData ? (
											<div className="h-28 space-y-2">
												<div className="h-full duration-300 [--chart-color:var(--color-primary)] motion-reduce:transition-none group-hover:[--chart-color:theme(colors.primary.600)]">
													<MiniChart
														data={chartData.data}
														days={chartData.data.length}
														id={website.id}
													/>
												</div>
											</div>
										) : (
											<div className="flex h-28 flex-col items-center justify-center gap-2 px-4 text-center">
												<div className="flex size-8 items-center justify-center rounded bg-amber-500/10">
													<CodeIcon
														className="size-4 text-amber-500"
														weight="duotone"
													/>
												</div>
												<div className="space-y-0.5">
													<p className="font-medium text-foreground text-xs">
														Tracking not set up
													</p>
													<p className="text-[11px] text-muted-foreground">
														Click to add tracking code
													</p>
												</div>
											</div>
										)
									) : (
										<div className="flex h-28 items-center justify-center text-center text-muted-foreground text-xs">
											Failed to load
										</div>
									)}
								</CardHeader>
								<CardContent className="space-y-1 px-4 py-3">
									<div className="flex items-center gap-3">
										<FaviconImage
											altText={`${website.name} favicon`}
											className="shrink-0"
											domain={website.domain}
											size={28}
										/>
										<div className="flex min-w-0 flex-1 items-center justify-between gap-2">
											<div className="min-w-0 space-y-0.5">
												<CardTitle className="truncate font-semibold text-sm leading-tight">
													{website.name}
												</CardTitle>
												<CardDescription className="truncate text-muted-foreground text-xs">
													{website.domain}
												</CardDescription>
											</div>
											<div className="flex shrink-0 flex-col items-end space-y-0.5">
												<span className="flex items-center gap-1 font-semibold text-foreground text-xs tabular-nums">
													<EyeIcon
														className="size-4 shrink-0 text-muted-foreground"
														weight="duotone"
													/>
													{chartData ? formatNumber(chartData.totalViews) : "0"}
												</span>
												<TrendStat
													className="flex items-center gap-1 font-semibold text-xs"
													trend={chartData?.trend}
												/>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						</Link>
					</ContextMenuTrigger>
					<ContextMenuContent className="min-w-48 rounded border-border/50 bg-popover/95 p-0 shadow-lg backdrop-blur-sm">
						<ContextMenuItem
							className="w-full rounded-none px-3 py-2"
							onSelect={handleOpen}
						>
							<EyeIcon className="size-4" weight="duotone" />
							Open
						</ContextMenuItem>
						<ContextMenuItem
							className="w-full rounded-none px-3 py-2"
							onSelect={handleOpenNewTab}
						>
							<ArrowSquareOutIcon className="size-4" weight="duotone" />
							Open in new tab
						</ContextMenuItem>
						<ContextMenuItem
							className="w-full rounded-none px-3 py-2"
							onSelect={handleCopyLink}
						>
							<CopyIcon className="size-4" weight="duotone" />
							Copy link
						</ContextMenuItem>
						<ContextMenuSeparator className="my-0" />
						<ContextMenuItem
							className="w-full rounded-none px-3 py-2"
							onSelect={handleEdit}
						>
							<PencilSimpleIcon className="size-4" weight="duotone" />
							Edit
						</ContextMenuItem>
						<ContextMenuItem
							className="w-full rounded-none px-3 py-2"
							onSelect={handleSettings}
						>
							<GearIcon className="size-4" weight="duotone" />
							Settings
						</ContextMenuItem>
						<ContextMenuSeparator className="my-0" />
						<ContextMenuItem
							className="w-full rounded-none px-3 py-2"
							onSelect={handleDelete}
							variant="destructive"
						>
							<TrashIcon className="size-4" weight="duotone" />
							Delete
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>

				<WebsiteDialog
					onOpenChange={setShowEditDialog}
					onSave={handleWebsiteUpdated}
					open={showEditDialog}
					website={website}
				/>
				<DeleteDialog
					confirmLabel="Delete Website"
					description={`Are you sure you want to delete "${website.name ?? website.domain}"? This action cannot be undone and will permanently remove all analytics data.`}
					isDeleting={deleteWebsiteMutation.isPending}
					isOpen={showDeleteDialog}
					itemName={website.name ?? undefined}
					onClose={() => setShowDeleteDialog(false)}
					onConfirm={handleDeleteConfirm}
					title="Delete Website"
				/>
			</>
		);
	}
);

WebsiteCard.displayName = "WebsiteCard";

export function WebsiteCardSkeleton() {
	return (
		<Card className="h-full overflow-hidden pt-0">
			<CardHeader className="dotted-bg gap-0! border-b bg-accent px-0 pt-4 pb-0!">
				<Skeleton className="h-28 w-full" />
			</CardHeader>
			<CardContent className="space-y-1 px-4 py-3">
				<div className="flex items-center gap-3">
					<Skeleton className="size-7 shrink-0 rounded" />
					<div className="flex min-w-0 flex-1 items-center justify-between gap-2">
						<div className="min-w-0 space-y-0.5">
							<Skeleton className="h-4 w-24 rounded" />
							<Skeleton className="h-3.5 w-32 rounded" />
						</div>
						<div className="flex shrink-0 flex-col items-end space-y-0.5">
							<Skeleton className="h-4 w-10 rounded" />
							<Skeleton className="h-4 w-12 rounded" />
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
