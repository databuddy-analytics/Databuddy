"use client";

import { type ComponentProps, useState } from "react";
import { cn } from "../lib/utils";
import { CheckIcon, CopyIcon } from "./icons";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

type CopyButtonProps = Omit<
	ComponentProps<typeof Button>,
	"children" | "onClick"
> & {
	copiedLabel?: string;
	label?: string;
	onCopy?: () => void;
	timeout?: number;
	value: string;
};

export function CopyButton({
	value,
	label,
	copiedLabel = "Copied",
	onCopy,
	timeout = 2000,
	variant = "ghost",
	size = "sm",
	className,
	...rest
}: CopyButtonProps) {
	const [isCopied, setIsCopied] = useState(false);
	const Icon = isCopied ? CheckIcon : CopyIcon;

	const copyToClipboard = () => {
		if (
			typeof window === "undefined" ||
			!navigator.clipboard?.writeText ||
			!value
		) {
			return;
		}

		navigator.clipboard.writeText(value).then(() => {
			setIsCopied(true);
			onCopy?.();

			if (timeout !== 0) {
				setTimeout(() => {
					setIsCopied(false);
				}, timeout);
			}
		}, console.error);
	};

	if (label) {
		return (
			<Button
				className={className}
				onClick={copyToClipboard}
				size={size}
				variant={variant}
				{...rest}
			>
				<Icon className="size-3.5" />
				{isCopied ? copiedLabel : label}
			</Button>
		);
	}

	return (
		<Tooltip content={isCopied ? copiedLabel : "Copy"}>
			<Button
				aria-label="Copy to clipboard"
				className={cn("aspect-square px-0", className)}
				onClick={copyToClipboard}
				size={size}
				variant={variant}
				{...rest}
			>
				<Icon className="size-3.5" />
			</Button>
		</Tooltip>
	);
}
