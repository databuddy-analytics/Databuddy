"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export interface FaqItem {
	question: string;
	answer: string;
}

interface FaqSectionProps {
	eyebrow?: string;
	title?: string;
	subtitle?: string;
	items: FaqItem[];
	className?: string;
}

export function FaqSection({
	eyebrow,
	title = "Frequently asked questions.",
	subtitle,
	items,
	className,
}: FaqSectionProps) {
	return (
		<div
			className={cn(
				"mx-auto grid w-full max-w-7xl gap-8 sm:gap-10 lg:grid-cols-12 lg:gap-12 xl:gap-16",
				className
			)}
		>
			<div
				className={cn(
					"lg:col-span-4 lg:pt-1",
					subtitle ? "space-y-2" : undefined
				)}
			>
				{eyebrow ? (
					<p className="mb-2 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest sm:text-[11px]">
						{eyebrow}
					</p>
				) : null}
				<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
					{title}
				</h2>
				{subtitle ? (
					<p className="text-pretty text-muted-foreground text-sm sm:text-base">
						{subtitle}
					</p>
				) : null}
			</div>

			<Accordion className="w-full lg:col-span-8" collapsible type="single">
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
