"use client";

import type { Icon } from "@phosphor-icons/react";
import {
	CheckIcon,
	CircleNotchIcon,
	FunnelIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { EditFunnelDialog } from "@/app/(main)/websites/[id]/funnels/_components/edit-funnel-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useChat } from "@/contexts/chat-context";
import {
	type CreateFunnelData,
	type Funnel,
	useFunnels,
} from "@/hooks/use-funnels";
import { cn } from "@/lib/utils";
import type { BaseComponentProps, FunnelStepInput } from "../../types";

interface FunnelPreviewData {
	name: string;
	description?: string | null;
	steps: FunnelStepInput[];
	ignoreHistoricData?: boolean;
}

export interface FunnelPreviewProps extends BaseComponentProps {
	mode: "create" | "update" | "delete";
	funnel: FunnelPreviewData;
}

interface ModeConfig {
	title: string;
	confirmLabel: string;
	confirmMessage: string;
	accent: string;
	variant: "default" | "destructive";
	ButtonIcon: Icon;
}

const MODE_CONFIG: Record<string, ModeConfig> = {
	create: {
		title: "Create Funnel",
		confirmLabel: "Create",
		confirmMessage: "Yes, create it",
		accent: "",
		variant: "default",
		ButtonIcon: CheckIcon,
	},
	update: {
		title: "Update Funnel",
		confirmLabel: "Update",
		confirmMessage: "Yes, update it",
		accent: "border-amber-500/30",
		variant: "default",
		ButtonIcon: CheckIcon,
	},
	delete: {
		title: "Delete Funnel",
		confirmLabel: "Delete",
		confirmMessage: "Yes, delete it",
		accent: "border-destructive/30",
		variant: "destructive",
		ButtonIcon: TrashIcon,
	},
};

export function FunnelPreviewRenderer({
	mode,
	funnel,
	className,
}: FunnelPreviewProps) {
	const { sendMessage, status } = useChat();
	const params = useParams();
	const websiteId = params.id as string;

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isConfirming, setIsConfirming] = useState(false);

	const { createFunnel, isCreating } = useFunnels(websiteId);

	const config = MODE_CONFIG[mode];
	const isLoading = status === "streaming" || status === "submitted";

	// Convert to Funnel type for the dialog
	const funnelForDialog: Funnel = {
		id: "",
		name: funnel.name,
		description: funnel.description,
		steps: funnel.steps,
		filters: [],
		ignoreHistoricData: funnel.ignoreHistoricData ?? false,
		isActive: true,
		createdAt: "",
		updatedAt: "",
	};

	const handleConfirm = () => {
		setIsConfirming(true);
		sendMessage({ text: config.confirmMessage });
		setTimeout(() => setIsConfirming(false), 500);
	};

	const handleCreateFromDialog = useCallback(
		async (data: CreateFunnelData) => {
			try {
				await createFunnel(data);
				setIsDialogOpen(false);
			} catch {
				toast.error("Failed to create funnel");
			}
		},
		[createFunnel]
	);

	const handleUpdateFromDialog = useCallback(async (_funnel: Funnel) => {
		// Updates go through the AI confirmation flow
		setIsDialogOpen(false);
	}, []);

	return (
		<>
			<Card
				className={cn(
					"gap-0 overflow-hidden border py-0",
					config.accent,
					className
				)}
			>
				<div className="flex items-center gap-2.5 border-b px-3 py-2">
					<div className="flex size-6 items-center justify-center rounded bg-accent">
						<FunnelIcon
							className="size-3.5 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<p className="font-medium text-sm">{config.title}</p>
					<Badge className="ml-auto text-[10px]" variant="secondary">
						{funnel.steps.length} steps
					</Badge>
				</div>

				<div className="px-3 py-3">
					<div className="space-y-2">
						<div>
							<p className="text-muted-foreground text-xs">Name</p>
							<p className="text-sm">{funnel.name}</p>
						</div>
						{funnel.description && (
							<div>
								<p className="text-muted-foreground text-xs">Description</p>
								<p className="text-sm">{funnel.description}</p>
							</div>
						)}
						<div>
							<p className="mb-1.5 text-muted-foreground text-xs">Steps</p>
							<div className="space-y-1">
								{funnel.steps.map((step, idx) => (
									<div
										className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1.5"
										key={idx}
									>
										<div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-xs">
											{idx + 1}
										</div>
										<span className="min-w-0 flex-1 truncate text-xs">
											{step.name}
										</span>
										<Badge className="shrink-0 text-[10px]" variant="outline">
											{step.type === "PAGE_VIEW" ? "Page" : "Event"}
										</Badge>
									</div>
								))}
							</div>
						</div>
						{funnel.ignoreHistoricData && (
							<p className="text-muted-foreground text-xs">
								Historic data will be ignored
							</p>
						)}
					</div>
				</div>

				<div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-3 py-2">
					<Button
						disabled={isLoading || isConfirming}
						onClick={() => setIsDialogOpen(true)}
						size="sm"
						variant="ghost"
					>
						<PencilSimpleIcon className="size-3.5" />
						Edit
					</Button>
					<Button
						disabled={isLoading || isConfirming}
						onClick={handleConfirm}
						size="sm"
						variant={config.variant}
					>
						{isConfirming ? (
							<CircleNotchIcon className="size-3.5 animate-spin" />
						) : (
							<config.ButtonIcon className="size-3.5" weight="bold" />
						)}
						{config.confirmLabel}
					</Button>
				</div>
			</Card>

			<EditFunnelDialog
				funnel={mode === "create" ? null : funnelForDialog}
				isCreating={isCreating}
				isOpen={isDialogOpen}
				isUpdating={false}
				onClose={() => setIsDialogOpen(false)}
				onCreate={handleCreateFromDialog}
				onSubmit={handleUpdateFromDialog}
			/>
		</>
	);
}
