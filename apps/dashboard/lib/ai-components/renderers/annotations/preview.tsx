"use client";

import { type ComponentType, type SVGProps, useState } from "react";
import { useChat } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../../types";
import {
	CalendarIcon,
	CheckIcon,
	NoteIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Card } from "@databuddy/ui";

type IconComponent = ComponentType<
	SVGProps<SVGSVGElement> & { size?: number | string; weight?: string }
>;

interface AnnotationPreviewData {
	annotationType: "point" | "line" | "range";
	color?: string | null;
	isPublic?: boolean;
	tags?: string[];
	text: string;
	xEndValue?: string | null;
	xValue: string;
}

export interface AnnotationPreviewProps extends BaseComponentProps {
	annotation: AnnotationPreviewData;
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
		title: "Create Annotation",
		confirmLabel: "Create",
		confirmMessage: "Yes, create it",
		accent: "",
		ButtonIcon: CheckIcon,
	},
	update: {
		title: "Update Annotation",
		confirmLabel: "Update",
		confirmMessage: "Yes, update it",
		accent: "border-amber-500/30",
		ButtonIcon: CheckIcon,
	},
	delete: {
		title: "Delete Annotation",
		confirmLabel: "Delete",
		confirmMessage: "Yes, delete it",
		accent: "border-destructive/30",
		tone: "destructive",
		ButtonIcon: TrashIcon,
	},
};

function annotationTypeLabel(type: string) {
	const labels: Record<string, string> = {
		point: "Point",
		line: "Line",
		range: "Range",
	};
	return labels[type] ?? type;
}

export function AnnotationPreviewRenderer({
	mode,
	annotation,
	className,
}: AnnotationPreviewProps) {
	const { sendMessage, status } = useChat();
	const [isConfirming, setIsConfirming] = useState(false);

	const config = MODE_CONFIG[mode];
	const isLoading = status === "streaming" || status === "submitted";

	const dateDisplay =
		annotation.annotationType === "range" && annotation.xEndValue
			? `${new Date(annotation.xValue).toLocaleDateString()} - ${new Date(annotation.xEndValue).toLocaleDateString()}`
			: new Date(annotation.xValue).toLocaleDateString();

	const handleConfirm = () => {
		setIsConfirming(true);
		sendMessage({ text: config.confirmMessage });
		setTimeout(() => setIsConfirming(false), 500);
	};

	return (
		<Card
			className={cn(
				"gap-0 overflow-hidden border-0 bg-secondary p-1",
				config.accent,
				className
			)}
		>
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2.5 rounded bg-background px-2 py-2">
					<div
						className={cn(
							"flex size-6 items-center justify-center rounded",
							annotation.color ? "" : "bg-accent"
						)}
						style={
							annotation.color
								? { backgroundColor: `${annotation.color}20` }
								: undefined
						}
					>
						<NoteIcon
							className={cn(
								"size-3.5",
								annotation.color ? "" : "text-muted-foreground"
							)}
							style={annotation.color ? { color: annotation.color } : undefined}
							weight="duotone"
						/>
					</div>
					<p className="font-medium text-sm">{config.title}</p>
					<Badge className="ml-auto rounded text-[10px]" variant="muted">
						{annotationTypeLabel(annotation.annotationType)}
					</Badge>
				</div>

				<div className="rounded bg-background px-3 py-3">
					<div className="space-y-2.5">
						<div>
							<p className="text-muted-foreground text-xs">Text</p>
							<p className="text-sm">{annotation.text}</p>
						</div>
						<div>
							<p className="mb-1.5 text-muted-foreground text-xs">Date</p>
							<div className="flex items-center gap-2 rounded bg-muted px-2 py-1.5 hover:bg-interactive-hover">
								<CalendarIcon
									className="size-4 shrink-0 text-muted-foreground"
									weight="duotone"
								/>
								<span className="min-w-0 flex-1 text-sm">{dateDisplay}</span>
							</div>
						</div>
						{Array.isArray(annotation.tags) && annotation.tags.length > 0 && (
							<div>
								<p className="mb-1.5 text-muted-foreground text-xs">Tags</p>
								<div className="flex flex-wrap items-center gap-1">
									{annotation.tags.map((tag) => (
										<div
											className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 hover:bg-interactive-hover"
											key={tag}
										>
											<span className="min-w-0 flex-1 truncate text-xs">
												{tag}
											</span>
										</div>
									))}
								</div>
							</div>
						)}
						{annotation.color && (
							<div className="flex flex-col gap-2">
								<p className="text-muted-foreground text-xs">Color</p>
								<div
									className="size-8 rounded border"
									style={{ backgroundColor: annotation.color }}
								/>
							</div>
						)}
						{annotation.isPublic && (
							<p className="text-muted-foreground text-xs">
								Visible to everyone who can view this chart
							</p>
						)}
					</div>
				</div>

				<div className="rounded bg-background">
					<div className="flex items-center justify-end gap-2 bg-muted/30 px-2 py-2">
						<Button
							disabled={isLoading || isConfirming}
							onClick={() => {
								// Annotation editing requires chart context
							}}
							size="sm"
							type="button"
							variant="ghost"
						>
							<PencilSimpleIcon className="size-3.5" />
							Edit
						</Button>
						<Button
							disabled={isLoading}
							loading={isConfirming}
							onClick={handleConfirm}
							size="sm"
							tone={config.tone}
							type="button"
						>
							<config.ButtonIcon className="size-3.5" weight="bold" />
							{config.confirmLabel}
						</Button>
					</div>
				</div>
			</div>
		</Card>
	);
}
