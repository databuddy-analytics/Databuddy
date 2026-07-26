"use client";

import { useState } from "react";
import { useChat } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../../types";
import {
	ChatTextIcon,
	CheckCircleIcon,
	PaperPlaneIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Card } from "@databuddy/ui";

const CATEGORY_LABELS: Record<string, string> = {
	bug_report: "Bug report",
	feature_request: "Feature request",
	ux_improvement: "UX improvement",
	performance: "Performance",
	documentation: "Documentation",
	other: "Other",
};

interface FeedbackPreviewData {
	category?: string;
	description: string;
	title: string;
}

export interface FeedbackPreviewProps extends BaseComponentProps {
	feedback: FeedbackPreviewData;
	mode: "offer" | "sent";
}

export function FeedbackPreviewRenderer({
	mode,
	feedback,
	className,
}: FeedbackPreviewProps) {
	const { sendMessage, status } = useChat();
	const [isConfirming, setIsConfirming] = useState(false);

	const isLoading = status === "streaming" || status === "submitted";
	const isSent = mode === "sent";
	const categoryLabel = feedback.category
		? (CATEGORY_LABELS[feedback.category] ?? feedback.category)
		: null;

	const handleSend = () => {
		setIsConfirming(true);
		sendMessage({ text: "Yes, send it" });
		setTimeout(() => setIsConfirming(false), 500);
	};

	return (
		<Card
			className={cn(
				"gap-0 overflow-hidden border-0 bg-secondary p-1",
				className
			)}
		>
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2.5 rounded-md bg-background px-2 py-2">
					<div className="flex size-6 items-center justify-center rounded bg-accent">
						{isSent ? (
							<CheckCircleIcon
								className="size-3.5 text-muted-foreground"
								weight="duotone"
							/>
						) : (
							<ChatTextIcon
								className="size-3.5 text-muted-foreground"
								weight="duotone"
							/>
						)}
					</div>
					<p className="font-medium text-sm">
						{isSent ? "Feedback sent" : "Send feedback to the Databuddy team"}
					</p>
					{categoryLabel && (
						<Badge className="ml-auto rounded text-[10px]" variant="muted">
							{categoryLabel}
						</Badge>
					)}
				</div>

				<div className="rounded-md bg-background px-3 py-3">
					<div className="space-y-2">
						<div>
							<p className="text-muted-foreground text-xs">Title</p>
							<p className="text-sm">{feedback.title}</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">Description</p>
							<p className="mt-0.5 text-pretty text-sm">
								{feedback.description}
							</p>
						</div>
					</div>
				</div>

				{!isSent && (
					<div className="rounded-md bg-background">
						<div className="flex items-center justify-end gap-2 bg-muted/30 px-2 py-2">
							<Button
								disabled={isLoading}
								loading={isConfirming}
								onClick={handleSend}
								size="sm"
							>
								<PaperPlaneIcon className="size-3.5" weight="bold" />
								Send to team
							</Button>
						</div>
					</div>
				)}
			</div>
		</Card>
	);
}
