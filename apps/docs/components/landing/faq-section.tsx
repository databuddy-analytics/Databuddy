"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export interface FaqItem {
	answer: string;
	question: string;
}

interface FaqSectionProps {
	className?: string;
	items: FaqItem[];
	subtitle?: string;
	title?: string;
}

export function FaqSection({
	title = "Frequently asked questions",
	subtitle,
	items,
	className,
}: FaqSectionProps) {
	return (
		<div className={cn("mx-auto w-full max-w-3xl", className)}>
			<div
				className={cn(
					"mb-8 text-center sm:mb-10",
					subtitle ? "space-y-2" : undefined
				)}
			>
				<h2 className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
					{title}
				</h2>
				{subtitle ? (
					<p className="text-pretty text-muted-foreground text-sm sm:text-base">
						{subtitle}
					</p>
				) : null}
			</div>

			<Accordion className="w-full" collapsible type="single">
				{items.map((faq) => (
					<AccordionItem
						className="border-l-4 border-l-transparent bg-background/50 duration-200 hover:border-l-primary/20 hover:bg-background/80"
						key={faq.question}
						value={faq.question}
					>
						<AccordionTrigger className="px-5 py-4 text-left font-normal text-sm hover:no-underline sm:px-6 sm:py-5 sm:text-base">
							{faq.question}
						</AccordionTrigger>
						<AccordionContent className="px-5 pb-4 text-muted-foreground text-sm leading-relaxed sm:px-6 sm:pb-5">
							{faq.answer}
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</div>
	);
}
