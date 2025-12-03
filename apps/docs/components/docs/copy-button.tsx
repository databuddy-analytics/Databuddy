"use client";

import { Check, Copy } from "lucide-react";
import { type ButtonHTMLAttributes, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface CopyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	value: string;
}

export function CopyButton({ value, className, ...props }: CopyButtonProps) {
	const [hasCopied, setHasCopied] = useState(false);

	useEffect(() => {
		setTimeout(() => {
			setHasCopied(false);
		}, 2000);
	}, [hasCopied]);

	return (
		<button
			className={cn(
				"relative z-10 inline-flex size-8 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground transition-all hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
				className
			)}
			onClick={() => {
				navigator.clipboard.writeText(value);
				setHasCopied(true);
			}}
			{...props}
		>
			<span className="sr-only">Copy</span>
			{hasCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
		</button>
	);
}
