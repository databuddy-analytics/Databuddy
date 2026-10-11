"use client";

import { type DragEvent, type ReactNode, useRef, useState } from "react";
import { cn } from "../lib/utils";

interface FileDropState {
	dragging: boolean;
	open: () => void;
}

interface FileDropProps {
	accept?: string;
	children?: (state: FileDropState) => ReactNode;
	className?: string;
	description?: ReactNode;
	disabled?: boolean;
	icon?: ReactNode;
	label: string;
	onFileAction: (file: File) => void;
	title?: ReactNode;
}

function hasFiles(event: DragEvent<HTMLDivElement>): boolean {
	return [...event.dataTransfer.types].includes("Files");
}

export function FileDrop({
	accept,
	children,
	className,
	description,
	disabled = false,
	icon,
	label,
	onFileAction,
	title,
}: FileDropProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const open = () => inputRef.current?.click();

	return (
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: drag and drop only lands on a pointer target; keyboard and screen reader users get the same action through the button and file input inside
		<div
			className={cn(
				"rounded-md transition-[background-color,border-color,box-shadow] duration-(--duration-quick) ease-(--ease-smooth)",
				!children && "border border-dashed bg-secondary/50",
				dragging && "bg-primary/5 ring-2 ring-primary/60",
				disabled && "cursor-not-allowed opacity-50",
				className
			)}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
					setDragging(false);
				}
			}}
			onDragOver={(event) => {
				if (disabled || !hasFiles(event)) {
					return;
				}
				event.preventDefault();
				event.dataTransfer.dropEffect = "copy";
				setDragging(true);
			}}
			onDrop={(event) => {
				if (!hasFiles(event)) {
					return;
				}
				event.preventDefault();
				setDragging(false);
				const file = event.dataTransfer.files.item(0);
				if (file && !disabled) {
					onFileAction(file);
				}
			}}
		>
			<input
				accept={accept}
				aria-label={label}
				className="hidden"
				disabled={disabled}
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) {
						onFileAction(file);
					}
				}}
				ref={inputRef}
				type="file"
			/>
			{children ? (
				children({ dragging, open })
			) : (
				<button
					className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md px-4 py-8 text-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed"
					disabled={disabled}
					onClick={open}
					type="button"
				>
					{icon}
					<span className="font-medium text-foreground text-sm">
						{dragging ? "Drop to add the file" : title}
					</span>
					{description && <span className="text-xs">{description}</span>}
				</button>
			)}
		</div>
	);
}
