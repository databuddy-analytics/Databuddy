"use client";

import { useParams } from "next/navigation";
import {
	type ComponentType,
	type SVGProps,
	useCallback,
	useState,
} from "react";
import { toast } from "sonner";
import { EditGoalDialog } from "@/app/(main)/websites/[id]/goals/_components/edit-goal-dialog";
import { useChat } from "@/contexts/chat-context";
import { type CreateGoalData, type Goal, useGoals } from "@/hooks/use-goals";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../../types";
import {
	CheckIcon,
	PencilSimpleIcon,
	TargetIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Card } from "@databuddy/ui";

type IconComponent = ComponentType<
	SVGProps<SVGSVGElement> & { size?: number | string; weight?: string }
>;

interface GoalPreviewData {
	description?: string | null;
	ignoreHistoricData?: boolean;
	name: string;
	target: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
}

export interface GoalPreviewProps extends BaseComponentProps {
	goal: GoalPreviewData;
	mode: "create" | "update" | "delete";
}

interface ModeConfig {
	accent: string;
	ButtonIcon: IconComponent;
	confirmLabel: string;
	confirmMessage: string;
	title: string;
	tone?: "destructive";
}

const MODE_CONFIG: Record<string, ModeConfig> = {
	create: {
		title: "Create Goal",
		confirmLabel: "Create",
		confirmMessage: "Yes, create it",
		accent: "",
		ButtonIcon: CheckIcon,
	},
	update: {
		title: "Update Goal",
		confirmLabel: "Update",
		confirmMessage: "Yes, update it",
		accent: "border-amber-500/30",
		ButtonIcon: CheckIcon,
	},
	delete: {
		title: "Delete Goal",
		confirmLabel: "Delete",
		confirmMessage: "Yes, delete it",
		accent: "border-destructive/30",
		tone: "destructive",
		ButtonIcon: TrashIcon,
	},
};

export function GoalPreviewRenderer({
	mode,
	goal,
	className,
}: GoalPreviewProps) {
	const { sendMessage, status } = useChat();
	const params = useParams();
	const websiteId = params.id as string;

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isConfirming, setIsConfirming] = useState(false);

	const { createGoal, isCreating } = useGoals(websiteId);

	const config = MODE_CONFIG[mode];
	const isLoading = status === "streaming" || status === "submitted";
	const canEditInline = mode === "create";

	let goalTypeBadge = "Custom";
	if (goal.type === "PAGE_VIEW") {
		goalTypeBadge = "Page";
	} else if (goal.type === "EVENT") {
		goalTypeBadge = "Event";
	}

	const handleConfirm = () => {
		setIsConfirming(true);
		sendMessage({ text: config.confirmMessage });
		setTimeout(() => setIsConfirming(false), 500);
	};

	const handleSaveFromDialog = useCallback(
		async (data: Goal | Omit<CreateGoalData, "websiteId">) => {
			try {
				await createGoal({
					websiteId,
					...data,
				} as CreateGoalData);
				setIsDialogOpen(false);
			} catch {
				toast.error("Failed to create goal");
			}
		},
		[createGoal, websiteId]
	);

	return (
		<>
			<Card
				className={cn(
					"gap-0 overflow-hidden border-0 bg-secondary p-1",
					config.accent,
					className
				)}
			>
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2.5 rounded-md bg-background px-2 py-2">
						<div className="flex size-6 items-center justify-center rounded bg-accent">
							<TargetIcon
								className="size-3.5 text-muted-foreground"
								weight="duotone"
							/>
						</div>
						<p className="font-medium text-sm">{config.title}</p>
						<Badge className="ml-auto rounded text-[10px]" variant="muted">
							{goalTypeBadge}
						</Badge>
					</div>

					<div className="rounded-md bg-background px-3 py-3">
						<div className="space-y-2">
							<div>
								<p className="text-muted-foreground text-xs">Name</p>
								<p className="text-sm">{goal.name}</p>
							</div>
							{goal.description && (
								<div>
									<p className="text-muted-foreground text-xs">Description</p>
									<p className="text-sm">{goal.description}</p>
								</div>
							)}
							<div>
								<p className="text-muted-foreground text-xs">Target</p>
								<pre className="mt-1 overflow-x-auto text-pretty break-all rounded bg-muted p-1.5 px-2 font-mono text-xs">
									<code className="font-semibold text-ring">{goal.target}</code>
								</pre>
							</div>
							{goal.ignoreHistoricData && (
								<div className="mt-3 flex gap-2">
									<div className="w-full max-w-1/2 rounded-md bg-muted/30 px-2 py-1.5">
										<p className="text-muted-foreground text-xs">
											Historic data
										</p>
										<p className="mt-0.5 text-sm">Will be ignored</p>
									</div>
								</div>
							)}
						</div>
					</div>

					<div className="rounded-md bg-background">
						<div className="flex items-center justify-end gap-2 bg-muted/30 px-2 py-2">
							{canEditInline && (
								<Button
									disabled={isLoading || isConfirming}
									onClick={() => setIsDialogOpen(true)}
									size="sm"
									variant="ghost"
								>
									<PencilSimpleIcon className="size-3.5" />
									Edit
								</Button>
							)}
							<Button
								disabled={isLoading}
								loading={isConfirming}
								onClick={handleConfirm}
								size="sm"
								tone={config.tone}
							>
								<config.ButtonIcon className="size-3.5" weight="bold" />
								{config.confirmLabel}
							</Button>
						</div>
					</div>
				</div>
			</Card>

			{canEditInline && (
				<EditGoalDialog
					goal={null}
					isOpen={isDialogOpen}
					isSaving={isCreating}
					onClose={() => setIsDialogOpen(false)}
					onSave={handleSaveFromDialog}
				/>
			)}
		</>
	);
}
