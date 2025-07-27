import { HelpCircle } from 'lucide-react';

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
			"Our free plan includes up to 50,000 monthly pageviews, real-time analytics, basic event tracking, and 30-day data retention. It's perfect for small websites, personal projects, or to test Databuddy before upgrading.",
	},
	{
		question: 'How easy is it to implement Databuddy?',
		answer:
			"Implementation takes less than 5 minutes for most websites. Simply add our lightweight script to your site (we provide easy integrations for Next.js, React, WordPress, Shopify, and more), and you'll start seeing data immediately.",
	},
];

export default function FAQ() {
	return (
		<div className="-pr-2 relative mx-auto rounded-none border-border bg-background/95 font-geist md:w-10/12 md:border-[1.2px] md:border-b-0 md:border-l-0">
			<div className="w-full md:mx-0">
				{/* FAQ Header */}
				<div className="border-border border-t-[1.2px] border-l-[1.2px] p-10 pb-2 md:border-t-0">
					<div className="my-1 flex items-center gap-2">
						<HelpCircle className="h-4 w-4 text-muted-foreground" />
						<p className="text-muted-foreground">Frequently Asked Questions</p>
					</div>
					<div className="mt-2">
						<div className="max-w-full">
							<div className="flex gap-3">
								<p className="max-w-lg font-normal text-foreground text-xl tracking-tighter md:text-2xl">
									Everything you need to know about Databuddy
								</p>
							</div>
						</div>
						<p className="mt-2 text-left text-muted-foreground text-sm">
							Can't find the answer you're looking for? Reach out to our team
							and we'll get back to you within 24 hours.
						</p>
					</div>
				</div>

				{/* FAQ Grid */}
				<div className="grid grid-cols-1 border-border border-b-[1.2px] md:grid-cols-2">
					{faqs.map((faq, index) => (
						<div
							className="group border-border border-t-[1.2px] border-l-[1.2px] p-8 transition-colors hover:bg-muted/30"
							key={faq.question}
						>
							<div className="mb-4">
								<h3 className="font-medium text-base text-foreground leading-tight transition-colors group-hover:text-primary">
									{faq.question}
								</h3>
							</div>
							<p className="text-muted-foreground text-sm leading-relaxed">
								{faq.answer}
							</p>
							<div className="mt-4 border-border/50 border-t pt-4">
								<span className="text-muted-foreground text-xs">
									Question {index + 1} of {faqs.length}
								</span>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
