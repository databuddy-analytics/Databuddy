import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { homeFaqItems } from "@/lib/home-seo";

export default function FAQ() {
	return (
		<div className="w-full px-8">
			<div className="space-y-8 lg:space-y-12">
				{/* Header Section */}
				<div className="text-center lg:text-left">
					<h2 className="mx-auto max-w-2xl font-medium text-2xl leading-tight sm:text-3xl lg:mx-0 lg:text-4xl xl:text-5xl">
						Frequently asked questions
					</h2>
				</div>

				{/* FAQ Accordion */}
				<div className="w-full">
					<Accordion className="w-full" collapsible type="single">
						{homeFaqItems.map((faq) => (
							<AccordionItem
								className="border-l-4 border-l-transparent bg-background/50 duration-200 hover:border-l-primary/20 hover:bg-background/80"
								key={faq.question}
								value={faq.question}
							>
								<AccordionTrigger className="px-8 py-4 text-left font-normal text-base hover:no-underline sm:py-6 sm:text-lg lg:text-xl">
									{faq.question}
								</AccordionTrigger>
								<AccordionContent className="px-8 pb-4 text-muted-foreground text-sm leading-relaxed sm:pb-6 sm:text-base">
									{faq.answer}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</div>
		</div>
	);
}
