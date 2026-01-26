"use client";

import {
	CaretRightIcon,
	DotsThreeIcon,
	FunnelIcon,
	PencilSimpleIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { EditFunnelDialog } from "@/app/(main)/websites/[id]/funnels/_components/edit-funnel-dialog";
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
import {
	type CreateFunnelData,
	type Funnel,
	useFunnels,
} from "@/hooks/use-funnels";
import { fromNow } from "@/lib/time";
import type { BaseComponentProps, FunnelStepInput } from "../../types";

interface FunnelItem {
	id: string;
	name: string;
	description?: string | null;
	steps: FunnelStepInput[];
	isActive: boolean;
	createdAt?: string;
}

export interface FunnelsListProps extends BaseComponentProps {
	title?: string;
	funnels: FunnelItem[];
}

function FunnelRow({
	funnel,
	onNavigate,
	onEdit,
	onDelete,
}: {
	funnel: FunnelItem;
	onNavigate: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: Can't use button - contains nested buttons (dropdown trigger)
		<div
			className="group flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50"
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
			<div className="shrink-0 rounded border border-transparent bg-accent p-1.5 text-muted-foreground transition-colors group-hover:border-primary/20 group-hover:bg-primary/10 group-hover:text-primary">
				<FunnelIcon className="size-3.5" weight="duotone" />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium text-sm">{funnel.name}</p>
					<Badge className="text-[10px]" variant="secondary">
						{funnel.steps.length} steps
					</Badge>
				</div>
				{funnel.description && (
					<p className="mt-0.5 truncate text-muted-foreground text-xs">
						{funnel.description}
					</p>
				)}
			</div>

			<div className="hidden shrink-0 items-center gap-3 sm:flex">
				<div className="flex h-5 items-center gap-0.5">
					{funnel.steps.slice(0, 4).map((_, idx) => (
						<div
							className="h-full rounded-sm bg-primary/60"
							key={idx}
							style={{
								width: `${Math.max(4, 20 - idx * 4)}px`,
								opacity: 1 - idx * 0.2,
							}}
						/>
					))}
					{funnel.steps.length > 4 && (
						<CaretRightIcon className="size-3 text-muted-foreground" />
					)}
				</div>
			</div>

			{funnel.createdAt && (
				<span className="hidden shrink-0 text-muted-foreground text-xs lg:block">
					{fromNow(funnel.createdAt)}
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

export function FunnelsListRenderer({
	title,
	funnels,
	className,
}: FunnelsListProps) {
	const router = useRouter();
	const params = useParams();
	const websiteId = params.id as string;

	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingFunnel, setEditingFunnel] = useState<FunnelItem | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const {
		createFunnel,
		updateFunnel,
		deleteFunnel,
		isCreating,
		isUpdating,
		isDeleting,
	} = useFunnels(websiteId);

	const openCreate = useCallback(() => {
		setEditingFunnel(null);
		setDialogOpen(true);
	}, []);

	const openEdit = useCallback((funnel: FunnelItem) => {
		setEditingFunnel(funnel);
		setDialogOpen(true);
	}, []);

	const closeDialog = useCallback(() => {
		setDialogOpen(false);
		setEditingFunnel(null);
	}, []);

	const handleCreate = useCallback(
		async (data: CreateFunnelData) => {
			try {
				await createFunnel(data);
				closeDialog();
			} catch {
				toast.error("Failed to create funnel");
			}
		},
		[createFunnel, closeDialog]
	);

	const handleUpdate = useCallback(
		async (funnel: Funnel) => {
			if (!editingFunnel) {
				return;
			}
			try {
				await updateFunnel({
					funnelId: editingFunnel.id,
					updates: {
						name: funnel.name,
						description: funnel.description ?? undefined,
						steps: funnel.steps,
						filters: funnel.filters,
						ignoreHistoricData: funnel.ignoreHistoricData,
					},
				});
				closeDialog();
			} catch {
				toast.error("Failed to update funnel");
			}
		},
		[editingFunnel, updateFunnel, closeDialog]
	);

	const confirmDelete = useCallback(async () => {
		if (!deletingId) {
			return;
		}
		try {
			await deleteFunnel(deletingId);
			setDeletingId(null);
		} catch {
			toast.error("Failed to delete funnel");
		}
	}, [deletingId, deleteFunnel]);

	// Convert FunnelItem to Funnel for the dialog
	const funnelForDialog: Funnel | null = editingFunnel
		? {
				id: editingFunnel.id,
				name: editingFunnel.name,
				description: editingFunnel.description,
				steps: editingFunnel.steps,
				filters: [],
				isActive: editingFunnel.isActive,
				createdAt: editingFunnel.createdAt ?? "",
				updatedAt: editingFunnel.createdAt ?? "",
			}
		: null;

	if (funnels.length === 0) {
		return (
			<Card
				className={className ?? "gap-0 overflow-hidden border bg-card py-0"}
			>
				<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
					<FunnelIcon
						className="size-8 text-muted-foreground/40"
						weight="duotone"
					/>
					<p className="font-medium text-sm">No funnels found</p>
					<p className="text-muted-foreground text-xs">
						Create your first conversion funnel
					</p>
					<Button
						className="mt-2"
						onClick={openCreate}
						size="sm"
						variant="secondary"
					>
						<PlusIcon className="size-4" />
						Create Funnel
					</Button>
				</div>
				<EditFunnelDialog
					funnel={null}
					isCreating={isCreating}
					isOpen={dialogOpen}
					isUpdating={false}
					onClose={closeDialog}
					onCreate={handleCreate}
					onSubmit={handleUpdate}
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
					{funnels.map((funnel) => (
						<FunnelRow
							funnel={funnel}
							key={funnel.id}
							onDelete={() => setDeletingId(funnel.id)}
							onEdit={() => openEdit(funnel)}
							onNavigate={() => router.push(`/websites/${websiteId}/funnels`)}
						/>
					))}
				</div>
				<div className="border-t bg-muted/30 px-3 py-1.5">
					<p className="text-muted-foreground text-xs">
						{funnels.length} {funnels.length === 1 ? "funnel" : "funnels"}
					</p>
				</div>
			</Card>

			<EditFunnelDialog
				funnel={funnelForDialog}
				isCreating={isCreating}
				isOpen={dialogOpen}
				isUpdating={isUpdating}
				onClose={closeDialog}
				onCreate={handleCreate}
				onSubmit={handleUpdate}
			/>

			<DeleteDialog
				confirmLabel="Delete Funnel"
				description="This action cannot be undone and will permanently remove all funnel analytics data."
				isDeleting={isDeleting}
				isOpen={!!deletingId}
				onClose={() => setDeletingId(null)}
				onConfirm={confirmDelete}
				title="Delete Funnel"
			/>
		</>
	);
}
