"use client";

import { ArrowDownIcon } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export function Conversation({ className, ...props }: ConversationProps) {
	return (
		<StickToBottom
			className={cn(
				"relative flex-1 overflow-y-auto",
				"[&_div::-webkit-scrollbar]:hidden [&_div]:[-ms-overflow-style:none] [&_div]:[scrollbar-width:none]",
				className
			)}
			initial="smooth"
			resize="smooth"
			role="log"
			{...props}
		/>
	);
}

export type ConversationContentProps = ComponentProps<
	typeof StickToBottom.Content
>;

export function ConversationContent({
	className,
	...props
}: ConversationContentProps) {
	return <StickToBottom.Content className={cn("p-4", className)} {...props} />;
}

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
	title?: string;
	description?: string;
	icon?: React.ReactNode;
};

export function ConversationEmptyState({
	className,
	title = "No messages yet",
	description = "Start a conversation to see messages here",
	icon,
	children,
	...props
}: ConversationEmptyStateProps) {
	return (
		<div
			className={cn(
				"flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
				className
			)}
			{...props}
		>
			{children ?? (
				<>
					{icon && <div className="text-muted-foreground">{icon}</div>}
					<div className="space-y-1">
						<h3 className="font-medium text-sm">{title}</h3>
						{description && (
							<p className="text-muted-foreground text-sm">{description}</p>
						)}
					</div>
				</>
			)}
		</div>
	);
}

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export function ConversationScrollButton({
	className,
	...props
}: ConversationScrollButtonProps) {
	const { isAtBottom, scrollToBottom } = useStickToBottomContext();

	const handleScrollToBottom = useCallback(() => {
		scrollToBottom();
	}, [scrollToBottom]);

	if (isAtBottom) {
		return null;
	}

	return (
		<Button
			className={cn(
				"-translate-x-1/2 absolute bottom-32 left-1/2",
				"rounded-full bg-sidebar/80 backdrop-blur-lg",
				"border shadow-lg",
				className
			)}
			onClick={handleScrollToBottom}
			size="icon"
			type="button"
			variant="outline"
			{...props}
		>
			<ArrowDownIcon className="size-4" weight="bold" />
		</Button>
	);
}
