"use client";

import type { Icon } from "@phosphor-icons/react";
import {
	CalendarIcon,
	CheckIcon,
	CircleNotchIcon,
	NoteIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useChat } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../../types";

interface AnnotationPreviewData {
	text: string;
	annotationType: "point" | "line" | "range";
	xValue: string;
	xEndValue?: string | null;
	color?: string | null;
	tags?: string[];
	isPublic?: boolean;
}

export interface AnnotationPreviewProps extends BaseComponentProps {
	mode: "create" | "update" | "delete";
	annotation: AnnotationPreviewData;
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
		title: "Create Annotation",
		confirmLabel: "Create",
		confirmMessage: "Yes, create it",
		accent: "",
		variant: "default",
		ButtonIcon: CheckIcon,
	},
	update: {
		title: "Update Annotation",
		confirmLabel: "Update",
		confirmMessage: "Yes, update it",
		accent: "border-amber-500/30",
		variant: "default",
		ButtonIcon: CheckIcon,
	},
	delete: {
		title: "Delete Annotation",
		confirmLabel: "Delete",
		confirmMessage: "Yes, delete it",
		accent: "border-destructive/30",
		variant: "destructive",
		ButtonIcon: TrashIcon,
	},
};

function AnnotationTypeLabel({ type }: { type: string }) {
	const labels: Record<string, string> = {
		point: "Point",
		line: "Line",
		range: "Range",
	};
	return (
		<Badge className="text-[10px]" variant="secondary">
			{labels[type] ?? type}
		</Badge>
	);
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
				"gap-0 overflow-hidden border py-0",
				config.accent,
				className
			)}
		>
			<div className="flex items-center gap-2.5 border-b px-3 py-2">
				<div
					className="flex size-6 items-center justify-center rounded"
					style={{
						backgroundColor: annotation.color
							? `${annotation.color}20`
							: "var(--accent)",
					}}
				>
					<NoteIcon
						className="size-3.5"
						style={{ color: annotation.color ?? "var(--muted-foreground)" }}
						weight="duotone"
					/>
				</div>
				<p className="font-medium text-sm">{config.title}</p>
				<AnnotationTypeLabel type={annotation.annotationType} />
			</div>

			<div className="px-3 py-3">
				<div className="space-y-2">
					<div>
						<p className="text-muted-foreground text-xs">Text</p>
						<p className="text-sm">{annotation.text}</p>
					</div>
					<div>
						<p className="mb-1 text-muted-foreground text-xs">Date</p>
						<div className="flex items-center gap-2">
							<CalendarIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
							<span className="text-sm">{dateDisplay}</span>
						</div>
					</div>
					{annotation.tags && annotation.tags.length > 0 && (
						<div>
							<p className="mb-1 text-muted-foreground text-xs">Tags</p>
							<div className="flex flex-wrap gap-1">
								{annotation.tags.map((tag) => (
									<Badge className="text-[10px]" key={tag} variant="outline">
										{tag}
									</Badge>
								))}
							</div>
						</div>
					)}
					{annotation.color && (
						<div className="flex items-center gap-2">
							<p className="text-muted-foreground text-xs">Color</p>
							<div
								className="size-4 rounded border"
								style={{ backgroundColor: annotation.color }}
							/>
						</div>
					)}
					{annotation.isPublic && (
						<p className="text-muted-foreground text-xs">
							This annotation will be visible to all team members
						</p>
					)}
				</div>
			</div>

			<div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-3 py-2">
				<Button
					disabled={isLoading || isConfirming}
					onClick={() => {
						// Annotation editing requires chart context, so just confirm
						console.log("Edit annotation");
					}}
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
	);
}
