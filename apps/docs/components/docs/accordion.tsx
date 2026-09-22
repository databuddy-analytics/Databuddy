"use client";

import type * as React from "react";
import { cn } from "@databuddy/ui";
import { docsSurface } from "@/components/docs/docs-styles";

function Accordion({
	className,
	children,
	...props
}: React.ComponentProps<"div"> & { collapsible?: boolean; type?: string }) {
	return (
		<div className={cn("w-full", className)} {...props}>
			{children}
		</div>
	);
}

interface AccordionsProps extends React.ComponentProps<"div"> {
	collapsible?: boolean;
	type?: "single" | "multiple";
}

function Accordions({ className, children, ...props }: AccordionsProps) {
	return (
		<div className={cn(docsSurface, className)} {...props}>
			{children}
		</div>
	);
}

export { Accordion, Accordions };
