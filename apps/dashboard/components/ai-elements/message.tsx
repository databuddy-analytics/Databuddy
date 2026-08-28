"use client";

import type { UIMessage } from "ai";
import type { ComponentProps, HTMLAttributes } from "react";
import { memo } from "react";
import {
	Streamdown,
	TableCopyDropdown,
	TableDownloadDropdown,
} from "streamdown";
import {
	MdTable,
	MdTbody,
	MdTd,
	MdTh,
	MdThead,
} from "@/components/ai-elements/markdown-table";
import { cn } from "@/lib/utils";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
	from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
	<div
		className={cn(
			"group flex w-full max-w-[80%] flex-col gap-2",
			from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
			className
		)}
		{...props}
	/>
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
	children,
	className,
	...props
}: MessageContentProps) => (
	<div
		className={cn(
			"flex w-fit flex-col gap-2 overflow-hidden font-medium text-sm leading-relaxed",
			"group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:border group-[.is-user]:border-border/40 group-[.is-user]:bg-muted/30 group-[.is-user]:px-3 group-[.is-user]:py-2 group-[.is-user]:text-foreground",
			"group-[.is-assistant]:text-muted-foreground",
			className
		)}
		{...props}
	>
		{children}
	</div>
);
export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const TABLE_COMPONENTS = {
	table: ({
		children,
		className,
	}: ComponentProps<"table"> & { node?: unknown }) => (
		<div data-streamdown="table-wrapper">
			<div className="flex items-center justify-end gap-1">
				<TableCopyDropdown />
				<TableDownloadDropdown />
			</div>
			<MdTable className={className}>{children}</MdTable>
		</div>
	),
	thead: MdThead,
	th: MdTh,
	tbody: MdTbody,
	td: MdTd,
};

export const MessageResponse = memo(
	({ className, components, ...props }: MessageResponseProps) => (
		<Streamdown
			className={cn(
				"size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
				className
			)}
			components={{ ...TABLE_COMPONENTS, ...components }}
			{...props}
		/>
	),
	(prevProps, nextProps) => prevProps.children === nextProps.children
);

MessageResponse.displayName = "MessageResponse";
