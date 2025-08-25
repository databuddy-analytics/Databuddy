import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
	{
		question: 'How is Databuddy different from Google Analytics?',
		answer:
			"Databuddy is built for privacy-first analytics with no cookies required, making it GDPR and CCPA compliant out of the box. Our script is 65x faster than GA4, with a <1KB footprint that won't impact your Core Web Vitals.",
	},
	{
		question: 'Do I need to add cookie consent banners?',
		answer:
			"No. Databuddy's analytics are completely cookieless, using privacy-preserving techniques to provide accurate analytics without tracking individual users. Our customers typically see a 30% increase in conversion rates after removing those intrusive cookie banners.",
	},
	{
		question: "What's included in the free plan?",
		answer:
			"Our free plan includes up to 10,000 monthly events, real-time analytics, basic event tracking, It's perfect for small websites, personal projects, or to test Databuddy before upgrading.",
	},
	{
		question: 'How easy is it to implement Databuddy?',
		answer:
			"Implementation takes less than 5 minutes for most websites. Simply add our lightweight script to your site (we provide easy integrations for Next.js, React, WordPress, Shopify, and more), and you'll start seeing data immediately.",
	},
];

export default function FAQ() {
	return (
		<div className="w-full px-8">
			<div className="space-y-8 lg:space-y-12">
				{/* Header Section */}
				<div className="text-center lg:text-left">
					<h2 className="mx-auto max-w-2xl font-medium text-2xl leading-tight sm:text-3xl lg:mx-0 lg:text-4xl xl:text-5xl">
						Questions we think you might like answers to
					</h2>
				</div>

				{/* FAQ Accordion */}
				<div className="w-full">
					<Accordion className="w-full" collapsible type="single">
						{faqs.map((faq) => (
							<AccordionItem
								className="border-l-4 border-l-transparent bg-background/50 transition-colors duration-200 hover:border-l-primary/20 hover:bg-background/80"
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
