import type * as React from "react";
import { SciFiCard } from "@/components/scifi-card";
import { Accordion as BaseAccordion } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export {
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

function Accordion({
	className,
	...props
}: React.ComponentProps<typeof BaseAccordion>) {
	return (
		<BaseAccordion className={cn("w-full space-y-2", className)} {...props} />
	);
}

// Accordions wrapper component
interface AccordionsProps extends React.ComponentProps<"div"> {
	type?: "single" | "multiple";
	collapsible?: boolean;
}

function Accordions({
	className,
	type = "single",
	collapsible = true,
	children,
	...props
}: AccordionsProps) {
	return (
		<SciFiCard
			className={cn(
				"rounded border border-border bg-card/50 backdrop-blur-sm",
				className
			)}
			opacity="reduced"
			{...props}
		>
			<Accordion collapsible={collapsible} type={type}>
				{children}
			</Accordion>
		</SciFiCard>
	);
}

export { Accordion, Accordions };
