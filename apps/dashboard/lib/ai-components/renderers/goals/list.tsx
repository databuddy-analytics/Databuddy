"use client";

import {
	DotsThreeIcon,
	EyeIcon,
	MouseMiddleClickIcon,
	PencilSimpleIcon,
	PlusIcon,
	TargetIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { EditGoalDialog } from "@/app/(main)/websites/[id]/goals/_components/edit-goal-dialog";
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
	type CreateGoalData,
	type Goal,
	useGoals,
} from "@/hooks/use-goals";
import { fromNow } from "@/lib/time";
import type { BaseComponentProps } from "../../types";

interface GoalItem {
	id: string;
	name: string;
	description?: string | null;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
	target: string;
	isActive: boolean;
	createdAt?: string;
}

export interface GoalsListProps extends BaseComponentProps {
	title?: string;
	goals: GoalItem[];
}

function GoalTypeIcon({ type }: { type: string }) {
	if (type === "EVENT") {
		return <MouseMiddleClickIcon className="size-3.5" weight="duotone" />;
	}
	return <EyeIcon className="size-3.5" weight="duotone" />;
}

function GoalRow({
	goal,
	onNavigate,
	onEdit,
	onDelete,
}: {
	goal: GoalItem;
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
				<GoalTypeIcon type={goal.type} />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium text-sm">{goal.name}</p>
					<Badge className="text-[10px]" variant="secondary">
						{goal.type === "PAGE_VIEW" ? "Page" : "Event"}
					</Badge>
					{!goal.isActive && (
						<Badge className="text-[10px]" variant="outline">
							Paused
						</Badge>
					)}
				</div>
				<p className="mt-0.5 truncate text-muted-foreground text-xs">
					{goal.target}
				</p>
			</div>

			{goal.createdAt && (
				<span className="hidden shrink-0 text-muted-foreground text-xs lg:block">
					{fromNow(goal.createdAt)}
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

export function GoalsListRenderer({
	title,
	goals,
	className,
}: GoalsListProps) {
	const router = useRouter();
	const params = useParams();
	const websiteId = params.id as string;

	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingGoal, setEditingGoal] = useState<GoalItem | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const {
		createGoal,
		updateGoal,
		deleteGoal,
		isCreating,
		isUpdating,
		isDeleting,
	} = useGoals(websiteId);

	const openCreate = useCallback(() => {
		setEditingGoal(null);
		setDialogOpen(true);
	}, []);

	const openEdit = useCallback((goal: GoalItem) => {
		setEditingGoal(goal);
		setDialogOpen(true);
	}, []);

	const closeDialog = useCallback(() => {
		setDialogOpen(false);
		setEditingGoal(null);
	}, []);

	const handleSave = useCallback(
		async (data: Goal | Omit<CreateGoalData, "websiteId">) => {
			try {
				if (editingGoal) {
					await updateGoal({
						goalId: editingGoal.id,
						updates: data as Partial<CreateGoalData>,
					});
				} else {
					await createGoal({
						websiteId,
						...data,
					} as CreateGoalData);
				}
				closeDialog();
			} catch {
				toast.error(editingGoal ? "Failed to update goal" : "Failed to create goal");
			}
		},
		[editingGoal, createGoal, updateGoal, websiteId, closeDialog]
	);

	const confirmDelete = useCallback(async () => {
		if (!deletingId) {
			return;
		}
		try {
			await deleteGoal(deletingId);
			setDeletingId(null);
		} catch {
			toast.error("Failed to delete goal");
		}
	}, [deletingId, deleteGoal]);

	// Convert GoalItem to Goal for the dialog
	const goalForDialog: Goal | null = editingGoal
		? {
				id: editingGoal.id,
				websiteId,
				name: editingGoal.name,
				description: editingGoal.description ?? null,
				type: editingGoal.type,
				target: editingGoal.target,
				filters: [],
				isActive: editingGoal.isActive,
				ignoreHistoricData: false,
				createdAt: editingGoal.createdAt ? new Date(editingGoal.createdAt) : new Date(),
				updatedAt: new Date(),
				createdBy: null,
				deletedAt: null,
			}
		: null;

	if (goals.length === 0) {
		return (
			<Card
				className={className ?? "gap-0 overflow-hidden border bg-card py-0"}
			>
				<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
					<TargetIcon
						className="size-8 text-muted-foreground/40"
						weight="duotone"
					/>
					<p className="font-medium text-sm">No goals found</p>
					<p className="text-muted-foreground text-xs">
						Create your first conversion goal
					</p>
					<Button
						className="mt-2"
						onClick={openCreate}
						size="sm"
						variant="secondary"
					>
						<PlusIcon className="size-4" />
						Create Goal
					</Button>
				</div>
				<EditGoalDialog
					goal={null}
					isOpen={dialogOpen}
					isSaving={isCreating}
					onClose={closeDialog}
					onSave={handleSave}
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
					{goals.map((goal) => (
						<GoalRow
							goal={goal}
							key={goal.id}
							onDelete={() => setDeletingId(goal.id)}
							onEdit={() => openEdit(goal)}
							onNavigate={() => router.push(`/websites/${websiteId}/goals`)}
						/>
					))}
				</div>
				<div className="border-t bg-muted/30 px-3 py-1.5">
					<p className="text-muted-foreground text-xs">
						{goals.length} {goals.length === 1 ? "goal" : "goals"}
					</p>
				</div>
			</Card>

			<EditGoalDialog
				goal={goalForDialog}
				isOpen={dialogOpen}
				isSaving={editingGoal ? isUpdating : isCreating}
				onClose={closeDialog}
				onSave={handleSave}
			/>

			<DeleteDialog
				confirmLabel="Delete Goal"
				description="This action cannot be undone and will permanently remove all goal analytics data."
				isDeleting={isDeleting}
				isOpen={!!deletingId}
				onClose={() => setDeletingId(null)}
				onConfirm={confirmDelete}
				title="Delete Goal"
			/>
		</>
	);
}
