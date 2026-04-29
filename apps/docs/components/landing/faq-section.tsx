"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { SectionBullet } from "../icons/section-bullet";

export interface FaqItem {
	answer: string;
	question: string;
}

interface FaqSectionProps {
	className?: string;
	eyebrow?: string;
	items: FaqItem[];
	subtitle?: string;
	title?: string;
}

export function FaqSection({
	eyebrow,
	title = "Frequently asked questions.",
	subtitle,
	items,
	className,
}: FaqSectionProps) {
	return (
		<div className={cn("mx-auto w-full max-w-7xl", className)}>
			<div className="flex flex-col gap-8 lg:flex-row lg:gap-16">
				<div className="lg:sticky lg:top-8 lg:w-80 lg:shrink-0 lg:self-start">
					<div className="flex items-start gap-3">
						<span className="mt-1.5 hidden sm:block">
							<SectionBullet color="#CD5F20" />
						</span>
						<div>
							<h2 className="text-balance font-medium text-2xl tracking-tight sm:text-3xl lg:text-5xl">
								{title}
							</h2>
							{subtitle ? (
								<p className="mt-2 text-pretty text-muted-foreground text-sm sm:text-base">
									{subtitle}
								</p>
							) : null}
						</div>
					</div>
				</div>

				<Accordion className="w-full min-w-0" collapsible type="single">
					{items.map((faq) => (
						<AccordionItem
							className="accordion-item"
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
		</div>
	);
}
