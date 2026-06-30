"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { EditFunnelDialog } from "@/app/(main)/websites/[id]/funnels/_components/edit-funnel-dialog";
import { useFunnels } from "@/hooks/use-funnels";
import { orpc } from "@/lib/orpc";
import type {
	CreateFunnelData,
	Funnel,
	FunnelFilter,
	FunnelStep,
} from "@/types/funnels";
import { cn } from "@/lib/utils";
import type { BaseComponentProps, FunnelStepInput } from "../../types";
import {
	CaretRightIcon,
	DotsThreeIcon,
	FunnelIcon,
	PencilSimpleIcon,
	PlusIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { DeleteDialog, DropdownMenu } from "@databuddy/ui/client";
import { Badge, Button, Card, fromNow } from "@databuddy/ui";

interface FunnelItem {
	createdAt?: string;
	description?: string | null;
	id: string;
	isActive: boolean;
	name: string;
	steps: FunnelStepInput[];
}

export interface FunnelsListProps extends BaseComponentProps {
	funnels: FunnelItem[];
	title?: string;
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
		<div
			className={cn(
				"group/funnel-row flex w-full gap-3 rounded-sm bg-muted/30 px-2 py-2.5 text-left transition-colors hover:bg-muted",
				!funnel.isActive && "opacity-70"
			)}
		>
			<Button
				className="min-w-0 flex-1 justify-start gap-3 rounded-none bg-transparent p-0 text-left font-normal text-foreground hover:bg-transparent active:scale-100"
				onClick={onNavigate}
				variant="ghost"
			>
				<span className="h-max shrink-0 rounded border border-transparent bg-accent p-1.5 text-primary transition-colors group-hover/funnel-row:bg-primary/10">
					<FunnelIcon className="size-3.5" weight="duotone" />
				</span>

				<span className="min-w-0 flex-1">
					<span className="flex items-center gap-2">
						<span className="truncate font-medium text-sm">{funnel.name}</span>
						<span className="flex items-center gap-1">
							<Badge
								className="rounded px-1.5 py-0.5! text-[10px]!"
								variant="muted"
							>
								{funnel.steps.length} steps
							</Badge>
							{!funnel.isActive && (
								<Badge
									className="rounded px-1.5 py-0.5 text-[10px]!"
									variant="default"
								>
									Paused
								</Badge>
							)}
						</span>
					</span>
					{funnel.description && (
						<span className="mt-0.5 block truncate text-muted-foreground text-xs">
							{funnel.description}
						</span>
					)}
				</span>

				<span className="mx-3 hidden shrink-0 items-center gap-3 sm:flex">
					<span className="flex h-5 items-center gap-0.5">
						{funnel.steps.slice(0, 4).map((_, idx) => (
							<span
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
					</span>
				</span>

				{funnel.createdAt && (
					<span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
						{fromNow(funnel.createdAt)}
					</span>
				)}
			</Button>

			<DropdownMenu>
				<DropdownMenu.Trigger
					aria-label="Actions"
					className="inline-flex size-7 shrink-0 items-center justify-center gap-1.5 rounded-md bg-secondary p-0 font-medium text-muted-foreground opacity-70 transition-all duration-(--duration-quick) ease-(--ease-smooth) hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 group-hover/funnel-row:bg-interactive-hover group-hover/funnel-row:text-foreground data-[state=open]:opacity-100"
				>
					<DotsThreeIcon className="size-4" weight="bold" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" className="w-40">
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
	const [editingFunnelId, setEditingFunnelId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const {
		createAction,
		updateAction,
		deleteAction,
		isCreating,
		isUpdating,
		isDeleting,
	} = useFunnels(websiteId);

	const editingFunnelQuery = useQuery({
		...orpc.funnels.getById.queryOptions({
			input: { id: editingFunnelId ?? "" },
		}),
		enabled: !!editingFunnelId,
	});

	const openCreate = useCallback(() => {
		setEditingFunnelId(null);
		setDialogOpen(true);
	}, []);

	const openEdit = useCallback((funnel: FunnelItem) => {
		setEditingFunnelId(funnel.id);
		setDialogOpen(true);
	}, []);

	const closeDialog = useCallback(() => {
		setDialogOpen(false);
		setEditingFunnelId(null);
	}, []);

	const handleCreate = useCallback(
		async (data: CreateFunnelData) => {
			try {
				await createAction(data);
				closeDialog();
			} catch {
				toast.error("Failed to create funnel");
			}
		},
		[createAction, closeDialog]
	);

	const handleUpdate = useCallback(
		async (funnel: Funnel) => {
			if (!editingFunnelId) {
				return;
			}
			try {
				await updateAction(editingFunnelId, {
					name: funnel.name,
					description: funnel.description ?? undefined,
					steps: funnel.steps,
					filters: funnel.filters,
					ignoreHistoricData: funnel.ignoreHistoricData,
				});
				closeDialog();
			} catch {
				toast.error("Failed to update funnel");
			}
		},
		[editingFunnelId, updateAction, closeDialog]
	);

	const confirmDelete = useCallback(async () => {
		if (!deletingId) {
			return;
		}
		try {
			await deleteAction(deletingId);
			setDeletingId(null);
		} catch {
			toast.error("Failed to delete funnel");
		}
	}, [deletingId, deleteAction]);

	const fetchedFunnel = editingFunnelQuery.data as
		| {
				createdAt: string | Date;
				description?: string | null;
				filters?: unknown;
				id: string;
				ignoreHistoricData?: boolean;
				isActive: boolean;
				name: string;
				steps: unknown;
				updatedAt?: string | Date;
		  }
		| undefined;
	const funnelForDialog: Funnel | null = fetchedFunnel
		? {
				id: fetchedFunnel.id,
				name: fetchedFunnel.name,
				description: fetchedFunnel.description ?? null,
				steps: fetchedFunnel.steps as FunnelStep[],
				filters: (fetchedFunnel.filters as FunnelFilter[] | undefined) ?? [],
				ignoreHistoricData: fetchedFunnel.ignoreHistoricData,
				isActive: fetchedFunnel.isActive,
				createdAt:
					typeof fetchedFunnel.createdAt === "string"
						? fetchedFunnel.createdAt
						: fetchedFunnel.createdAt.toISOString(),
				updatedAt:
					typeof fetchedFunnel.updatedAt === "string"
						? fetchedFunnel.updatedAt
						: (fetchedFunnel.updatedAt?.toISOString() ?? ""),
			}
		: null;

	const dialogReady =
		!editingFunnelId ||
		(Boolean(editingFunnelQuery.data) && !editingFunnelQuery.isLoading);

	if (funnels.length === 0) {
		return (
			<Card
				className={cn(
					"gap-0 overflow-hidden border-0 bg-secondary p-1",
					className
				)}
			>
				<div className="rounded-md bg-background px-3 py-8">
					<div className="flex flex-col items-center justify-center gap-2 text-center">
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
				className={cn(
					"gap-0 overflow-hidden border-0 bg-secondary p-1",
					className
				)}
			>
				<div className="flex flex-col gap-1">
					{title ? (
						<div className="flex items-center gap-2.5 rounded-md bg-background px-2 py-2">
							<div className="flex size-6 items-center justify-center rounded bg-accent">
								<FunnelIcon
									className="size-3.5 text-muted-foreground"
									weight="duotone"
								/>
							</div>
							<p className="font-medium text-sm">{title}</p>
							<div className="ml-auto flex items-center gap-2">
								<Button onClick={openCreate} size="sm" variant="primary">
									<PlusIcon className="size-3.5" />
									New
								</Button>
							</div>
						</div>
					) : null}

					<div className="rounded-md bg-background px-1 py-1">
						<div className="space-y-1">
							{funnels.map((funnel) => (
								<FunnelRow
									funnel={funnel}
									key={funnel.id}
									onDelete={() => setDeletingId(funnel.id)}
									onEdit={() => openEdit(funnel)}
									onNavigate={() =>
										router.push(`/websites/${websiteId}/funnels`)
									}
								/>
							))}
						</div>
					</div>
				</div>
			</Card>

			<EditFunnelDialog
				funnel={funnelForDialog}
				isCreating={isCreating}
				isOpen={dialogOpen && dialogReady}
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
