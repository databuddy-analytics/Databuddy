"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import { EditGoalDialog } from "@/app/(main)/websites/[id]/goals/_components/edit-goal-dialog";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { type CreateGoalData, type Goal, useGoals } from "@/hooks/use-goals";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../../types";
import {
	ArrowRightIcon,
	CheckIcon,
	CopyIcon,
	DotsThreeIcon,
	EyeIcon,
	MouseMiddleClickIcon,
	PencilSimpleIcon,
	PlusIcon,
	TargetIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { DeleteDialog, DropdownMenu } from "@databuddy/ui/client";
import { Badge, Button, Card, fromNow } from "@databuddy/ui";

interface GoalItem {
	createdAt?: string;
	description?: string | null;
	id: string;
	isActive: boolean;
	name: string;
	target: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
}

export interface GoalsListProps extends BaseComponentProps {
	goals: GoalItem[];
	title?: string;
}

function formatGoalTargetDisplay(target: string, maxLen = 40): string {
	try {
		const { host, pathname } = new URL(target);
		const display = host + (pathname === "/" ? "" : pathname);
		return display.length > maxLen
			? `${display.slice(0, maxLen - 3)}...`
			: display;
	} catch {
		return target.length > maxLen
			? `${target.slice(0, maxLen - 3)}...`
			: target;
	}
}

function goalTypeLabel(type: GoalItem["type"]): string {
	if (type === "PAGE_VIEW") {
		return "Page";
	}
	if (type === "EVENT") {
		return "Event";
	}
	return "Custom";
}

function GoalTypeIcon({ type }: { type: string }) {
	if (type === "EVENT") {
		return <MouseMiddleClickIcon className="size-3.5" weight="duotone" />;
	}
	if (type === "CUSTOM") {
		return <TargetIcon className="size-3.5" weight="duotone" />;
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
	const { copyToClipboard, isCopied } = useCopyToClipboard({
		onCopy: () => toast.success("Target copied"),
	});

	const copyTarget = useCallback(() => {
		copyToClipboard(goal.target);
	}, [copyToClipboard, goal.target]);

	const handleCopyButton = useCallback(
		(e: MouseEvent<HTMLButtonElement>) => {
			e.stopPropagation();
			copyTarget();
		},
		[copyTarget]
	);

	return (
		// biome-ignore lint/a11y/useSemanticElements: Can't use button - contains nested buttons (dropdown trigger, copy button)
		<div
			className={cn(
				"group/goal-row flex w-full cursor-pointer gap-3 rounded-sm bg-muted/30 px-2 py-2.5 text-left transition-colors hover:bg-muted",
				!goal.isActive && "opacity-70"
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
			<div className="h-max shrink-0 rounded border border-transparent bg-accent p-1.5 text-primary transition-colors group-hover/goal-row:bg-primary/10">
				<GoalTypeIcon type={goal.type} />
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate font-medium text-sm">{goal.name}</p>
				<div className="flex items-center gap-1">
				<Badge className="rounded px-1.5 py-0.5! text-[10px]!" variant="muted">
						{goalTypeLabel(goal.type)}
					</Badge>
					{!goal.isActive && (
						<Badge
							className="rounded px-1.5 py-0.5 text-[10px]!"
							variant="default"
						>
							Paused
						</Badge>
					)}
				</div>
				</div>
				<div className="mt-1 flex items-center gap-2">
					<button
						className="flex shrink-0 items-center gap-1.5 rounded border border-transparent bg-muted px-1.5 py-px font-mono text-[10px] transition-colors hover:border-border group-hover/goal-row:bg-primary/10"
						onClick={handleCopyButton}
						type="button"
					>
						<span className="max-w-[7rem] text-ring truncate">
							{formatGoalTargetDisplay(goal.target, 28)}
						</span>
					</button>
				</div>
			</div>

			{goal.createdAt && (
				<span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
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
					<DropdownMenu.Trigger
						aria-label="Actions"
						className="inline-flex size-7 items-center justify-center gap-1.5 rounded-md bg-secondary p-0 font-medium text-muted-foreground opacity-70 transition-all duration-(--duration-quick) ease-(--ease-smooth) hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 group-hover/goal-row:bg-interactive-hover group-hover/goal-row:text-foreground data-[state=open]:opacity-100"
					>
						<DotsThreeIcon className="size-4" weight="bold" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" className="w-40">
						<DropdownMenu.Item className="gap-2" onClick={copyTarget}>
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

export function GoalsListRenderer({ title, goals, className }: GoalsListProps) {
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
				toast.error(
					editingGoal ? "Failed to update goal" : "Failed to create goal"
				);
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
				createdAt: editingGoal.createdAt
					? new Date(editingGoal.createdAt)
					: new Date(),
				updatedAt: new Date(),
				createdBy: "",
				deletedAt: null,
			}
		: null;

	if (goals.length === 0) {
		return (
			<Card
				className={cn(
					"gap-0 overflow-hidden border-0 bg-secondary p-1",
					className
				)}
			>
				<div className="rounded-md bg-background px-3 py-8">
					<div className="flex flex-col items-center justify-center gap-2 text-center">
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
				className={cn(
					"gap-0 overflow-hidden border-0 bg-secondary p-1",
					className
				)}
			>
				<div className="flex flex-col gap-1">
					{title ? (
						<div className="flex items-center gap-2.5 rounded-md bg-background px-2 py-2">
							<div className="flex size-6 items-center justify-center rounded bg-accent">
								<TargetIcon
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
					</div>
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
